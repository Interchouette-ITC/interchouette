export type ChatLinkPart = { t: string; href: string | null };

const HTTP_LINK = /\bhttps?:\/\/[^\s<>]+/gi;
const TRAILING_PUNCT = /[),.;!?]+$/u;

/** Split plain chat text so http(s) URLs can render as links. */
export function splitHttpLinks(text: string): ChatLinkPart[] {
  const parts: ChatLinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(HTTP_LINK.source, 'gi'))) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ t: text.slice(last, index), href: null });
    }
    const trimmed = raw.replace(TRAILING_PUNCT, '');
    const trail = raw.slice(trimmed.length);
    parts.push({ t: trimmed, href: trimmed });
    if (trail.length > 0) {
      parts.push({ t: trail, href: null });
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
