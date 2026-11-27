//! HTTP fetch helpers for public social profile pages.

use std::{process::Stdio, time::Duration};

use reqwest::Client;
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
};

use super::parse_linkedin::{is_linkedin_authwall, parse_linkedin};
use super::parse_x::parse_x;
use super::tor::Tor;
use super::types::NewsFeed;

const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_SCRIPT: &str = include_str!("browser.cjs");

/// Outbound fetch client for news sources.
#[derive(Clone)]
pub struct NewsFetcher {
    http: Client,
    linkedin_li_at: Option<String>,
    fetch_limit: usize,
}

impl Default for NewsFetcher {
    fn default() -> Self {
        Self::from_env()
    }
}

impl NewsFetcher {
    pub const fn fetch_limit(&self) -> usize {
        self.fetch_limit
    }

    /// Build from environment (`LINKEDIN_LI_AT`, `NEWS_FETCH_LIMIT`).
    #[must_use]
    pub fn from_env() -> Self {
        let linkedin_li_at = std::env::var("LINKEDIN_LI_AT")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let fetch_limit = std::env::var("NEWS_FETCH_LIMIT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8);
        let http = Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .timeout(Duration::from_secs(25))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            http,
            linkedin_li_at,
            fetch_limit,
        }
    }

    /// Fetch and parse ITC company `LinkedIn` posts.
    pub async fn fetch_itc_linkedin(&self) -> NewsFeed {
        let profile_url: String =
            "https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all".into();
        let fetch_url = "https://www.linkedin.com/company/interchouette-itc";
        match self.fetch_linkedin_html(fetch_url).await {
            Ok(html) => {
                let feed = linkedin_feed(&html, profile_url, self.fetch_limit);
                if feed.error.is_none() {
                    tracing::info!(posts = feed.items.len(), "LinkedIn refresh succeeded");
                }
                feed
            }
            Err(err) => NewsFeed {
                items: vec![],
                profile_url,
                error: Some(err),
            },
        }
    }

    /// Fetch and parse the ITC X timeline (pinned tweet skipped by parser).
    pub async fn fetch_itc_x(&self) -> NewsFeed {
        let profile_url: String = "https://x.com/interchouette".into();
        match self.fetch_html(&profile_url).await {
            Ok(html) => {
                let items = parse_x(&html, &profile_url, self.fetch_limit);
                if items.is_empty() {
                    return NewsFeed {
                        items,
                        profile_url,
                        error: Some("X timeline could not be parsed".into()),
                    };
                }
                NewsFeed {
                    items,
                    profile_url,
                    error: None,
                }
            }
            Err(err) => NewsFeed {
                items: vec![],
                profile_url,
                error: Some(err),
            },
        }
    }

    async fn fetch_linkedin_html(&self, url: &str) -> Result<String, String> {
        tracing::info!("starting fresh Tor for LinkedIn refresh");
        let mut tor = Tor::start().await?;
        tracing::info!("Tor bootstrapped for LinkedIn refresh");
        let result = self.fetch_with_browser(url, tor.socks_addr()).await;
        match (result, tor.stop().await) {
            (result, Ok(())) => result,
            (Ok(_), Err(err)) => Err(err),
            (Err(fetch_err), Err(stop_err)) => Err(format!("{fetch_err}; {stop_err}")),
        }
    }

