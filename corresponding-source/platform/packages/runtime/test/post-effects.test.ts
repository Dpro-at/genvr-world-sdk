import { Scene, PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { PostEffects } from '../src/post-effects.js';
import { UNDERWATER, WorldAudio } from '../src/audio.js';

/** A renderer that only records that it was asked to draw; no GPU is involved. */
function stubRenderer() {
  const render = vi.fn();
  return { renderer: { render } as unknown as WebGPURenderer, render };
}

describe('screen effects (P2-36, P2-39)', () => {
  it('draws the plain way while nothing is wanted', () => {
    const { renderer, render } = stubRenderer();
    const post = new PostEffects(renderer, new Scene(), new PerspectiveCamera());
    post.render();
    expect(render).toHaveBeenCalledTimes(1);
    // Asking for nothing again changes nothing.
    post.set(false, { on: false, rays: false });
    post.render();
    expect(render).toHaveBeenCalledTimes(2);
    post.dispose();
  });

  it('keeps how deep the camera is under water between none and all of it', () => {
    const { renderer } = stubRenderer();
    const post = new PostEffects(renderer, new Scene(), new PerspectiveCamera());
    // Nothing here should throw, whatever it is handed.
    expect(() => {
      post.setSubmerged(-3);
      post.setSubmerged(0.5);
      post.setSubmerged(9);
    }).not.toThrow();
    expect(post.fadeSeconds).toBeGreaterThan(0);
    expect(post.fadeSeconds).toBeLessThan(1);
    post.dispose();
  });

  it('moving how deep the camera is never rebuilds anything', () => {
    // setSubmerged only moves a number the shader already reads, so it is safe to call on every
    // frame. If it went through `set` instead, the pipeline would be rebuilt sixty times a second.
    const { renderer, render } = stubRenderer();
    const post = new PostEffects(renderer, new Scene(), new PerspectiveCamera());
    for (let i = 0; i < 100; i += 1) post.setSubmerged(i / 100);
    post.render();
    expect(render).toHaveBeenCalledTimes(1);
    post.dispose();
  });
});

describe('muffled sound under water (P2-39)', () => {
  it('opens the filter above the range of hearing, so above water nothing changes', () => {
    expect(UNDERWATER.open).toBeGreaterThanOrEqual(20000);
    expect(UNDERWATER.cutoff).toBeLessThan(1000);
    expect(UNDERWATER.fade).toBeGreaterThan(0);
  });

  it('remembers being under water before any sound has started', () => {
    // Audio only starts after the player's first tap, so the state has to survive until then.
    // Its own event target: no browser window in a test.
    const audio = new WorldAudio(new EventTarget());
    expect(audio.underwater).toBe(false);
    audio.setUnderwater(true);
    expect(audio.underwater).toBe(true);
    audio.setUnderwater(false);
    expect(audio.underwater).toBe(false);
    audio.dispose();
  });
});
