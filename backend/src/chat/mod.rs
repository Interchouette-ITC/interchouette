//! Website visitor chat: WebSocket + Slack DM (no chat database).
//!
//! Active sessions live in memory. Durable retrieval is Slack threads only.
//! Away mode queries knowledge via the remote MCP HTTP API (not local `SQLite`).

mod api;
mod env_label;
mod hub;
mod llm;
mod presence;
mod reply_parse;
mod sessions;
mod slack;
mod socket;

pub use api::{chat_router, ChatState};
pub use env_label::chat_env_label;
pub use llm::AwayBrain;
pub use presence::{PresenceMode, PresenceSnapshot};
pub use reply_parse::parse_session_reply;
pub use sessions::SessionRegistry;
pub use socket::{forward_greg_reply, socket_configured, spawn_inbound};
