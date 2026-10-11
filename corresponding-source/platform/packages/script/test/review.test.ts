import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScriptModule, dryRun, reviewFixture, type ScriptModule } from '../src/index.js';

// The fixture a store script is dry-run against on install (spec 9.3, plan Task 10). The scripts are examples.

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
afterAll(() => mod.dispose());

const run = (source: string) => {
  const { doc, events } = reviewFixture();
  return dryRun({
    doc,
    scripts: [{ id: 'scr-00000001', name: 'example', api: 1, enabled: true, source }],
    events,
    seed: 1,
    module: mod,
  });
};

describe('reviewFixture: two players, a gate crossing each, and time for a timer', () => {
  it('has an empty game (no counters, no rules), a gate tagged "line" and two players', () => {
    const { doc, events } = reviewFixture();
    expect(doc.game?.counters ?? []).toEqual([]);
    expect(doc.game?.rules ?? []).toEqual([]);
    expect(doc.instances.filter((i) => i.params?.zoneTag === 'line')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'player_joined')).toHaveLength(2);
    // A fresh fixture each call: changing one never changes the next.
    expect(reviewFixture()).not.toBe(reviewFixture());
  });

  it('delivers both crossings and lets a started timer fire', async () => {
    const result = await run(`
genvr.on('zone_crossed', (e) => {
  genvr.log('crossed', e.id, e.tag);
  genvr.act({ kind: 'start_timer', name: 'later', seconds: 2 });
});
genvr.on('timer_fired', (e) => genvr.log('timer', e.name));
`);
    expect(result.skipped).toEqual([]);
    const lines = result.log.filter((line) => line.level === 'log').map((line) => line.text);
    expect(lines).toContain('crossed p1 line');
    expect(lines).toContain('crossed p2 line');
    expect(lines).toContain('timer later');
    expect(result.players).toEqual(['p1', 'p2']);
  });

  it('refuses a counter the empty game does not declare, with the reason', async () => {
    const result = await run(
      `genvr.on('zone_crossed', () => genvr.act({ kind: 'add_counter', name: 'passes', by: 1 }));`,
    );
    expect(result.requested.length).toBeGreaterThan(0);
    expect(result.requested.every((request) => !request.accepted && request.why)).toBe(true);
  });
});
