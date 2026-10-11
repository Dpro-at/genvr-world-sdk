import { describe, expect, it } from 'vitest';
import { GrassView } from '../src/grass.js';

describe('empty grass render work', () => {
  it('caches sandy patches without submitting them and restores grass after repaint', () => {
    let grassy = false;
    let queries = 0;
    const view = new GrassView({
      isGrass: () => {
        queries++;
        return grassy;
      },
      height: () => 0,
      slope: () => 0,
      blocked: () => false,
    });
    view.update(0, 0);
    expect(view.patchCount).toBeGreaterThan(0);
    expect(view.group.children.every((mesh) => !mesh.visible)).toBe(true);
    const sampled = queries;
    view.update(1, 1);
    expect(queries).toBe(sampled);
    // Ground editing already invalidates the cached patches.
    grassy = true;
    view.clear();
    view.update(0, 0);
    expect(view.group.children.some((mesh) => mesh.visible)).toBe(true);
    view.dispose();
    expect(view.group.children).toHaveLength(0);
  });
});
