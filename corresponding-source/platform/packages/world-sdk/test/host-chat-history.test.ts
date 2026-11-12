import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { cleanChatInfo } from '../../../apps/web/lib/studio-chat.js';

// GV1e: the host keeps the place's chat; the Studio shows its earlier lines and can open it there.
it('keeps only well-formed earlier lines, the latest 40, trimmed', () => {
  const lines = Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: ` line ${i} ` }));
  const info = cleanChatInfo({ history: [...lines, { role: 'system', text: 'no' }, { role: 'user', text: '' }, 'bad'] });
  expect(info.history).toHaveLength(37);
  expect(info.history?.[0]).toEqual({ role: 'user', text: 'line 8' });
  expect(cleanChatInfo({ history: 'nope' })).toEqual({});
  expect(cleanChatInfo({ history: [{ role: 'user', text: 'x'.repeat(30000) }] }).history?.[0]?.text).toHaveLength(20000);
});

it('shows the earlier lines once and offers Open in Chat when the host gives it', () => {
  const panel = readFileSync(new URL('../../../apps/web/components/studio/assistant-panel.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  expect(panel).toMatch(/if \(current\.length\) return current;/);
  expect(panel).toMatch(/chat\.openChat \?/);
  expect(app).toMatch(/options\.chat\.openChat \? \{ openChat: options\.chat\.openChat \}/);
});
