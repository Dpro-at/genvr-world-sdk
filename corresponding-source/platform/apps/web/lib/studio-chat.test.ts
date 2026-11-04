import { describe, expect, it } from 'vitest';
import { cleanChatInfo, createChatStore, sameContext, type StudioContext } from './studio-chat';

const place: StudioContext = { projectId: 'p1', name: 'Rooftop city', tab: 'build', look: 'anime', kind: 'island' };

describe('a host chat in the Studio (board W1)', () => {
  it('keeps only well-formed chat info', () => {
    expect(cleanChatInfo({ folder: '  ~/Girru/genvr_Worlds/Rooftop city ', answerer: { name: 'Sara', detail: 'Sonnet', color: '#C2477F' } })).toEqual({
      folder: '~/Girru/genvr_Worlds/Rooftop city',
      answerer: { name: 'Sara', detail: 'Sonnet', color: '#C2477F' },
    });
    expect(cleanChatInfo({ folder: '', answerer: { name: ' ', color: 'red' } })).toEqual({});
    expect(cleanChatInfo({ answerer: { name: 'Omar', color: 'red; background:url(x)' } })).toEqual({ answerer: { name: 'Omar' } });
    expect(cleanChatInfo(null)).toEqual({});
    expect(cleanChatInfo({ folder: 'x'.repeat(900) }).folder).toHaveLength(500);
  });
  it('tells the host again only when the place changes', () => {
    expect(sameContext(null, place)).toBe(false);
    expect(sameContext(place, { ...place })).toBe(true);
    expect(sameContext(place, { ...place, tab: 'filming' })).toBe(false);
    expect(sameContext(place, { ...place, name: 'Night market' })).toBe(false);
    expect(sameContext(place, { ...place, projectId: 'p2' })).toBe(false);
  });
  it('lets the host change what the chat shows at any time', () => {
    const store = createChatStore({ answerer: { name: 'Sara' } });
    let calls = 0;
    const stop = store.subscribe(() => (calls += 1));
    store.set({ folder: '~/Girru/genvr_Worlds/A', answerer: { name: 'Omar' } });
    expect(store.get()).toEqual({ folder: '~/Girru/genvr_Worlds/A', answerer: { name: 'Omar' } });
    stop();
    store.set({});
    expect(calls).toBe(1);
    expect(store.get()).toEqual({});
  });
});
