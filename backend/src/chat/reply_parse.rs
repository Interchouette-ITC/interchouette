//! Parse Greg's tagged Slack DM replies into session resume codes.

/// Extract resume code and reply body from a Slack message.
///
/// Accepted shapes:
/// - `[IC-A3F9K2M7] hello`
/// - `[S-1A2B] hello` (legacy)
/// - `[IC-A3F9K2M7] REPLY: hello`
#[must_use]
pub fn parse_session_reply(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim();
    let start = trimmed.find('[')?;
    let rest = &trimmed[start + 1..];
    let end = rest.find(']')?;
    let code_raw = &rest[..end];
    let code = normalize_resume_code(code_raw)?;
    let after = rest[end + 1..].trim();
    let after = strip_kind_prefix(after);
    if after.is_empty() {
        return None;
    }
    Some((code, after.to_string()))
}

fn normalize_resume_code(raw: &str) -> Option<String> {
    let upper = raw.trim().to_ascii_uppercase();
    if let Some(code) = normalize_ic(&upper) {
        return Some(code);
    }
    normalize_legacy_s(&upper)
}

fn normalize_ic(upper: &str) -> Option<String> {
    let bytes = upper.as_bytes();
    // IC- + 8 Crockford-ish alnum
    if bytes.len() != 11 || &bytes[..3] != b"IC-" {
        return None;
    }
    if !bytes[3..].iter().all(u8::is_ascii_alphanumeric) {
        return None;
    }
    Some(upper.to_string())
}

fn normalize_legacy_s(upper: &str) -> Option<String> {
    let bytes = upper.as_bytes();
    if bytes.len() != 6 || bytes[0] != b'S' || bytes[1] != b'-' {
        return None;
    }
    if !bytes[2..].iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    Some(upper.to_string())
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
    fn parses_ic_reply() {
        let (code, body) = parse_session_reply("[IC-a3f9k2m7] Thanks for reaching out").unwrap();
        assert_eq!(code, "IC-A3F9K2M7");
        assert_eq!(body, "Thanks for reaching out");
    }

    #[test]
    fn parses_legacy_s() {
        let (code, body) = parse_session_reply("[S-00ab] Thanks").unwrap();
        assert_eq!(code, "S-00AB");
        assert_eq!(body, "Thanks");
    }

    #[test]
    fn parses_reply_prefix() {
        let (code, body) = parse_session_reply("  [IC-1F2E9A0B] REPLY: yes  ").unwrap();
        assert_eq!(code, "IC-1F2E9A0B");
        assert_eq!(body, "yes");
    }

    #[test]
    fn rejects_untagged() {
        assert!(parse_session_reply("hello without tag").is_none());
        assert!(parse_session_reply("[S-ZZZZ] bad hex").is_none());
        assert!(parse_session_reply("[IC-SHORT] x").is_none());
        assert!(parse_session_reply("[IC-1F2E9A0B]").is_none());
    }
}
