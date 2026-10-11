import { describe, expect, it, vi } from 'vitest';
import { CanopyLoading } from '../src/vegetation/canopy-loading.js';

function fixture() {
  const resource = { dispose: vi.fn() };
  let resolve!: (value: typeof resource) => void, reject!: (error: Error) => void;
  const promise = new Promise<typeof resource>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const callbacks = { load: vi.fn(() => promise), reload: vi.fn(), notify: vi.fn(), report: vi.fn() };
  return { resource, resolve, reject, callbacks, loader: new CanopyLoading(callbacks) };
}
describe('lazy canopy loading', () => {
  it('coalesces requests and promotes each type once after readiness', async () => {
    const f = fixture();
    f.loader.request('tree');
    f.loader.request('tree');
    f.loader.request('shrub');
    expect(f.loader.busy).toBe(true);
    expect(() => f.loader.assertCaptureReady()).toThrow('preparing');
    await Promise.resolve();
    expect(f.callbacks.load).toHaveBeenCalledTimes(1);
    f.resolve(f.resource);
    await f.loader.settled();
    expect(f.callbacks.reload.mock.calls).toEqual([['tree'], ['shrub']]);
    expect(f.loader.resource).toBe(f.resource);
    expect(f.loader.busy).toBe(false);
    expect(() => f.loader.assertCaptureReady()).not.toThrow();
    await f.loader.close();
    await f.loader.close();
    expect(f.resource.dispose).toHaveBeenCalledTimes(1);
  });
  it('does not allocate if closed before the queued task starts', async () => {
    const f = fixture();
    f.loader.request('tree');
    await f.loader.close();
    expect(f.callbacks.load).not.toHaveBeenCalled();
    expect(f.callbacks.reload).not.toHaveBeenCalled();
  });
  it('waits for pending GPU work before releasing renderer use and never promotes after close', async () => {
    const f = fixture();
    f.loader.request('tree');
    await Promise.resolve();
    const rendererDispose = vi.fn();
    const closed = f.loader.close().then(rendererDispose);
    await Promise.resolve();
    expect(rendererDispose).not.toHaveBeenCalled();
    f.resolve(f.resource);
    await closed;
    expect(f.resource.dispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(f.callbacks.reload).not.toHaveBeenCalled();
    expect(f.loader.resource).toBeNull();
  });
  it('rolls every partially promoted type back after clearing the failed owner', async () => {
    const f = fixture(),
      observations: boolean[] = [];
    f.callbacks.reload.mockImplementation((id: string) => {
      observations.push(!!f.loader.resource);
      if (id === 'shrub' && f.loader.resource) throw new Error('promotion failed');
    });
    f.loader.request('tree');
    f.loader.request('shrub');
    f.resolve(f.resource);
    await f.loader.settled();
    expect(observations).toEqual([true, true, false, false]);
    expect(f.resource.dispose).toHaveBeenCalledTimes(1);
    expect(f.loader.failed).toBe(true);
    f.loader.request('tree');
    expect(f.callbacks.load).toHaveBeenCalledTimes(1);
  });
  it('isolates editor notification errors from successful resource promotion', async () => {
    const f = fixture();
    f.callbacks.notify.mockImplementation(() => {
      throw new Error('editor failed');
    });
    f.loader.request('tree');
    f.loader.request('shrub');
    f.resolve(f.resource);
    await f.loader.settled();
    expect(f.loader.failed).toBe(false);
    expect(f.loader.resource).toBe(f.resource);
    expect(f.callbacks.reload).toHaveBeenCalledTimes(2);
    expect(f.callbacks.report).toHaveBeenCalledTimes(2);
    await f.loader.close();
  });
  it('falls back after load failure without retry loops', async () => {
    const f = fixture();
    f.loader.request('tree');
    f.reject(new Error('GPU failed'));
    await f.loader.settled();
    expect(f.loader.failed).toBe(true);
    expect(f.loader.busy).toBe(false);
    expect(f.loader.resource).toBeNull();
    expect(f.callbacks.reload).toHaveBeenCalledWith('tree');
    f.loader.request('tree');
    expect(f.callbacks.load).toHaveBeenCalledTimes(1);
  });
});
