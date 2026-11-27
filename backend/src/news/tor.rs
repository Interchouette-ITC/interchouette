//! A separate Tor process and data directory for each `LinkedIn` refresh.

use std::net::SocketAddr;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufRead, AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

const BOOTSTRAP_TIMEOUT: Duration = Duration::from_mins(2);

pub(super) struct Tor {
    child: Child,
    _data_dir: tempfile::TempDir,
    socks_addr: SocketAddr,
}

impl Tor {
    pub(super) async fn start() -> Result<Self, String> {
        let data_dir = tempfile::tempdir()
            .map_err(|err| format!("Tor data directory creation failed: {err}"))?;
        let config_file = data_dir.path().join("torrc");
        tokio::fs::write(&config_file, b"")
            .await
            .map_err(|err| format!("Tor configuration creation failed: {err}"))?;
        let mut child = Command::new("tor")
            .arg("-f")
            .arg(config_file)
            .arg("--DataDirectory")
            .arg(data_dir.path())
            .args(["--SocksPort", "auto", "--Log", "notice stdout"])
            .stdout(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|err| format!("Tor process start failed: {err}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Tor process stdout unavailable".to_string())?;
        let mut lines = BufReader::new(stdout).lines();
        let socks_addr = tokio::time::timeout(BOOTSTRAP_TIMEOUT, wait_for_bootstrap(&mut lines))
            .await
            .map_err(|_| "Tor bootstrap timed out".to_string())??;

        tokio::spawn(async move {
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => tracing::debug!(message = %line, "Tor process"),
                    Ok(None) => break,
                    Err(err) => {
                        tracing::warn!(error = %err, "Tor log read failed");
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            _data_dir: data_dir,
            socks_addr,
        })
    }

    pub(super) const fn socks_addr(&self) -> SocketAddr {
        self.socks_addr
    }

    pub(super) async fn stop(&mut self) -> Result<(), String> {
        match self.child.try_wait() {
            Ok(Some(_)) => Ok(()),
            Ok(None) => self
                .child
                .kill()
                .await
                .map_err(|err| format!("Tor process shutdown failed: {err}")),
            Err(err) => Err(format!("Tor process status failed: {err}")),
        }
    }
}

async fn wait_for_bootstrap<R: AsyncBufRead + Unpin>(
    lines: &mut tokio::io::Lines<R>,
) -> Result<SocketAddr, String> {
    let mut socks_addr = None;
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|err| format!("Tor startup log read failed: {err}"))?
    {
        if line.contains("[warn]") || line.contains("[err]") {
            tracing::warn!(message = %line, "Tor startup");
        }
        if line.contains("Opened Socks listener") {
            socks_addr = line
                .split_whitespace()
                .find_map(|part| part.parse::<SocketAddr>().ok())
                .filter(|addr| addr.ip().is_loopback());
        }
        if line.contains("Bootstrapped 100%") {
            return socks_addr.ok_or_else(|| "Tor SOCKS listener address missing".to_string());
        }
    }
    Err("Tor process exited before bootstrapping".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bootstrap_requires_a_loopback_listener_and_completion() {
        let output = b"Opened Socks listener connection (ready) on 127.0.0.1:34567\nBootstrapped 100% (done): Done\n";
        let mut lines = BufReader::new(&output[..]).lines();
        assert_eq!(
            wait_for_bootstrap(&mut lines).await.unwrap(),
            "127.0.0.1:34567".parse().unwrap()
        );

        let output = b"Opened Socks listener connection (ready) on 192.0.2.1:34567\nBootstrapped 100% (done): Done\n";
        let mut lines = BufReader::new(&output[..]).lines();
        assert!(wait_for_bootstrap(&mut lines).await.is_err());

        let output = b"Opened Socks listener connection (ready) on 127.0.0.1:34567\n";
        let mut lines = BufReader::new(&output[..]).lines();
        assert!(wait_for_bootstrap(&mut lines).await.is_err());
    }
}
