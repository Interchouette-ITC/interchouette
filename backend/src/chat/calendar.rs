//! Google Calendar API v3: freebusy query and event creation as Greg.
//!
//! Auth model: offline OAuth 2.0 refresh token stored in env vars. The chat
//! service never asks the visitor to sign in. Greg consents once during setup.
//!
//! Env vars required to enable:
//!   `GCAL_CLIENT_ID`      - OAuth 2.0 Web client id
//!   `GCAL_CLIENT_SECRET`  - OAuth 2.0 client secret
//!   `GCAL_REFRESH_TOKEN`  - Greg's offline refresh token (from one-time consent)
//!   `GCAL_CALENDAR_ID`    - target calendar, usually "primary"

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::RwLock;

const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const FREEBUSY_ENDPOINT: &str = "https://www.googleapis.com/calendar/v3/freeBusy";
const EVENTS_ENDPOINT: &str = "https://www.googleapis.com/calendar/v3/calendars/{id}/events";

/// A meeting request extracted from an `ITCy` conversation.
///
/// Start, end, and timezone are all provided by the LLM/visitor - the backend
/// does not hardcode slot duration or timezone. Google Calendar's own configuration
/// (Appointment schedule duration, timezone) is what drives these values.
#[derive(Debug, Clone)]
pub struct BookingRequest {
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    /// ISO 8601 start datetime, no UTC offset (e.g. "2026-08-25T14:00:00").
    pub start: String,
    /// ISO 8601 end datetime, no UTC offset (e.g. "2026-08-25T14:30:00").
    pub end: String,
    /// IANA timezone name (e.g. "Europe/Amsterdam").
    pub timezone: String,
}

/// Result of a calendar write.
#[derive(Debug)]
pub struct BookingConfirmation {
    pub event_id: String,
    pub html_link: String,
}

/// Cached access token with an expiry guard.
#[derive(Clone, Default)]
struct TokenCache {
    access_token: String,
    /// Unix seconds when the token expires.
    expires_at: u64,
}

/// Google Calendar client backed by an OAuth 2.0 refresh token.
#[derive(Clone)]
pub struct CalendarClient {
    inner: Option<Arc<CalendarInner>>,
}

struct CalendarInner {
    client_id: String,
    client_secret: String,
    refresh_token: String,
    calendar_id: String,
    http: reqwest::Client,
    token: Arc<RwLock<TokenCache>>,
}

impl CalendarClient {
    /// Construct from env vars. Returns a disabled client when any var is missing.
    #[must_use]
    pub fn from_env() -> Self {
        let get = |k: &str| std::env::var(k).ok().filter(|s| !s.is_empty());
        let (Some(client_id), Some(client_secret), Some(refresh_token)) = (
            get("GCAL_CLIENT_ID"),
            get("GCAL_CLIENT_SECRET"),
            get("GCAL_REFRESH_TOKEN"),
        ) else {
            tracing::info!("CalendarClient disabled (GCAL_CLIENT_ID/SECRET/REFRESH_TOKEN missing)");
            return Self { inner: None };
        };
        let calendar_id = get("GCAL_CALENDAR_ID").unwrap_or_else(|| "primary".into());
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default();
        tracing::info!(calendar_id = %calendar_id, "CalendarClient enabled");
        Self {
            inner: Some(Arc::new(CalendarInner {
                client_id,
                client_secret,
                refresh_token,
                calendar_id,
                http,
                token: Arc::default(),
            })),
        }
    }

    /// Returns `true` when the Calendar API is configured.
    #[must_use]
    pub const fn enabled(&self) -> bool {
        self.inner.is_some()
    }

