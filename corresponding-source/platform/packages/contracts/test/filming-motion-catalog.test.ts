import { expect, it } from 'vitest';
import { FilmStudioResult } from '../src/filming.js';
it('accepts imported motion catalogs without breaking filming replies and retains a finite metadata limit', () => {
  const reply = { film: {}, actors: [{ id: 'self', label: 'My avatar' }], assets: [], actions: Array.from({ length: 855 }, (_, i) => ({ id: `motion:imported_${i}`, label: `Motion ${i}` })) };
  expect(FilmStudioResult.parse(reply).actions).toHaveLength(855);
  expect(FilmStudioResult.safeParse({ ...reply, actions: Array.from({ length: 10101 }, () => reply.actions[0]) }).success).toBe(false);
});
