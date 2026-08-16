//! Interchouette knowledge MCP library.

pub mod admin;
pub mod db;
pub mod ingest;
pub mod server;

pub use server::{run_http, DEFAULT_HTTP_LISTEN};
