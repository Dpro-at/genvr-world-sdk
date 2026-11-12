import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// GV1c v2: a host's market is the Studio's Items catalog; Add opens a place with the item in Items.
it('exports mountMarket with the Items library and opens a place with an item ready to place', () => {
  const market = readFileSync(new URL('../studio/market.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../studio/app.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../studio/api.d.ts', import.meta.url), 'utf8');
  expect(market).toMatch(/<LibraryPanel key=\{style\} runtime=\{runtime\} status=\{IDLE\} style=\{style\} \/>/);
  expect(market).toMatch(/options\.onAdd\?\.\(manifest\.id\)/);
  expect(market).toMatch(/Paid items are bought on GenVR\./);
  expect(app).toMatch(/export \{ mountMarket, type MarketOptions \} from '\.\/market';/);
  expect(app).toMatch(/setTab\('items'\); setLibraryDetails\(entry\);/);
  expect(app).toMatch(/const builtIn = LIBRARY\.find\(item => item\.manifest\.id === options\.placeItem\);/);
  expect(api).toMatch(/export declare function mountMarket/);
  expect(api).toMatch(/placeItem\?: string;/);
});
