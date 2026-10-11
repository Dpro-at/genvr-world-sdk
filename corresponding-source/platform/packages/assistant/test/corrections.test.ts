import type { CommandPayload, CorrectionReport } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { commandTargets, CORRECTION_WINDOW_MS, CorrectionTracker } from '../src/corrections.js';

const place = (id: string) =>
  ({
    type: 'place_item',
    params: {
      instanceId: id,
      itemId: 'genvr.core.tree',
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  }) as unknown as CommandPayload;
const move = (id: string) =>
  ({ type: 'transform_item', params: { instanceId: id, position: [1, 0, 0] } }) as unknown as CommandPayload;
const remove = (id: string) =>
  ({ type: 'remove_item', params: { instanceId: id } }) as unknown as CommandPayload;

function setup() {
  const sent: CorrectionReport[] = [];
  let time = 0;
  const tracker = new CorrectionTracker(
    (report) => sent.push(report),
    () => time,
  );
  const tick = (ms: number) => {
    time += ms;
  };
  return { sent, tracker, tick };
}

describe('correction logging (P4-08)', () => {
  it('names placed things, not catalog items', () => {
    expect(commandTargets(place('a'))).toEqual(['a']);
  });

  it('logs moves and deletes of what the reply made, and ignores other edits', () => {
    const { sent, tracker, tick } = setup();
    tracker.startReply('Plant two trees');
    tracker.recordAi(place('a'));
    tracker.recordAi(place('b'));
    tracker.endReply();
    tick(2000);
    tracker.onChange(move('a'), 'edit');
    tracker.onChange(move('someone-else'), 'edit');
    tick(1000);
    tracker.onChange(remove('b'), 'edit');
    tracker.finish();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.prompt).toBe('Plant two trees');
    expect(sent[0]!.aiCommands).toHaveLength(2);
    expect(sent[0]!.corrections.map((c) => [c.kind, c.afterMs])).toEqual([
      ['moved', 2000],
      ['deleted', 3000],
    ]);
  });

  it('counts an undo right after the reply as undone, but not an undo of the builder’s own edit', () => {
    const { sent, tracker } = setup();
    tracker.startReply('A lamp');
    tracker.recordAi(place('lamp'));
    tracker.endReply();
    tracker.onChange(move('lamp'), 'edit');
    // Undoes the move (inverse transform), then the reply (removes the lamp).
    tracker.onChange(move('lamp'), 'undo');
    tracker.onChange(remove('lamp'), 'undo');
    tracker.finish();
    expect(sent[0]!.corrections.map((c) => c.kind)).toEqual(['moved', 'undone']);
  });

  it('reports kept when nothing was touched, when the next reply starts or the watch runs out', () => {
    const { sent, tracker, tick } = setup();
    tracker.startReply('A bench');
    tracker.recordAi(place('bench'));
    tracker.endReply();
    tracker.startReply('A second bench');
    expect(sent.map((r) => r.corrections[0]!.kind)).toEqual(['kept']);
    tracker.recordAi(place('bench2'));
    tracker.endReply();
    tick(CORRECTION_WINDOW_MS + 1);
    tracker.onChange(move('bench2'), 'edit');
    expect(sent.map((r) => r.corrections[0]!.kind)).toEqual(['kept', 'kept']);
  });

  it('takes changes during a reply as the assistant’s work, and ignores replies that changed nothing', () => {
    const { sent, tracker } = setup();
    tracker.startReply('Hello');
    tracker.endReply();
    tracker.finish();
    expect(sent).toHaveLength(0);
    tracker.startReply('A pond');
    tracker.onChange(place('pond'), 'edit');
    tracker.endReply();
    tracker.onChange(remove('pond'), 'edit');
    tracker.finish();
    expect(sent[0]!.aiCommands).toHaveLength(1);
    expect(sent[0]!.corrections[0]!.kind).toBe('deleted');
  });
});
