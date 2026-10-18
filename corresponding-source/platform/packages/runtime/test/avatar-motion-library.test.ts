import { expect, it } from 'vitest';
import { avatarMotionEntries, avatarMotionEntry, registerAvatarMotionLibrary } from '../src/avatar-motion-library.js';
const entry = (id: string) => ({ id, name: id, category: 'Gestures', loop: false, load: async () => new ArrayBuffer(0) });
it('restores prior replacement aliases when the host removes an override', () => {
  const first = entry('motion:first'), second = entry('motion:second');
  const a = registerAvatarMotionLibrary({ entries: [first], replacements: { Wave: first.id } });
  const b = registerAvatarMotionLibrary({ entries: [second], replacements: { Wave: second.id } });
  try { expect(avatarMotionEntry('Wave')).toBe(second); b(); expect(avatarMotionEntry('Wave')).toBe(first); a(); expect(avatarMotionEntry('Wave')).toBeUndefined(); }
  finally { b(); a(); }
});
it('does not resurrect a catalog removed out of order', () => {
  const a = registerAvatarMotionLibrary({ entries: [entry('motion:first')] });
  const b = registerAvatarMotionLibrary({ entries: [entry('motion:second')] });
  try { a(); expect(avatarMotionEntry('motion:second')).toBeDefined(); b(); expect(avatarMotionEntries()).toEqual([]); }
  finally { a(); b(); }
});
it('rejects missing replacement assets without changing the active catalog', () => {
  expect(() => registerAvatarMotionLibrary({ entries: [], replacements: { Wave: 'motion:missing' } })).toThrow();
  expect(avatarMotionEntries()).toEqual([]);
});
