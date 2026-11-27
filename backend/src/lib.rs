//! Website visitor chat: HTTP + WebSocket, Slack DM for live, remote MCP for away.

pub mod chat;
pub mod news;
pub mod openapi;
pub mod server;

pub use server::{DEFAULT_HTTP_LISTEN, build_app, run_http};
