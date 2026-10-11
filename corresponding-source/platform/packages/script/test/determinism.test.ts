import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PlaceScript } from '@genvr/contracts';
import { createScriptModule, mulberry32, scriptSeed, type ScriptModule } from '../src/index.js';
import { place } from './support.js';

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
const open: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const t of open.splice(0)) t.dispose();
});
function make(options: Parameters<typeof place>[0]) {
  const t = place(options);
  open.push(t);
  return t;
}
const fixed = (source: string, id = 'scr-0000abcd'): PlaceScript => ({
  id,
  name: 'example',
  api: 1,
  enabled: true,
  source,
});

/** An example script whose requests depend on random numbers, the clock and the events. */
const CHOOSER = fixed(`
  const picks = [];
  genvr.on('zone_crossed', (e) => {
    const r = genvr.random();
    picks.push(r);
    if (r < 0.5) genvr.act({ kind: 'add_counter', name: 'n', by: Math.floor(Math.random() * 10) });
    else genvr.act({ kind: 'add_score', by: 1 }, { actor: e.actor === 'p1' ? 'p2' : 'p1' });
    if (Date.now() % 3 === 0) genvr.emit('third');
  });
  genvr.on('third', () => genvr.act({ kind: 'add_counter', name: 'g', by: 1 }));
`);

function playOnce(seed: number) {
  const t = make({ module: mod, scripts: [CHOOSER], runner: { seed } });
  for (let i = 0; i < 12; i++) t.cross(i % 3 === 0 ? 'b' : 'a');
  return { requests: JSON.stringify(t.requests), view: JSON.stringify([...t.session.view().players]) };
}

describe('determinism', () => {
  it('the same events and seed give identical requests twice', () => {
    const first = playOnce(1234);
    const second = playOnce(1234);
    expect(second).toEqual(first);
    expect(JSON.parse(first.requests).length).toBeGreaterThan(10);
  });

  it('another seed gives other numbers', () => {
    expect(playOnce(1).requests).not.toEqual(playOnce(2).requests);
  });

  it('Math.random is the same generator as genvr.random, predictable from the seeds', () => {
    const a = make({
      module: mod,
      runner: { seed: 77 },
      scripts: [fixed(`genvr.log(Math.random(), genvr.random(), Math.random());`)],
      noStart: true,
    });
    const next = mulberry32(scriptSeed(77, 'scr-0000abcd'));
    expect(a.texts('log')).toEqual([[next(), next(), next()].join(' ')]);
  });

  it('Date follows the session clock', () => {
    const t = make({
      module: mod,
      scripts: [
        fixed(`genvr.on('tap', () => {
          const a = Date.now(), b = new Date().getTime(), c = genvr.now();
          let spin = 0; for (let i = 0; i < 20000; i++) spin += i;
          genvr.log(a, b, c, Date.now() - a, typeof Date(), new Date(5).getTime(), new Date() instanceof Date);
        });`),
      ],
    });
    t.raise('tap');
    t.tick(1000);
    t.raise('tap');
    expect(t.texts('log')).toEqual(['200 200 200 0 string 5 true', '1200 1200 1200 0 string 5 true']);
  });

  it('local time is UTC whatever the host time zone (review finding 6)', () => {
    const probe = fixed(`genvr.on('tap', () => {
      const d = new Date(0);
      genvr.log(d.getHours(), d.getDate(), d.getTimezoneOffset(), d.toString());
      genvr.log(new Date(2020, 0, 1, 12).getTime(), Date.parse('2020-01-01T12:00'), new Date('2020-06-01T12:00').getTime());
      genvr.log(d.toDateString(), '|', d.toTimeString(), '|', d.toLocaleString(), '|', d.getYear());
      const e = new Date(0); e.setHours(5); e.setDate(3); genvr.log(e.getTime(), e.getUTCHours());
      genvr.log(new Date('Jan 2 2020 10:00').getTime(), new Date('2020-01-02T10:00:00+02:00').getTime(), Date.parse('2020-01-02'));
    });`);
    const before = process.env.TZ;
    const runIn = (tz: string) => {
      process.env.TZ = tz;
      const t = make({ module: mod, scripts: [probe] });
      t.raise('tap');
      return t.texts('log');
    };
    try {
      const newYork = runIn('America/New_York');
      const tokyo = runIn('Asia/Tokyo');
      expect(tokyo).toEqual(newYork);
      expect(newYork).toEqual([
        '0 1 0 Thu Jan 01 1970 00:00:00 GMT+0000',
        `${Date.UTC(2020, 0, 1, 12)} ${Date.UTC(2020, 0, 1, 12)} ${Date.UTC(2020, 5, 1, 12)}`,
        'Thu Jan 01 1970 | 00:00:00 GMT+0000 | 01/01/1970, 12:00:00 AM | 70',
        `${Date.UTC(1970, 0, 3, 5)} 5`,
        `${Date.UTC(2020, 0, 2, 10)} ${Date.UTC(2020, 0, 2, 8)} ${Date.UTC(2020, 0, 2)}`,
      ]);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('timing probes see no clock but the session clock', () => {
    const t = make({
      module: mod,
      scripts: [
        fixed(`genvr.on('tap', () => {
          genvr.log(typeof performance, typeof queueMicrotask, typeof WeakRef, typeof FinalizationRegistry, typeof setTimeout, typeof setInterval);
        });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['undefined undefined undefined undefined undefined undefined']);
  });
});
