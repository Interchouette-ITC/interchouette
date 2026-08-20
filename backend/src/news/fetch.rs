//! HTTP fetch helpers for public social profile pages.

use std::time::Duration;

use reqwest::Client;

use super::parse_linkedin::{is_linkedin_authwall, parse_linkedin};
use super::parse_x::parse_x;
use super::types::NewsFeed;

const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
        let fetch_url = profile_url.clone();
        match self.fetch_html(&fetch_url, true, BROWSER_USER_AGENT).await {
            Ok(html) => {
                if is_linkedin_authwall(&html) {
                    return NewsFeed {
                        items: vec![],
                        profile_url,
                        error: Some("LinkedIn session expired or unavailable".into()),
                    };
                }
                let items = parse_linkedin(&html, &profile_url, self.fetch_limit);
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

    /// Fetch and parse the ITC X timeline (pinned tweet skipped by parser).
    pub async fn fetch_itc_x(&self) -> NewsFeed {
        let profile_url: String = "https://x.com/interchouette".into();
        match self
            .fetch_html(&profile_url, false, BROWSER_USER_AGENT)
            .await
        {
            Ok(html) => {
                let items = parse_x(&html, &profile_url, self.fetch_limit);
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

    async fn fetch_html(
        &self,
        url: &str,
        linkedin: bool,
        user_agent: &str,
    ) -> Result<String, String> {
        let mut req = self.http.get(url).header("User-Agent", user_agent);
        if linkedin {
            if let Some(token) = &self.linkedin_li_at {
                req = req.header("Cookie", format!("li_at={token}"));
            }
        }
        let resp = req
            .send()
            .await
            .map_err(|err| format!("fetch failed: {err}"))?;
        if !resp.status().is_success() {
            return Err(format!("fetch returned HTTP {}", resp.status()));
        }
        resp.text()
            .await
            .map_err(|err| format!("read body failed: {err}"))
    }
}
