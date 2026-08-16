//! Interchouette knowledge MCP library.

pub mod db;
pub mod server;

pub use server::{run_http, DEFAULT_HTTP_LISTEN};
