import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createLiveStudioBridge } from '../live-studio-bridge.mjs';

// A host's chat agent builds in the place open in the Studio: building tools cross the live bridge.
it('lets building tools through only to a Studio that takes them', async () => {
  const bridge = createLiveStudioBridge({ timeout: 50 });
  await expect(bridge.call('place_item', {})).rejects.toThrow(/not allowed|No live/);
  bridge.close();
  const mcp = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../live-studio-bridge.mjs', import.meta.url), 'utf8');
  expect(mcp).toMatch(/else if \(live && !session && Object\.hasOwn\(TOOL_ARGS, request\.params\.name\)/);
  expect(app).toMatch(/if \(tool in TOOL_ARGS\) \{/);
  expect(app).toMatch(/worldTools: true/);
  expect(source).toMatch(/session\.capabilities\?\.worldTools === true/);
});

it('sends the Studio chat to the host when the host gives chat.send', () => {
  const panel = readFileSync(new URL('../../../apps/web/components/studio/assistant-panel.tsx', import.meta.url), 'utf8');
  expect(panel).toMatch(/if \(services\.chat\?\.send\) \{\s*try \{\s*await services\.chat\.send\(text,/);
  expect(panel).toMatch(/if \(current\.length && \(!hostSends \|\| busy\)\) return current;/);
});
