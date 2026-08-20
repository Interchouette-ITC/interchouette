export type ChatLinkPart = { t: string; href: string | null };

const TRAILING_PUNCT = /[),.;!?]+$/u;
const TOKEN =
  /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)|\bhttps?:\/\/[^\s<>]+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|(?<![\w.+-])@([A-Za-z0-9_]{1,15})\b/g;

/** Split chat text so markdown links, http(s) URLs, emails, and @handles render as anchors. */
export function splitHttpLinks(text: string): ChatLinkPart[] {
  const parts: ChatLinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(TOKEN, 'g'))) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ t: text.slice(last, index), href: null });
    }
    const label = match[1];
    const mdHref = match[2];
    const mention = match[3];
    if (label !== undefined && mdHref !== undefined) {
      parts.push({ t: label, href: mdHref });
    } else if (mention !== undefined) {
      parts.push({ t: `@${mention}`, href: `https://x.com/${mention}` });
    } else if (raw.includes('@') && !/^https?:/i.test(raw)) {
      parts.push({ t: raw, href: `mailto:${raw}` });
    } else {
      const trimmed = raw.replace(TRAILING_PUNCT, '');
      const trail = raw.slice(trimmed.length);
      parts.push({ t: trimmed, href: trimmed });
      if (trail.length > 0) {
        parts.push({ t: trail, href: null });
      }
    }
    last = index + raw.length;
  }
  if (last < text.length) {
    parts.push({ t: text.slice(last), href: null });
  }
  if (parts.length === 0) {
    return [{ t: text, href: null }];
  }
  return parts;
}

export function isHttpHref(href: string | null): boolean {
  return !!href && /^https?:/i.test(href);
}
