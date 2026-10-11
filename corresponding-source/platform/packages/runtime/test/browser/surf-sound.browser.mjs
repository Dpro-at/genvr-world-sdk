// The surf sound on a test island (plan task 6), headless Chromium with WebGPU, SOUND MUTED (--mute-audio): the
// sound is checked by its event log and timing, never by listening.
// Usage: pnpm --filter @genvr/runtime build && node test/browser/surf-sound.browser.mjs [seconds] [query]
//   query e.g. "phone=1" (no Tidewater sea: the shore field for the sound alone) or "cam=0,1.7,-120"
import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const seaAudio = fileURLToPath(new URL('../../../../apps/web/public/audio/sea/', import.meta.url));
const pnpmDir = join(root, '../../../node_modules/.pnpm');
const dir = readdirSync(pnpmDir).find((d) => d.startsWith('playwright@'));
const { chromium } = await import(pathToFileURL(join(pnpmDir, dir, 'node_modules/playwright/index.mjs')).href);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = url.startsWith('/audio/sea/') ? seaAudio : root;
    const path = normalize(join(base, url.startsWith('/audio/sea/') ? url.slice('/audio/sea/'.length) : url));
    if (!path.startsWith(normalize(base))) throw new Error('outside');
    const body = await readFileAsync(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const seconds = Number(process.argv[2] ?? 30);
const query = process.argv[3] ?? '';
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error('[page]', m.text().slice(0, 400), m.location()?.url ?? ''));
  page.on('response', (r) => r.status() >= 400 && console.error('[404]', r.url()));
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 400)));
  await page.goto(`http://127.0.0.1:${port}/test/browser/surf-sound.html?${query}`);
  await page.waitForFunction(() => window.__surf, null, { timeout: 60000 });
  // the audio starts on the first tap (browser rule), as in the app
  await page.mouse.click(10, 10);
  await page.waitForTimeout(seconds * 1000);
  const report = await page.evaluate(() => {
    const { surf, audio } = window.__surf;
    const log = surf.log;
    const by = (k) => log.filter((e) => e.kind === k);
    const ahead = log.filter((e) => e.audioAt !== null).map((e) => e.audioAt);
    return {
      audioRunning: audio.audioTime !== null,
      stations: surf.scheduler.stations.length,
      shoreDistance: Math.round(surf.scheduler.shoreDistance * 10) / 10,
      events: log.length,
      crash: by('crash').length,
      wash: by('wash').length,
      backwash: by('backwash').length,
      played: log.filter((e) => e.played).length,
      fake: log.filter((e) => e.fake).length,
      waves: [...new Set(by('crash').map((e) => e.wave))].length,
      sorted: ahead.every((t, i) => i === 0 || t >= ahead[i - 1] - 0.3),
      loaded: ['surf_crash', 'surf_wash', 'surf_backwash', 'surf_far'].map((b) => audio.sampleReady(surf.url(b))),
      sample: log.slice(-8).map((e) => `${e.kind} m${e.wave} t${e.time.toFixed(2)} d${e.distance.toFixed(0)}m g${e.gain.toFixed(3)} ${e.played ? 'played' : 'skipped'}`),
    };
  });
  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
  server.close();
}
