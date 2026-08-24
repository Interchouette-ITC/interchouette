//! Deploy label for Slack lines (`local` / `e2e` / `prod`).

/// Label shown in Slack so Greg can tell who is talking.
///
/// - `CHAT_ENV=local|e2e|prod` (aliases: `dev`→local, `test`→e2e, `production`→prod)
/// - unset: `prod` when `PORT` is set (Render), otherwise `local`
#[must_use]
pub fn chat_env_label() -> String {
    resolve_chat_env_label(
        std::env::var("CHAT_ENV").ok().as_deref(),
        std::env::var("PORT").is_ok_and(|p| !p.is_empty()),
    )
}

#[must_use]
pub fn resolve_chat_env_label(chat_env: Option<&str>, port_set: bool) -> String {
    let trimmed = chat_env.unwrap_or("").trim().to_ascii_lowercase();
    match trimmed.as_str() {
        "e2e" | "test" => "e2e".into(),
        "prod" | "production" => "prod".into(),
        "local" | "dev" => "local".into(),
        "" => {
            if port_set {
                "prod".into()
            } else {
                "local".into()
            }
        }
        other => other.into(),
    }
}

/// Parent Slack line for a new visitor thread (`[CODE] mode=… env=…`).
///
/// Non-prod envs wrap with warning marks so Greg can skim past agent/local noise.
#[must_use]
pub fn format_session_thread_header(short_code: &str, mode: &str, env: &str) -> String {
    let core = format!("[{short_code}] mode={mode} env={env}");
    match env {
        "prod" => core,
        _ => format!("⚠️ {core} ⚠️"),
    }
}

/// Local agent restarts must not open Slack DMs (prod + e2e still relay).
#[must_use]
pub fn slack_relay_allowed(env: &str) -> bool {
    env != "local"
}

#[cfg(test)]
mod tests {
    use super::{format_session_thread_header, resolve_chat_env_label, slack_relay_allowed};

    #[test]
    fn maps_aliases_and_defaults() {
        assert_eq!(resolve_chat_env_label(None, false), "local");
        assert_eq!(resolve_chat_env_label(None, true), "prod");
        assert_eq!(resolve_chat_env_label(Some("e2e"), false), "e2e");
        assert_eq!(resolve_chat_env_label(Some("production"), false), "prod");
        assert_eq!(resolve_chat_env_label(Some("dev"), true), "local");
    }

    #[test]
    fn thread_header_warns_non_prod() {
        assert_eq!(
            format_session_thread_header("ABCD1234", "away", "prod"),
            "[ABCD1234] mode=away env=prod"
        );
        assert_eq!(
            format_session_thread_header("ABCD1234", "away", "local"),
            "⚠️ [ABCD1234] mode=away env=local ⚠️"
        );
        assert_eq!(
            format_session_thread_header("ABCD1234", "live", "e2e"),
            "⚠️ [ABCD1234] mode=live env=e2e ⚠️"
        );
    }

    #[test]
    fn local_blocks_slack_relay() {
        assert!(!slack_relay_allowed("local"));
        assert!(slack_relay_allowed("prod"));
        assert!(slack_relay_allowed("e2e"));
    }
}