    async fn fetch_with_browser(
        &self,
        url: &str,
        socks_addr: std::net::SocketAddr,
    ) -> Result<String, String> {
        let display = std::env::var_os("DISPLAY").filter(|value| !value.is_empty());
        let virtual_display = display.is_none();
        tracing::info!(
            virtual_display,
            "starting Puppeteer for LinkedIn through Tor"
        );
        let mut command = if display.is_some() {
            Command::new("node")
        } else {
            let mut command = Command::new("xvfb-run");
            command.args(["-a", "node"]);
            command
        };
        command.env_clear();
        for key in [
            "PATH",
            "HOME",
            "DISPLAY",
            "XAUTHORITY",
            "XDG_RUNTIME_DIR",
            "WAYLAND_DISPLAY",
            "PUPPETEER_EXECUTABLE_PATH",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        command.env("NEWS_BROWSER_MODULE_DIR", env!("CARGO_MANIFEST_DIR"));
        let input = serde_json::to_vec(&serde_json::json!({
            "url": url,
            "socksAddr": socks_addr.to_string(),
            "cookie": self.linkedin_li_at,
        }))
        .map_err(|err| format!("LinkedIn browser input failed: {err}"))?;
        let mut child = command
            .args(["-e", BROWSER_SCRIPT])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|err| format!("LinkedIn browser start failed: {err}"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "LinkedIn browser stderr unavailable".to_string())?;
        let stderr_task = tokio::spawn(Self::collect_browser_stderr(BufReader::new(stderr)));
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "LinkedIn browser stdin unavailable".to_string())?;
        stdin
            .write_all(&input)
            .await
            .map_err(|err| format!("LinkedIn browser input failed: {err}"))?;
        drop(stdin);
        let output = child.wait_with_output().await;
        let stderr = stderr_task
            .await
            .map_err(|err| format!("LinkedIn browser log task failed: {err}"))??;
        let output = output.map_err(|err| format!("LinkedIn browser process failed: {err}"))?;
        if !output.status.success() {
            return Err(format!(
                "LinkedIn browser exited with {}: {}",
                output.status,
                stderr.trim()
            ));
        }
        String::from_utf8(output.stdout)
            .map_err(|err| format!("LinkedIn browser returned invalid UTF-8: {err}"))
    }

    async fn collect_browser_stderr<R: AsyncBufRead + Unpin>(reader: R) -> Result<String, String> {
        let mut lines = reader.lines();
        let mut errors = String::new();
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|err| format!("LinkedIn browser log read failed: {err}"))?
        {
            if let Some(message) = line.strip_prefix("Puppeteer: ") {
                tracing::info!(message, "LinkedIn Puppeteer");
            } else {
                if !errors.is_empty() {
                    errors.push('\n');
                }
                errors.push_str(&line);
            }
        }
        Ok(errors)
    }

    async fn fetch_html(&self, url: &str) -> Result<String, String> {
        let resp = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|err| format!("fetch failed: {err}"))?;
        if !resp.status().is_success() {
            tracing::warn!(
                host = resp.url().host_str().unwrap_or(""),
                path = resp.url().path(),
                status = %resp.status(),
                "news upstream rejected request"
            );
            return Err(format!("fetch returned HTTP {}", resp.status()));
        }
        resp.text()
            .await
            .map_err(|err| format!("read body failed: {err}"))
    }
}

fn linkedin_feed(html: &str, profile_url: String, limit: usize) -> NewsFeed {
    let error = if is_linkedin_authwall(html) {
        Some("LinkedIn session expired or unavailable".into())
    } else {
        None
    };
    let items = if error.is_none() {
        parse_linkedin(html, &profile_url, limit)
    } else {
        Vec::new()
    };
    let error = error.or_else(|| {
        items
            .is_empty()
            .then(|| "LinkedIn posts could not be parsed".into())
    });
    NewsFeed {
        items,
        profile_url,
        error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn browser_progress_is_separate_from_failure_details() {
        let logs = b"Puppeteer: Chromium launched\nPuppeteer: LinkedIn navigation HTTP 403\nLinkedIn browser fetch failed: blocked\n";
        let errors = NewsFetcher::collect_browser_stderr(BufReader::new(&logs[..]))
            .await
            .expect("read browser logs");
        assert_eq!(errors, "LinkedIn browser fetch failed: blocked");
    }

    #[test]
    fn linkedin_empty_or_authwall_page_reports_failure() {
        let profile = "https://www.linkedin.com/company/interchouette-itc".to_string();
        let empty = linkedin_feed("<html></html>", profile.clone(), 8);
        assert_eq!(
            empty.error.as_deref(),
            Some("LinkedIn posts could not be parsed")
        );
        let authwall = linkedin_feed(include_str!("fixtures/linkedin_authwall.html"), profile, 8);
        assert_eq!(
            authwall.error.as_deref(),
            Some("LinkedIn session expired or unavailable")
        );
    }

    #[test]
    fn linkedin_company_page_returns_posts() {
        let feed = linkedin_feed(
            include_str!("fixtures/linkedin_itc_company.html"),
            "https://www.linkedin.com/company/interchouette-itc".into(),
            8,
        );
        assert_eq!(feed.items.len(), 1);
        assert!(feed.error.is_none());
    }
}
