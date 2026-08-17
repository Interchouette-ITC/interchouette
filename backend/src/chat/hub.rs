//! Per-session WebSocket fan-out (in-memory only).

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};

/// Events pushed to the browser over WebSocket.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    Presence {
        mode: String,
        label: String,
    },
    Message {
        id: String,
        role: String,
        text: String,
    },
    Typing {
        who: String,
        active: bool,
    },
    Error {
        message: String,
    },
    Ready {
        session_id: String,
        short_code: String,
        mode: String,
    },
}

struct SessionBus {
    tx: broadcast::Sender<ChatEvent>,
}

/// In-memory hub keyed by session id.
#[derive(Clone, Default)]
pub struct Hub {
    inner: Arc<RwLock<HashMap<String, SessionBus>>>,
}

impl Hub {
    /// Subscribe to a session bus (creates the bus if missing).
    pub async fn subscribe(&self, session_id: &str) -> broadcast::Receiver<ChatEvent> {
        let mut map = self.inner.write().await;
        let bus = map.entry(session_id.to_string()).or_insert_with(|| {
            let (tx, _) = broadcast::channel(64);
            SessionBus { tx }
        });
        let rx = bus.tx.subscribe();
        drop(map);
        rx
    }

    /// Publish an event to subscribers of a session.
    pub async fn publish(&self, session_id: &str, event: ChatEvent) {
        let map = self.inner.read().await;
        if let Some(bus) = map.get(session_id) {
            if bus.tx.receiver_count() > 0 {
                let _ = bus.tx.send(event);
            }
        }
    }

    /// Publish the same event to every session bus that still has receivers.
    pub async fn publish_many(&self, session_ids: &[String], event: ChatEvent) {
        let map = self.inner.read().await;
        for id in session_ids {
            if let Some(bus) = map.get(id) {
                if bus.tx.receiver_count() > 0 {
                    let _ = bus.tx.send(event.clone());
                }
            }
        }
    }
}
