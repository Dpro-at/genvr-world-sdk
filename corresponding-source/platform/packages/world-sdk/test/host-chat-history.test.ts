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

it('shows the agents in this place and a folder button when the host can open it', () => {
  expect(cleanChatInfo({ team: [' Jules ', '', 'Sara', 5] }).team).toEqual(['Jules', 'Sara']);
  const panel = readFileSync(new URL('../../../apps/web/components/studio/assistant-panel.tsx', import.meta.url), 'utf8');
  expect(panel).toMatch(/title=\{`Agents in this place: \$\{chat\.team\.join\(', '\)\}`\}/);
  expect(panel).toMatch(/title="Open in Chat" aria-label="Open in Chat"/);
  expect(panel).not.toMatch(/>\s*Open in Chat\s*</);
  expect(panel).toMatch(/onClick=\{chat\.openFolder\}/);
});

it('puts the Assistant tab first and open when a host chat is given', () => {
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/order\.splice\(Math\.max\(0, order\.indexOf\('properties'\)\), 0, 'assistant'\);/);
  expect(app).toMatch(/active: \{ \.\.\.savedLayout\.active, right: 'assistant' \}/);
});

it('keeps the toolbar and the status bar on one line in a narrow window (they scroll sideways)', () => {
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  const chrome = readFileSync(new URL('../../../apps/web/components/studio/studio-chrome.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/aria-label="Status bar" className="[^"]*overflow-x-auto whitespace-nowrap/);
  expect(chrome).toMatch(/flex h-14 min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap/);
});
