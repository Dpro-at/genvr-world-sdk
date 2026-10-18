import { registerAvatarMotionLibrary } from '@genvr/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarPresentation, resolvePresentationAnimation } from '../src/avatar-presentation.js';
import { WorldSession } from '../src/session.js';
import { AvatarPresentationEvent, type ChatModel } from '@genvr/assistant';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const setup = (options = {}) => {
  const runtime = { presentAnimation: vi.fn(() => true), presentExpression: vi.fn(() => true) };
  return { runtime, controller: new AvatarPresentation(() => runtime, options) };
};
describe('shared sidebar and assistant presentation executor', () => {
  it('runs model tool calls without saving presentation to the world', async () => {
    const { controller, runtime } = setup(); const session = WorldSession.create(); const before = session.serialize();
    const detach = session.attachPresentation(controller.execute); let calls = 0;
    const model: ChatModel = async () => ++calls === 1 ? { content: '', tool_calls: [
      { function: { name: 'present_avatar', arguments: { event: { kind: 'expression', target: 'agent-one', expression: 'smile' } } } },
      { function: { name: 'present_avatar', arguments: { event: { kind: 'effect', effect: 'rain', enabled: true } } } },
      { function: { name: 'present_avatar', arguments: { event: { kind: 'notification', notification: { type: 'stock', title: 'Market update', body: 'Sample data' } } } } },
    ] } : { content: 'Done.', tool_calls: [] };
    await session.generate('Smile and show the sample market card with rain.', model);
    expect(runtime.presentExpression).toHaveBeenCalledWith('host-agent:agent-one', 'smile');
    expect(controller.snapshot().effects.rain).toBe(.6); expect(controller.snapshot().notifications[0]?.type).toBe('stock');
    expect(session.serialize()).toBe(before);
    expect(controller.execute({ kind: 'expression', target: 'agent-two', expression: 'sad' })).toBeNull();
    expect(runtime.presentExpression).toHaveBeenLastCalledWith('host-agent:agent-two', 'sad');
    detach(); expect((await session.tool('present_avatar', { event: { kind: 'clear' } })).ok).toBe(false); controller.dispose();
  });
  it('replaces deadlines per target and restores neutral/idle', () => {
    const { controller, runtime } = setup();
    controller.execute({ kind: 'expression', target: 'a', expression: 'smile', duration: 1000 }); vi.advanceTimersByTime(500);
    controller.execute({ kind: 'expression', target: 'a', expression: 'sad', duration: 2000 });
    controller.execute({ kind: 'animation', target: 'b', animation: 'expr_wave', duration: 1000 }); vi.advanceTimersByTime(500);
    expect(runtime.presentExpression).not.toHaveBeenCalledWith('host-agent:a', 'neutral'); vi.advanceTimersByTime(500);
    expect(runtime.presentAnimation).toHaveBeenLastCalledWith('host-agent:b', 'idle'); vi.advanceTimersByTime(1000);
    expect(runtime.presentExpression).toHaveBeenLastCalledWith('host-agent:a', 'neutral'); controller.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects unsupported input before mutation', () => {
    const { controller, runtime } = setup();
    expect(controller.execute({ kind: 'animation', animation: 'missing' })).toMatch(/unavailable/); expect(runtime.presentAnimation).not.toHaveBeenCalled();
    expect(controller.execute({ kind: 'effect', effect: 'rain', enabled: true, intensity: 100 })).toMatch(/Invalid/);
    expect(controller.execute({ kind: 'notification', notification: { type: 'gif', title: 'X', body: '', gifUrl: 'javascript:alert(1)' } })).toMatch(/Invalid/);
    expect(AvatarPresentationEvent.safeParse({ kind: 'card', title: 'bad', spec: { root: 'r', elements: { r: { type: 'Card', props: {}, children: ['r'] } } } }).success).toBe(false);
    expect(setup({ enabled: false }).controller.execute({ kind: 'clear' })).toMatch(/disabled/); controller.dispose(); expect(controller.execute({ kind: 'clear' })).toMatch(/disabled/);
  });
  it('does not report failed host approval/reply as success', async () => {
    const approve = vi.fn(async (_notice: unknown) => { throw new Error('Host refused'); }); const reply = vi.fn(async () => { throw new Error('Offline'); });
    const { controller } = setup({ actions: { approve, reply } });
    controller.execute({ kind: 'notification', notification: { type: 'email', title: 'Message', body: 'Hello', needsApproval: true, canReply: true, sourceId: 'source-1' } });
    const id = controller.snapshot().notifications[0]!.id; vi.advanceTimersByTime(60000); expect(controller.snapshot().notifications).toHaveLength(1);
    await expect(controller.approve(id)).rejects.toThrow('Host refused'); await expect(controller.reply(id, 'Hi')).rejects.toThrow('Offline');
    expect(controller.snapshot().notifications[0]?.repliedWith).toBeUndefined(); expect(approve.mock.calls[0]?.[0]).toMatchObject({ sourceId: 'source-1' }); controller.dispose();
  });
  it('bounds queues and disposes deadlines and active gestures', () => {
    const { controller, runtime } = setup();
    for (let i = 0; i < 20; i++) controller.execute({ kind: 'notification', notification: { type: 'msg', title: 'Notice', body: '' } });
    expect(controller.snapshot().notifications).toHaveLength(5); controller.execute({ kind: 'animation', animation: 'expr_wave' });
    controller.execute({ kind: 'expression', expression: 'thinking' }); controller.execute({ kind: 'effect', effect: 'snow', enabled: true }); controller.clear();
    expect(runtime.presentAnimation).toHaveBeenLastCalledWith('self', 'idle'); expect(runtime.presentExpression).toHaveBeenLastCalledWith('self', 'neutral');
    expect(controller.snapshot().effects).toEqual({}); expect(vi.getTimerCount()).toBe(0); expect(resolvePresentationAnimation('expr_wave')).toMatch(/wave/); controller.dispose();
  });
});

it('routes host catalog IDs from assistant tools to the chosen agent', async () => {
  const id = 'motion:genvr_test_wave';
  const remove = registerAvatarMotionLibrary({ entries: [{ id, name: 'Wave', category: 'Gestures', loop: false, load: async () => new ArrayBuffer(0) }] });
  const { controller, runtime } = setup();
  const session = WorldSession.create(), detach = session.attachPresentation(controller.execute);
  try {
    const result = await session.tool('present_avatar', { event: { kind: 'animation', target: 'one', animation: id } });
    expect(result.ok).toBe(true);
    expect(runtime.presentAnimation).toHaveBeenCalledWith('host-agent:one', id);
  } finally { detach(); controller.dispose(); remove(); }
});
