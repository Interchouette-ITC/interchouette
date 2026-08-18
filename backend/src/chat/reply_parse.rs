//! Parse Greg's tagged Slack DM replies into session ticket codes.

/// Extract ticket code and `env=` label from a session thread header line.
///
/// Example: `[S4BF9G2B] mode=live env=local` → `(S4BF9G2B, local)`.
#[must_use]
pub fn parse_session_header(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim();
    let start = trimmed.find('[')?;
    let rest = &trimmed[start + 1..];
    let end = rest.find(']')?;
    let code = normalize_ticket_code(&rest[..end])?;
    let after = rest[end + 1..].trim();
    let env = after
        .split_whitespace()
        .find_map(|part| part.strip_prefix("env="))
        .unwrap_or("")
        .to_string();
    Some((code, env))
}

/// Extract ticket code and reply body from a Slack message.
///
/// Accepted shapes:
/// - `[S4BF9G2B] hello`
/// - `[S4BF9G2B] REPLY: hello`
#[must_use]
pub fn parse_session_reply(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim();
    let start = trimmed.find('[')?;
    let rest = &trimmed[start + 1..];
    let end = rest.find(']')?;
    let code = normalize_ticket_code(&rest[..end])?;
    let after = rest[end + 1..].trim();
    let after = strip_kind_prefix(after);
    if after.is_empty() {
        return None;
    }
    Some((code, after.to_string()))
}

fn normalize_ticket_code(raw: &str) -> Option<String> {
    let upper = raw.trim().to_ascii_uppercase();
    let bare = upper.strip_prefix("IC-").unwrap_or(&upper);
    let bytes = bare.as_bytes();
    if bytes.len() != 8 || !bytes.iter().all(u8::is_ascii_alphanumeric) {
        return None;
    }
    Some(bare.to_string())
}

fn strip_kind_prefix(text: &str) -> &str {
    for prefix in ["REPLY:", "GREG:", "LIVE:"] {
        if let Some(rest) = text
            .get(..prefix.len())
            .filter(|p| p.eq_ignore_ascii_case(prefix))
            .and_then(|_| text.get(prefix.len()..))
        {
            return rest.trim();
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ticket_reply() {
        let (code, body) = parse_session_reply("[s4bf9g2b] Thanks for reaching out").unwrap();
        assert_eq!(code, "S4BF9G2B");
        assert_eq!(body, "Thanks for reaching out");
    }

    #[test]
    fn strips_leftover_ic_prefix() {
        let (code, body) = parse_session_reply("[IC-s4bf9g2b] Thanks").unwrap();
        assert_eq!(code, "S4BF9G2B");
        assert_eq!(body, "Thanks");
    }

    #[test]
    fn parses_reply_prefix() {
        let (code, body) = parse_session_reply("  [S4BF9G2B] REPLY: yes  ").unwrap();
        assert_eq!(code, "S4BF9G2B");
        assert_eq!(body, "yes");
    }

    #[test]
    fn parses_session_header() {
        let (code, env) = parse_session_header("[s4bf9g2b] mode=live env=local").expect("header");
        assert_eq!(code, "S4BF9G2B");
        assert_eq!(env, "local");
    }

    #[test]
    fn rejects_untagged() {
        assert!(parse_session_reply("hello without tag").is_none());
        assert!(parse_session_reply("[SHORT] x").is_none());
        assert!(parse_session_reply("[S4BF9G2B]").is_none());
    }
}
