import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { listAvatarMotions } from '../src/mcp-avatar-catalog.js';
it('lists native motion IDs without claiming a live viewport', async () => {
  const result = await listAvatarMotions({ category: 'Running', limit: 2 });
  expect(result.total).toBe(38); expect(result.matched).toBeGreaterThan(0); expect(result.entries.length).toBeLessThanOrEqual(2);
  expect(result.expressions).toContain('smile'); expect(result.viewportConnected).toBe(false);
});
it('filters supplied metadata while keeping source files private', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'genvr-motion-catalog-'));
  try {
    const path = join(folder, 'catalog.json');
    await writeFile(path, JSON.stringify({ entries: [{ id: 'motion:genvr_jump', name: 'GENVR-JUMP-001 · Running Jump', category: 'Movement', file: '/private/source.glb' }] }));
    const result = await listAvatarMotions({ query: 'GENVR-JUMP-001', category: 'Jumping' }, path);
    expect(result.matched).toBe(1); expect(result.entries[0]?.id).toBe('motion:genvr_jump'); expect(JSON.stringify(result)).not.toContain('/private');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
it('rejects invalid pagination', async () => {
  await expect(listAvatarMotions({ limit: 10000 })).rejects.toThrow(); await expect(listAvatarMotions({ offset: -1 })).rejects.toThrow();
});
