//! Fetch one ISO-week news snapshot into `mcp/catalog/news/YYYY-Www.json`.

use std::path::PathBuf;

use anyhow::{bail, Context};
use clap::Parser;
use interchouette_mcp::news_format::{
    current_iso_week_id, is_valid_week_id, week_id_from_fetched_at,
};

#[derive(Debug, Parser)]
#[command(
    name = "interchouette-mcp-news-snapshot",
    about = "Write catalog/news/YYYY-Www.json from the public news API (archive week preferred)"
)]
struct Args {
    /// ISO week id (default: current UTC week).
    #[arg(long)]
    week: Option<String>,
    /// API origin (default: `<https://api.interchouette.net>`).
    #[arg(long, default_value = "https://api.interchouette.net")]
    api: String,
    /// Output directory (default: mcp/catalog/news).
    #[arg(long, default_value = "catalog/news")]
    out_dir: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let week = args
        .week
        .unwrap_or_else(current_iso_week_id)
        .trim()
        .to_string();
    if !is_valid_week_id(&week) {
        bail!("week must look like YYYY-Www (got {week})");
    }
    let out_dir = if args.out_dir.is_relative() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(&args.out_dir)
    } else {
        args.out_dir
    };
    std::fs::create_dir_all(&out_dir).with_context(|| format!("create {}", out_dir.display()))?;

    let base = args.api.trim_end_matches('/');
    let client = reqwest::Client::new();
    let archive_url = format!("{base}/v1/news/archive/{week}?locale=en");
    let live_url = format!("{base}/v1/news?locale=en");

    let (source, body) = match fetch_json(&client, &archive_url).await {
        Ok(v) => ("archive", v),
        Err(archive_err) => {
            eprintln!("archive miss ({archive_err}); falling back to live {live_url}");
            let live = fetch_json(&client, &live_url)
                .await
                .with_context(|| format!("GET {live_url}"))?;
            ("live", live)
        }
    };

    if let Some(at) = body.get("fetched_at").and_then(|v| v.as_str()) {
        if let Some(payload_week) = week_id_from_fetched_at(at) {
            if payload_week != week && source == "live" {
                eprintln!(
                    "note: live payload ISO week is {payload_week}; writing as requested week {week}"
                );
            }
        }
    }

    let path = out_dir.join(format!("{week}.json"));
    let pretty = serde_json::to_string_pretty(&body)?;
    std::fs::write(&path, format!("{pretty}\n"))
        .with_context(|| format!("write {}", path.display()))?;
    eprintln!("wrote {} from {source} ({})", path.display(), base);
    Ok(())
}

async fn fetch_json(client: &reqwest::Client, url: &str) -> anyhow::Result<serde_json::Value> {
    let resp = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        bail!("HTTP {} for {url}", resp.status().as_u16());
    }
    resp.json()
        .await
        .with_context(|| format!("decode JSON from {url}"))
}
