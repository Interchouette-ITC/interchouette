//! In-memory chat sessions (no SQLite).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::chat::presence::PresenceMode;

/// One active visitor session.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    /// Opaque resume code for Slack / support (`IC-A3F9K2M7`). Not shown in the visitor UI.
    pub short_code: String,
    pub mode: PresenceMode,
    pub visitor_email: Option<String>,
    pub created_at: i64,
    /// Slack DM channel id (`D…`).
    pub slack_channel: Option<String>,
    /// Parent message `ts` for the session thread.
    pub slack_thread_ts: Option<String>,
}

/// Registry of live sessions keyed by id, resume code, and Slack thread ts.
#[derive(Clone, Default)]
pub struct SessionRegistry {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    codes: Arc<RwLock<HashMap<String, String>>>,
    threads: Arc<RwLock<HashMap<String, String>>>,
}

impl SessionRegistry {
    /// Create a session for the current presence mode.
    pub async fn create(&self, mode: PresenceMode) -> Session {
        let id = Uuid::new_v4().to_string();
        let short_code = new_resume_code();
        let session = Session {
            id: id.clone(),
            short_code: short_code.clone(),
            mode,
            visitor_email: None,
            created_at: now_secs(),
            slack_channel: None,
            slack_thread_ts: None,
        };
        self.sessions
            .write()
            .await
            .insert(id.clone(), session.clone());
        self.codes.write().await.insert(short_code, id);
        session
    }

    /// Get by session id.
    pub async fn get(&self, id: &str) -> Option<Session> {
        self.sessions.read().await.get(id).cloned()
    }

    /// Get by resume code (`IC-…` or legacy `S-…`).
    pub async fn get_by_code(&self, code: &str) -> Option<Session> {
        let code = code.trim().to_ascii_uppercase();
        let id = self.codes.read().await.get(&code)?.clone();
        self.get(&id).await
    }

    /// Get by Slack thread parent ts.
    pub async fn get_by_thread(&self, thread_ts: &str) -> Option<Session> {
        let id = self.threads.read().await.get(thread_ts)?.clone();
        self.get(&id).await
    }

    /// Bind Slack DM channel + thread parent ts.
    pub async fn set_slack_thread(&self, id: &str, channel: String, thread_ts: String) {
        if let Some(s) = self.sessions.write().await.get_mut(id) {
            s.slack_channel = Some(channel);
            s.slack_thread_ts = Some(thread_ts.clone());
        }
        self.threads.write().await.insert(thread_ts, id.to_string());
    }

    /// Optional email capture.
    pub async fn set_email(&self, id: &str, email: String) {
        if let Some(s) = self.sessions.write().await.get_mut(id) {
            s.visitor_email = Some(email);
        }
    }
}

/// `IC-` + 8 unambiguous alphanumerics (no 0/O/1/I).
fn new_resume_code() -> String {
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let uuid = Uuid::new_v4();
    let mut out = String::from("IC-");
    for byte in uuid.as_bytes().iter().take(8) {
        let idx = usize::from(byte % 32);
        out.push(char::from(ALPHABET[idx]));
    }
    out
}

fn now_secs() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs()),
    )
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn create_and_lookup() {
        let reg = SessionRegistry::default();
        let s = reg.create(PresenceMode::Away).await;
        assert!(s.short_code.starts_with("IC-"));
        assert_eq!(s.short_code.len(), 11);
        assert_eq!(reg.get(&s.id).await.unwrap().short_code, s.short_code);
        assert_eq!(reg.get_by_code(&s.short_code).await.unwrap().id, s.id);
        reg.set_slack_thread(&s.id, "D123".into(), "171.001".into())
            .await;
        assert_eq!(reg.get_by_thread("171.001").await.unwrap().id, s.id);
    }
}
