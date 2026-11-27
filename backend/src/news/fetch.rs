//! HTTP fetch helpers for public social profile pages.

use std::{net::SocketAddr, time::Duration};

use reqwest::Client;

use super::parse_linkedin::{is_linkedin_authwall, parse_linkedin};
use super::parse_x::parse_x;
use super::tor::Tor;
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
    pub fn fetch_limit(&self) -> usize {
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
        let fetch_url = "https://fr.linkedin.com/company/interchouette-itc";
        match self.fetch_linkedin_html(fetch_url).await {
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
            .fetch_html(&self.http, &profile_url, false, BROWSER_USER_AGENT)
            .await
        {
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
        let mut tor = Tor::start().await?;
        let result = async {
            let http = Self::tor_http_client(tor.socks_addr())?;
            self.fetch_html(&http, url, true, BROWSER_USER_AGENT).await
        }
        .await;
        match (result, tor.stop().await) {
            (result, Ok(())) => result,
            (Ok(_), Err(err)) => Err(err),
            (Err(fetch_err), Err(stop_err)) => Err(format!("{fetch_err}; {stop_err}")),
        }
    }

    fn tor_http_client(socks_addr: SocketAddr) -> Result<Client, String> {
        let proxy = reqwest::Proxy::all(format!("socks5h://{socks_addr}"))
            .map_err(|err| format!("Tor proxy configuration failed: {err}"))?;
        Client::builder()
            .no_proxy()
            .proxy(proxy)
            .user_agent(BROWSER_USER_AGENT)
            .timeout(Duration::from_secs(25))
            .build()
            .map_err(|err| format!("Tor HTTP client creation failed: {err}"))
    }

    async fn fetch_html(
        &self,
        http: &Client,
        url: &str,
        linkedin: bool,
        user_agent: &str,
    ) -> Result<String, String> {
        let mut req = http.get(url).header("User-Agent", user_agent);
        if linkedin {
            req = req
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
                .header("Sec-Fetch-Dest", "document")
                .header("Sec-Fetch-Mode", "navigate")
                .header("Sec-Fetch-Site", "none")
                .header("Upgrade-Insecure-Requests", "1");
            if let Some(token) = &self.linkedin_li_at {
                req = req.header("Cookie", format!("li_at={token}"));
            }
        }
        let resp = req
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

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    use super::*;

    #[tokio::test]
    async fn linkedin_client_sends_hostname_and_request_through_socks() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut handshake = [0; 3];
            stream.read_exact(&mut handshake).unwrap();
            assert_eq!(handshake, [5, 1, 0]);
            stream.write_all(&[5, 0]).unwrap();

            let mut request = [0; 5];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request[..4], &[5, 1, 0, 3]);
            let mut host_and_port = vec![0; usize::from(request[4]) + 2];
            stream.read_exact(&mut host_and_port).unwrap();
            assert_eq!(&host_and_port[..host_and_port.len() - 2], b"news.invalid");
            stream
                .write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 80])
                .unwrap();

            let mut http = [0; 2048];
            let count = stream.read(&mut http).unwrap();
            assert!(http[..count].starts_with(b"GET /company HTTP/1.1\r\n"));
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
                .unwrap();
        });
        let fetcher = NewsFetcher {
            http: Client::new(),
            linkedin_li_at: None,
            fetch_limit: 8,
        };
        let http = NewsFetcher::tor_http_client(addr).unwrap();
        let body = fetcher
            .fetch_html(
                &http,
                "http://news.invalid/company",
                true,
                BROWSER_USER_AGENT,
            )
            .await
            .unwrap();
        assert_eq!(body, "ok");
        server.join().unwrap();
    }
}
