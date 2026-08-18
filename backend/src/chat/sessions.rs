//! In-memory chat sessions (no `SQLite`).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::chat::locale::ChatLocale;
use crate::chat::presence::PresenceMode;

/// One chat line retained for WebSocket replay.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatLine {
    pub id: String,
    pub role: String,
    pub text: String,
}

/// One active visitor session.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    /// Opaque ticket code (`A3F9K2M7`). Shown in the visitor header.
    pub short_code: String,
    pub mode: PresenceMode,
    pub locale: ChatLocale,
    pub visitor_email: Option<String>,
    pub created_at: i64,
    /// Slack DM channel id (`D…`).
    pub slack_channel: Option<String>,
    /// Parent message `ts` for the session thread.
    pub slack_thread_ts: Option<String>,
    /// In-memory transcript (replay after reconnect; not persisted across restarts).
    pub lines: Vec<ChatLine>,
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
    pub async fn create(&self, mode: PresenceMode, locale: ChatLocale) -> Session {
        let id = Uuid::new_v4().to_string();
        let short_code = new_resume_code();
        let session = Session {
            id: id.clone(),
            short_code: short_code.clone(),
            mode,
            locale,
            visitor_email: None,
            created_at: now_secs(),
            slack_channel: None,
            slack_thread_ts: None,
            lines: Vec::new(),
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

    /// Get by ticket code (8 alnum; a leftover `IC-` prefix is ignored).
    pub async fn get_by_code(&self, code: &str) -> Option<Session> {
        let code = normalize_lookup_code(code);
        let id = self.codes.read().await.get(&code)?.clone();
        self.get(&id).await
    }

    /// Get by Slack thread parent ts.
    pub async fn get_by_thread(&self, thread_ts: &str) -> Option<Session> {
        let id = self.threads.read().await.get(thread_ts)?.clone();
        self.get(&id).await
    }

    /// Append one line to the session transcript. Returns `false` when the id is already stored.
    pub async fn push_line(&self, id: &str, line: ChatLine) -> bool {
        let mut map = self.sessions.write().await;
        let Some(s) = map.get_mut(id) else {
            return false;
        };
        if s.lines.iter().any(|existing| existing.id == line.id) {
            return false;
        }
        s.lines.push(line);
        true
    }

    /// Sessions that already have a Slack thread (for reply polling).
    pub async fn slack_threads(&self) -> Vec<(String, String, String)> {
        self.sessions
            .read()
            .await
            .values()
            .filter_map(|s| {
                Some((
                    s.id.clone(),
                    s.slack_channel.clone()?,
                    s.slack_thread_ts.clone()?,
                ))
            })
            .collect()
    }

    /// Copy transcript lines for replay on WebSocket connect.
    pub async fn lines(&self, id: &str) -> Vec<ChatLine> {
        self.sessions
            .read()
            .await
            .get(id)
            .map(|s| s.lines.clone())
            .unwrap_or_default()
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

    /// Update presence mode for one session. Returns `true` when it changed.
    pub async fn set_mode(&self, id: &str, mode: PresenceMode) -> bool {
        let mut map = self.sessions.write().await;
        let Some(s) = map.get_mut(id) else {
            return false;
        };
        if s.mode == mode {
            return false;
        }
        s.mode = mode;
        drop(map);
        true
    }

    /// Apply presence to every live session. Returns ids whose mode changed.
    pub async fn set_all_modes(&self, mode: PresenceMode) -> Vec<String> {
        let mut map = self.sessions.write().await;
        let mut changed = Vec::new();
        for (id, s) in map.iter_mut() {
            if s.mode != mode {
                s.mode = mode;
                changed.push(id.clone());
            }
        }
        drop(map);
        changed
    }
}

/// 8 unambiguous alphanumerics (no 0/O/1/I).
fn new_resume_code() -> String {
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let uuid = Uuid::new_v4();
    let mut out = String::new();
    for byte in uuid.as_bytes().iter().take(8) {
        let idx = usize::from(*byte % 32);
        out.push(char::from(ALPHABET[idx]));
    }
    out
}

fn normalize_lookup_code(raw: &str) -> String {
    let upper = raw.trim().to_ascii_uppercase();
    upper.strip_prefix("IC-").unwrap_or(&upper).to_string()
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
        let s = reg.create(PresenceMode::Away, ChatLocale::En).await;
        assert_eq!(s.locale, ChatLocale::En);
        assert_eq!(s.short_code.len(), 8);
        assert!(!s.short_code.contains('-'));
        assert_eq!(reg.get(&s.id).await.unwrap().short_code, s.short_code);
        assert_eq!(reg.get_by_code(&s.short_code).await.unwrap().id, s.id);
        assert_eq!(
            reg.get_by_code(&format!("IC-{}", s.short_code))
                .await
                .unwrap()
                .id,
            s.id
        );
        reg.set_slack_thread(&s.id, "D123".into(), "171.001".into())
            .await;
        assert_eq!(reg.get_by_thread("171.001").await.unwrap().id, s.id);
        let line = ChatLine {
            id: "slack.ts".into(),
            role: "greg".into(),
            text: "one".into(),
        };
        assert!(reg.push_line(&s.id, line.clone()).await);
        assert!(!reg.push_line(&s.id, line).await);
        assert_eq!(reg.slack_threads().await.len(), 1);
    }
}
