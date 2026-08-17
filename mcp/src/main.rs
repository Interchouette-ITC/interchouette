//! `interchouette-mcp` - MCP for Gregory Roussac / Interchouette.

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use interchouette_mcp::server::{run_http, DEFAULT_ALLOWED_HOSTS, DEFAULT_HTTP_LISTEN};

#[derive(Debug, Parser)]
#[command(name = "interchouette-mcp", about = "Interchouette MCP", version)]
struct Cli {
    /// HTTP bind address (`PORT` on Render is mapped by the start command).
    #[arg(long, env = "MCP_LISTEN", default_value = DEFAULT_HTTP_LISTEN)]
    listen: String,

    /// Committed read-only `SQLite` database (`db/interchouette.db`).
    #[arg(long = "db", env = "MCP_DB", default_value = "../db/interchouette.db")]
    db_path: PathBuf,

    /// CORS allow origin for browser callers.
    #[arg(long, env = "CORS_ORIGIN", default_value = "https://interchouette.net")]
    cors_origin: String,

    /// Comma-separated Host values allowed by the Streamable HTTP transport.
    #[arg(
        long,
        env = "MCP_ALLOWED_HOSTS",
        value_delimiter = ',',
        default_values = DEFAULT_ALLOWED_HOSTS
    )]
    allowed_hosts: Vec<String>,
}

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let cli = Cli::parse();
    tracing::info!(
        addr = %cli.listen,
        db = %cli.db_path.display(),
        hosts = ?cli.allowed_hosts,
        "interchouette-mcp starting"
    );
    run_http(&cli.listen, cli.db_path, cli.cors_origin, cli.allowed_hosts).await?;
    Ok(())
}
