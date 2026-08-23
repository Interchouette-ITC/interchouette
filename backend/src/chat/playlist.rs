//! Playlist control tags in away-mode `ITCy` replies (`[[PLAYLIST: play]]`).

/// Actions the browser radio bridge understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaylistAction {
    /// Start playback.
    Play,
    /// Pause playback.
    Pause,
    /// Toggle play/pause.
    Toggle,
    /// Skip to next track.
    Next,
    /// Toggle mute.
    Mute,
}

impl PlaylistAction {
    fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "play" => Some(Self::Play),
            "pause" => Some(Self::Pause),
            "toggle" => Some(Self::Toggle),
            "next" => Some(Self::Next),
            "mute" => Some(Self::Mute),
            _ => None,
        }
    }
}

const PLAYLIST_TAG_PREFIX: &str = "[[PLAYLIST:";
const PLAYLIST_TAG_SUFFIX: &str = "]]";

/// Extract the first playlist action tag from an LLM reply.
#[must_use]
pub fn extract_playlist_tag(reply: &str) -> Option<PlaylistAction> {
    let tag_start = reply.find(PLAYLIST_TAG_PREFIX)?;
    let inner_start = tag_start + PLAYLIST_TAG_PREFIX.len();
    let inner_end = reply[inner_start..].find(PLAYLIST_TAG_SUFFIX)? + inner_start;
    let inner = reply[inner_start..inner_end].trim();
    PlaylistAction::parse(inner)
}

/// Strip playlist tags so Slack / logs never show the raw control marker.
#[must_use]
pub fn strip_playlist_tag(reply: &str) -> String {
    let Some(start) = reply.find(PLAYLIST_TAG_PREFIX) else {
        return reply.to_string();
    };
    let inner_start = start + PLAYLIST_TAG_PREFIX.len();
    let Some(rel_end) = reply[inner_start..].find(PLAYLIST_TAG_SUFFIX) else {
        return reply.to_string();
    };
    let end = inner_start + rel_end + PLAYLIST_TAG_SUFFIX.len();
    let before = reply[..start].trim_end();
    let after = reply[end..].trim_start();
    if before.is_empty() {
        after.to_string()
    } else if after.is_empty() {
        before.to_string()
    } else {
        format!("{before} {after}")
    }
}

/// Visitor-turn threshold before `ITCy` may emit a playlist nudge (default 3).
#[must_use]
pub fn playlist_after_turns() -> usize {
    std::env::var("CHAT_PLAYLIST_AFTER_TURNS")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(3)
}

/// True when the transcript already contains a playlist tag (avoid repeat nudges).
#[must_use]
pub fn history_has_playlist_tag(lines: &[crate::chat::sessions::ChatLine]) -> bool {
    lines
        .iter()
        .any(|line| extract_playlist_tag(&line.text).is_some())
}

/// Count visitor turns in the session transcript.
#[must_use]
pub fn visitor_turn_count(lines: &[crate::chat::sessions::ChatLine]) -> usize {
    lines.iter().filter(|line| line.role == "visitor").count()
}

/// Extra system note when the away turn should invite Play ITC radio once.
#[must_use]
pub fn playlist_nudge_note(lines: &[crate::chat::sessions::ChatLine]) -> Option<&'static str> {
    if history_has_playlist_tag(lines) {
        return None;
    }
    if visitor_turn_count(lines) < playlist_after_turns() {
        return None;
    }
    Some(
        "Optional once: after a helpful reply, you may start Play ITC radio for the visitor by \
         emitting [[PLAYLIST: play]] on its own line (browser will start the SoundCloud playlist). \
         Do not mention the raw tag. Only once per conversation.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::sessions::ChatLine;

    #[test]
    fn extracts_and_strips_playlist_tag() {
        let reply = "Enjoy the music.\n[[PLAYLIST: play]]\nMore text.";
        assert_eq!(extract_playlist_tag(reply), Some(PlaylistAction::Play));
        assert_eq!(strip_playlist_tag(reply), "Enjoy the music. More text.");
    }

    #[test]
    fn nudge_after_configured_turns() {
        std::env::set_var("CHAT_PLAYLIST_AFTER_TURNS", "2");
        let lines = vec![
            ChatLine {
                id: "1".into(),
                role: "visitor".into(),
                text: "hi".into(),
            },
            ChatLine {
                id: "2".into(),
                role: "itcy".into(),
                text: "hello".into(),
            },
            ChatLine {
                id: "3".into(),
                role: "visitor".into(),
                text: "rust?".into(),
            },
        ];
        assert!(playlist_nudge_note(&lines).is_some());
        std::env::remove_var("CHAT_PLAYLIST_AFTER_TURNS");
    }
}
