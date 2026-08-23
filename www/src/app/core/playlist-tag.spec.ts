import {
  applyPlaylistTagsFromChat,
  extractPlaylistAction,
  stripPlaylistTags,
} from './playlist-tag';

describe('playlist-tag', () => {
  it('extracts and strips playlist tags', () => {
    const raw = 'Nice track.\n[[PLAYLIST: play]]\nEnjoy.';
    expect(extractPlaylistAction(raw)).toBe('play');
    expect(stripPlaylistTags(raw)).toBe('Nice track.\n\nEnjoy.');
  });

  it('dispatches radio control when applying from chat', () => {
    const seen: string[] = [];
    const handler = (ev: Event) => {
      seen.push((ev as CustomEvent<{ action: string }>).detail.action);
    };
    window.addEventListener('interchouette:radio', handler);
    const cleaned = applyPlaylistTagsFromChat('Go [[PLAYLIST: next]]');
    window.removeEventListener('interchouette:radio', handler);
    expect(cleaned).toBe('Go');
    expect(seen).toEqual(['next']);
  });
});
