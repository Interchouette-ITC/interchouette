//! Deploy label for Slack lines (`local` / `e2e` / `prod`).

/// Label shown in Slack so Greg can tell who is talking.
///
/// - `CHAT_ENV=local|e2e|prod` (aliases: `dev`→local, `test`→e2e, `production`→prod)
/// - unset: `prod` when `PORT` is set (Render), otherwise `local`
#[must_use]
pub fn chat_env_label() -> String {
    resolve_chat_env_label(
        std::env::var("CHAT_ENV").ok().as_deref(),
        std::env::var("PORT").map(|p| !p.is_empty()).unwrap_or(false),
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

#[cfg(test)]
mod tests {
    use super::resolve_chat_env_label;

    #[test]
    fn maps_aliases_and_defaults() {
        assert_eq!(resolve_chat_env_label(None, false), "local");
        assert_eq!(resolve_chat_env_label(None, true), "prod");
        assert_eq!(resolve_chat_env_label(Some("e2e"), false), "e2e");
        assert_eq!(resolve_chat_env_label(Some("production"), false), "prod");
        assert_eq!(resolve_chat_env_label(Some("dev"), true), "local");
    }
}
