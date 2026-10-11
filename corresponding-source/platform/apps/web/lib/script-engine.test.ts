import { DATA_LINE, runTool, type AssistantHost } from '@genvr/assistant';
import { WorldDocument } from '@genvr/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The studio assistant's script host (P2-10 Task 9): the sandbox loads on first use and the log and the last match come
// from the API. The script is an example written for this test.

const EXAMPLE = `genvr.on('zone_crossed', (e) => {
  if (e.tag !== 'line') return;
  genvr.act({ kind: 'add_counter', name: 'passes', by: 1 });
  genvr.log('pass', e.id);
});`;

const doc = WorldDocument.parse({
  schemaVersion: 1,
  experienceId: 'exp-1',
  version: 4,
  style: { base: 'blocky' },
  sizeTier: 'small',
  access: { mode: 'private' },
  environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
  terrain: {},
  spawn: { position: [0, 1, 0] },
  instances: [
    {
      instanceId: 'gate-1',
      itemId: 'genvr.core.gameplay.zone-gate',
      transform: { position: [0, 0, 10] },
      params: { zoneTag: 'line' },
    },
  ],
  game: {
    match: { minPlayers: 1, durationSec: 300, countdownSec: 0, resultsSec: 3 },
    win: { by: 'highest_score' },
    counters: [{ name: 'passes', scope: 'player', start: 0 }],
  },
  scripts: [{ id: 'scr-0000aaaa', name: 'example', api: 1, enabled: true, source: EXAMPLE }],
});

const RECORDING = {
  seed: 5,
  events: [
    { type: 'player_joined', actor: 'p1', id: 'p1', team: null, returning: false },
    { type: 'zone_crossed', actor: 'p1', id: 'p1', zone: 'gate-1', tag: 'line' },
  ],
  at: [0, 600],
  caused: [false, false],
};

const asked: string[] = [];
let host: AssistantHost;

beforeAll(async () => {
  // The API client takes `fetch` when it is made, so the stand-in goes in before the module loads.
  vi.stubGlobal('fetch', async (input: Request | string) => {
    const url = typeof input === 'string' ? input : input.url;
    asked.push(url.replace(/^https?:\/\/[^/]+/, ''));
    const body = url.includes('/scripts/recording')
      ? { recording: RECORDING }
      : {
          version: 4,
          scripts: doc.scripts,
          rooms: 1,
          lines: [{ at: 900, script: 'example', level: 'log', text: 'pass p1' }],
          status: [],
        };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
  const { studioScriptHost } = await import('./script-engine');
  host = {
    world: () => doc,
    apply: () => null,
    ...studioScriptHost('exp-1'),
  } as unknown as AssistantHost;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('the studio assistant host runs the script tools (P2-10 Task 9)', () => {
  it('test_script replays the room’s last match through the sandbox, loaded on first use', async () => {
    const answer = await runTool('test_script', { script_id: 'scr-0000aaaa', recording: 'last_match' }, host);
    expect(answer.ok, answer.result).toBe(true);
    expect(answer.result.startsWith(DATA_LINE)).toBe(true);
    expect(answer.result).toContain('add_counter');
    expect(answer.result).not.toContain('not available');
    expect(asked).toContain('/v1/experiences/exp-1/scripts/recording');
  });

  it('get_script_logs reads the open rooms’ log through the API', async () => {
    const answer = await runTool('get_script_logs', {}, host);
    expect(answer.ok, answer.result).toBe(true);
    expect(answer.result).toContain('pass p1');
    expect(asked.some((url) => url.startsWith('/v1/experiences/exp-1/scripts'))).toBe(true);
  });

  it('set_script answers with the syntax finding from the sandbox', async () => {
    // A host whose world takes the command, as the studio runtime does.
    let world = doc;
    const applying = {
      ...host,
      world: () => world,
      apply: (
        commands: Array<{ type: string; params: { scriptId?: string; script?: { source: string } | null } }>,
      ) => {
        for (const command of commands)
          if (command.type === 'set_script' && command.params.script)
            world = {
              ...world,
              scripts: world.scripts!.map((one) =>
                one.id === command.params.scriptId ? { ...one, ...command.params.script } : one,
              ),
            };
        return null;
      },
    } as unknown as AssistantHost;
    const answer = await runTool(
      'set_script',
      { script_id: 'scr-0000aaaa', source: "genvr.on('player_joined', (e) => { genvr.log('a' e.id); });" },
      applying,
    );
    expect(answer.result).toContain('script-syntax line 1, column 26');
  });
});