    /// Query free windows around the requested slot.
    ///
    /// Returns a list of busy intervals for the calendar in `[time_min, time_max)`.
    /// An empty list means the slot is free.
    ///
    /// # Errors
    /// Returns an error if the Calendar API call fails or the client is not configured.
    pub async fn busy_intervals(
        &self,
        time_min: &str,
        time_max: &str,
    ) -> anyhow::Result<Vec<BusyInterval>> {
        let inner = self
            .inner
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("CalendarClient not configured"))?;
        let token = self.access_token().await?;
        let body = json!({
            "timeMin": time_min,
            "timeMax": time_max,
            "items": [{ "id": inner.calendar_id }]
        });
        let freebusy_raw = inner
            .http
            .post(FREEBUSY_ENDPOINT)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;
        if !freebusy_raw.status().is_success() {
            let status = freebusy_raw.status();
            let body_text = freebusy_raw.text().await.unwrap_or_default();
            anyhow::bail!("freebusy.query failed {status}: {body_text}");
        }
        let resp = freebusy_raw.json::<FreeBusyResponse>().await?;
        let busy = resp
            .calendars
            .get(&inner.calendar_id)
            .map(|c| c.busy.clone())
            .unwrap_or_default();
        Ok(busy)
    }

    /// Create a calendar event as Greg with the visitor as the sole attendee.
    ///
    /// # Errors
    /// Returns an error if the Calendar API call fails, the token refresh fails, or the client
    /// is not configured.
    pub async fn insert_event(&self, req: &BookingRequest) -> anyhow::Result<BookingConfirmation> {
        let inner = self
            .inner
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("CalendarClient not configured"))?;
        let token = self.access_token().await?;
        let url = EVENTS_ENDPOINT.replace("{id}", &inner.calendar_id);
        let body = json!({
            "summary": format!("Meeting with {} {}", req.first_name, req.last_name),
            "start": { "dateTime": req.start, "timeZone": req.timezone },
            "end":   { "dateTime": req.end,   "timeZone": req.timezone },
            "attendees": [{
                "email":       req.email,
                "displayName": format!("{} {}", req.first_name, req.last_name),
            }],
            "sendUpdates": "all"
        });
        // Append sendUpdates as a query param in the URL directly.
        let url_with_params = format!("{url}?sendUpdates=all");
        let resp_raw = inner
            .http
            .post(&url_with_params)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;
        if !resp_raw.status().is_success() {
            let status = resp_raw.status();
            let body_text = resp_raw.text().await.unwrap_or_default();
            anyhow::bail!("Calendar events.insert failed {status}: {body_text}");
        }
        let resp = resp_raw.json::<EventInsertResponse>().await?;
        Ok(BookingConfirmation {
            event_id: resp.id,
            html_link: resp.html_link,
        })
    }

    /// Return a fresh (or cached) access token.
    async fn access_token(&self) -> anyhow::Result<String> {
        let inner = self
            .inner
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("CalendarClient not configured"))?;
        let now = unix_now();
        {
            let cache = inner.token.read().await;
            if !cache.access_token.is_empty() && cache.expires_at > now + 60 {
                return Ok(cache.access_token.clone());
            }
        }
        let token_raw = inner
            .http
            .post(TOKEN_ENDPOINT)
            .form(&[
                ("client_id", inner.client_id.as_str()),
                ("client_secret", inner.client_secret.as_str()),
                ("refresh_token", inner.refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await?;
        if !token_raw.status().is_success() {
            let status = token_raw.status();
            let body_text = token_raw.text().await.unwrap_or_default();
            anyhow::bail!("OAuth token refresh failed {status}: {body_text}");
        }
        let resp = token_raw.json::<TokenResponse>().await?;
        let token = resp.access_token.clone();
        let expires_at = now + u64::from(resp.expires_in.saturating_sub(30));
        *inner.token.write().await = TokenCache {
            access_token: resp.access_token,
            expires_at,
        };
        Ok(token)
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ---- API response shapes ----

#[derive(Debug, Deserialize)]
struct FreeBusyResponse {
    calendars: std::collections::HashMap<String, CalendarBusy>,
}

#[derive(Debug, Deserialize)]
struct CalendarBusy {
    busy: Vec<BusyInterval>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BusyInterval {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u32,
}

#[derive(Debug, Deserialize)]
struct EventInsertResponse {
    id: String,
    #[serde(rename = "htmlLink")]
    html_link: String,
}

// ---- Booking intent extraction ----

/// Signal emitted by the LLM inside its reply when booking details are complete.
///
/// Format: `[[BOOKING: first=...|last=...|email=...|start=...|end=...|tz=...]]`
///
/// The LLM provides start, end, and timezone directly from the visitor-confirmed slot.
/// The backend strips this tag from the visible reply and triggers the calendar write.
const BOOKING_TAG_PREFIX: &str = "[[BOOKING:";
const BOOKING_TAG_SUFFIX: &str = "]]";

/// Extract a `BookingRequest` from the LLM reply if it contains a booking tag.
/// Returns `None` if the tag is absent or any required field is missing.
#[must_use]
pub fn extract_booking_tag(reply: &str) -> Option<BookingRequest> {
    let tag_start = reply.find(BOOKING_TAG_PREFIX)?;
    let inner_start = tag_start + BOOKING_TAG_PREFIX.len();
    let inner_end = reply[inner_start..].find(BOOKING_TAG_SUFFIX)? + inner_start;
    let inner = reply[inner_start..inner_end].trim();
    let mut first = None::<String>;
    let mut last = None::<String>;
    let mut email = None::<String>;
    let mut start = None::<String>;
    let mut end = None::<String>;
    let mut tz = None::<String>;
    for part in inner.split('|') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix("first=") {
            first = Some(v.trim().to_string());
        } else if let Some(v) = part.strip_prefix("last=") {
            last = Some(v.trim().to_string());
        } else if let Some(v) = part.strip_prefix("email=") {
            email = Some(v.trim().to_string());
        } else if let Some(v) = part.strip_prefix("start=") {
            start = Some(v.trim().to_string());
        } else if let Some(v) = part.strip_prefix("end=") {
            end = Some(v.trim().to_string());
        } else if let Some(v) = part.strip_prefix("tz=") {
            tz = Some(v.trim().to_string());
        }
    }
    Some(BookingRequest {
        first_name: first.filter(|s| !s.is_empty())?,
        last_name: last.filter(|s| !s.is_empty())?,
        email: email.filter(|s| !s.is_empty())?,
        start: start.filter(|s| !s.is_empty())?,
        end: end.filter(|s| !s.is_empty())?,
        timezone: tz.filter(|s| !s.is_empty())?,
    })
}

/// Strip the booking tag from the LLM reply so the visitor never sees the raw tag.
#[must_use]
pub fn strip_booking_tag(reply: &str) -> String {
    let Some(start) = reply.find(BOOKING_TAG_PREFIX) else {
        return reply.to_string();
    };
    let inner_start = start + BOOKING_TAG_PREFIX.len();
    let Some(rel_end) = reply[inner_start..].find(BOOKING_TAG_SUFFIX) else {
        return reply.to_string();
    };
    let end = inner_start + rel_end + BOOKING_TAG_SUFFIX.len();
    let before = reply[..start].trim_end();
    let after = reply[end..].trim_start();
    if before.is_empty() {
        after.to_string()
    } else if after.is_empty() {
        before.to_string()
    } else {
        format!("{before} {after}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_booking_tag_full() {
        let reply = "Great, let me book that.\n\
            [[BOOKING: first=Alice|last=Smith|email=alice@example.com|start=2026-08-25T14:00:00|end=2026-08-25T14:30:00|tz=Europe/Amsterdam]]\n\
            I will confirm once done.";
        let req = extract_booking_tag(reply).unwrap();
        assert_eq!(req.first_name, "Alice");
        assert_eq!(req.last_name, "Smith");
        assert_eq!(req.email, "alice@example.com");
        assert_eq!(req.start, "2026-08-25T14:00:00");
        assert_eq!(req.end, "2026-08-25T14:30:00");
        assert_eq!(req.timezone, "Europe/Amsterdam");
    }

    #[test]
    fn test_extract_booking_tag_missing_field() {
        // Missing end field - should return None.
        let reply = "[[BOOKING: first=Alice|last=Smith|email=alice@example.com|start=2026-08-25T14:00:00|tz=Europe/Amsterdam]]";
        assert!(extract_booking_tag(reply).is_none());
    }

    #[test]
    fn test_extract_booking_tag_missing() {
        assert!(extract_booking_tag("no tag here").is_none());
    }

    #[test]
    fn test_strip_booking_tag_middle() {
        let reply = "Great. [[BOOKING: first=A|last=B|email=c@d.com|start=2026-01-01T10:00:00|end=2026-01-01T10:30:00|tz=Europe/Amsterdam]] I will confirm.";
        assert_eq!(strip_booking_tag(reply), "Great. I will confirm.");
    }

    #[test]
    fn test_strip_booking_tag_none() {
        assert_eq!(strip_booking_tag("hello"), "hello");
    }
}
