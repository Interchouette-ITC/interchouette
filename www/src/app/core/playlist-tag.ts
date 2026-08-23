import type { RadioControlAction } from './radio.service';
import { dispatchRadioControl } from './radio.service';

const PLAYLIST_TAG_RE = /\[\[PLAYLIST:\s*(play|pause|toggle|next|mute)\s*\]\]/gi;

/** Parse first `[[PLAYLIST: action]]` tag in an ITCy reply. */
export function extractPlaylistAction(text: string): RadioControlAction | null {
  const match = PLAYLIST_TAG_RE.exec(text);
  PLAYLIST_TAG_RE.lastIndex = 0;
  if (!match?.[1]) {
    return null;
  }
  return match[1].toLowerCase() as RadioControlAction;
}

/** Remove playlist control tags from visitor-visible chat text. */
export function stripPlaylistTags(text: string): string {
  return text
    .replace(PLAYLIST_TAG_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Strip playlist tags from a chat message and dispatch `interchouette:radio`
 * when a tag was present.
 */
export function applyPlaylistTagsFromChat(text: string): string {
  const action = extractPlaylistAction(text);
  const cleaned = stripPlaylistTags(text);
  if (action) {
    dispatchRadioControl(action);
  }
  return cleaned;
}
