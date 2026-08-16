//! In-memory chat sessions (no SQLite).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::chat::presence::PresenceMode;

/// One active visitor session.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub short_code: String,
    pub mode: PresenceMode,
    pub visitor_email: Option<String>,
    pub created_at: i64,
}

/// Registry of live sessions keyed by id and short code.
#[derive(Clone, Default)]
pub struct SessionRegistry {
    by_id: Arc<RwLock<HashMap<String, Session>>>,
    by_code: Arc<RwLock<HashMap<String, String>>>,
    seq: Arc<AtomicU64>,
}

impl SessionRegistry {
    /// Create a session for the current presence mode.
    pub async fn create(&self, mode: PresenceMode) -> Session {
        let id = Uuid::new_v4().to_string();
        let n = self.seq.fetch_add(1, Ordering::Relaxed);
        let code_n = u16::try_from(n.wrapping_add(1) & 0xffff)
            .unwrap_or(1)
            .max(1);
        let short_code = format!("S-{code_n:04X}");
        let session = Session {
            id: id.clone(),
            short_code: short_code.clone(),
            mode,
            visitor_email: None,
            created_at: now_secs(),
        };
        self.by_id.write().await.insert(id.clone(), session.clone());
        self.by_code.write().await.insert(short_code, id);
        session
    }

    /// Get by session id.
    pub async fn get(&self, id: &str) -> Option<Session> {
        self.by_id.read().await.get(id).cloned()
    }

    /// Get by short code (`S-ABCD`).
    pub async fn get_by_code(&self, code: &str) -> Option<Session> {
        let code = code.trim().to_ascii_uppercase();
        let id = self.by_code.read().await.get(&code)?.clone();
        self.get(&id).await
    }

    /// Update mode.
    pub async fn set_mode(&self, id: &str, mode: PresenceMode) {
        if let Some(s) = self.by_id.write().await.get_mut(id) {
            s.mode = mode;
        }
    }

    /// Optional email capture.
    pub async fn set_email(&self, id: &str, email: String) {
        if let Some(s) = self.by_id.write().await.get_mut(id) {
            s.visitor_email = Some(email);
        }
    }
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
        assert!(s.short_code.starts_with("S-"));
        assert_eq!(reg.get(&s.id).await.unwrap().short_code, s.short_code);
        assert_eq!(reg.get_by_code(&s.short_code).await.unwrap().id, s.id);
    }
}
