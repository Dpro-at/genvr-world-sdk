import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// A host with its own place list (Girru): My projects returns to it, and Motion lab opens directly.
it('hands My projects to a host with onHome and can open the motion lab at once', () => {
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../studio/api.d.ts', import.meta.url), 'utf8');
  expect(app).toMatch(/leave=\{\(\) => \{ if \(options\.onHome\) \{ options\.onHome\(\); return; \}/);
  expect(app).toMatch(/: options\.onHome \? <div/);
  expect(app).toMatch(/else if\(options\.openLab\)void openMyLab\(\)/);
  expect(api).toMatch(/onHome\?: \(\) => void;/);
  expect(api).toMatch(/openLab\?: boolean;/);
});

it('gives a desktop host the full editor in a narrow window', () => {
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../../../apps/web/components/studio/layout.ts', import.meta.url), 'utf8');
  expect(app).toMatch(/desktop = useIsDesktop\(options\.desktopLayout \? 0 : undefined\);/);
  expect(layout).toMatch(/export function useIsDesktop\(minWidth = 1024\)/);
  expect(layout).toMatch(/minWidth > 0 \? `\(min-width: \$\{minWidth\}px\) and \(pointer: fine\)` : '\(pointer: fine\)'/);
});
