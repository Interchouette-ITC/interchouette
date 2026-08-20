//! Website visitor chat: HTTP + WebSocket, Slack DM for live, remote MCP for away.

pub mod chat;
pub mod news;
pub mod server;

pub use server::{build_app, run_http, DEFAULT_HTTP_LISTEN};
