import { describe, expect, it } from 'vitest';
import { createGenvrAvatar, DEFAULT_LOOK, preloadAvatarLook, setItemBodyResolver } from '../src/avatar.js';

// Uploaded bodies (plan 2026-10-03, Task 5): a look that wears a creator's body item. The runtime asks the app once
// per item; until the body and its model are ready, Classic stands in; an item the app cannot resolve stays Classic.

const ITEM = 'user.example.hero-a1b2c3' as const;

describe('a look with an uploaded body', () => {
  it('shows Classic while the item is unknown, without errors', async () => {
    setItemBodyResolver(null);
    const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: ITEM });
    expect(avatar.body).toBe('classic');
    await preloadAvatarLook({ ...DEFAULT_LOOK, body: ITEM });
    expect(avatar.body).toBe('classic');
  });

  it('asks the app once per item, however many avatars wear it', async () => {
    const asked: string[] = [];
    setItemBodyResolver(async (id) => {
      asked.push(id);
      return null;
    });
    const other = 'user.example.other-d4e5f6' as const;
    createGenvrAvatar({ ...DEFAULT_LOOK, body: other });
    createGenvrAvatar({ ...DEFAULT_LOOK, body: other });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toEqual([other]);
    setItemBodyResolver(null);
  });
});
