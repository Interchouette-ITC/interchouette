//! `interchouette-chat` - website visitor chat.

use anyhow::Result;
use clap::Parser;
use interchouette_chat::server::{run_http, DEFAULT_HTTP_LISTEN};

#[derive(Debug, Parser)]
#[command(
    name = "interchouette-chat",
    about = "Interchouette website chat",
    version
)]
struct Cli {
    /// HTTP bind address.
    #[arg(long, env = "CHAT_LISTEN", default_value = DEFAULT_HTTP_LISTEN)]
    listen: String,

    /// CORS allow origin for browser callers.
    #[arg(long, env = "CORS_ORIGIN", default_value = "https://interchouette.net")]
    cors_origin: String,
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
    tracing::info!(addr = %cli.listen, "interchouette-chat starting");
    run_http(&cli.listen, cli.cors_origin).await?;
    Ok(())
}
