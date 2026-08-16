//! Interchouette knowledge MCP + website chat (Slack-backed).

pub mod chat;
pub mod db;
pub mod server;

pub use server::{build_app, run_http, DEFAULT_ALLOWED_HOSTS, DEFAULT_HTTP_LISTEN};
