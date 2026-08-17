//! Visitor locale for away-mode replies and MCP search.

/// Site locale from the chat widget (`en` / `nl` / `fr`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatLocale {
    En,
    Nl,
    Fr,
}

impl ChatLocale {
    /// Parse a session locale; unknown or missing values become English.
    #[must_use]
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim) {
            Some(s) if s.eq_ignore_ascii_case("nl") => Self::Nl,
            Some(s) if s.eq_ignore_ascii_case("fr") => Self::Fr,
            _ => Self::En,
        }
    }

    /// MCP `lang` argument and ISO code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::Nl => "nl",
            Self::Fr => "fr",
        }
    }

    /// English name of the language (for the model system prompt).
    #[must_use]
    pub const fn language_name(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::Nl => "Dutch",
            Self::Fr => "French",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_defaults_and_aliases() {
        assert_eq!(ChatLocale::parse(None), ChatLocale::En);
        assert_eq!(ChatLocale::parse(Some("")), ChatLocale::En);
        assert_eq!(ChatLocale::parse(Some("de")), ChatLocale::En);
        assert_eq!(ChatLocale::parse(Some("NL")), ChatLocale::Nl);
        assert_eq!(ChatLocale::parse(Some("fr")), ChatLocale::Fr);
    }
}
