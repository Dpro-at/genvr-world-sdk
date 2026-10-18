import { expect, it, vi } from 'vitest';
import * as library from '../src/avatar-motion-library.js';
import { AvatarAnimator } from '../src/animator.js';
import { createGenvrAvatar, DEFAULT_LOOK } from '../src/avatar.js';
it('prepares a motion once before a recording and restores native playback when removed', async () => {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  const animator = new AvatarAnimator(avatar.root, avatar.clips), id = 'motion:prepared';
  const clip = avatar.clips.find(clip => clip.name === 'Wave')!.clone(); clip.name = id;
  const resolve = vi.spyOn(library, 'resolveAvatarLibraryMotion').mockResolvedValue({ clip, loop: false });
  const remove = library.registerAvatarMotionLibrary({ entries: [{ id, name: 'Prepared wave', category: 'Gestures', loop: false, load: async () => new ArrayBuffer(0) }] });
  try {
    animator.play('Idle');
    expect(await Promise.all([animator.prepare(id), animator.prepare(id)])).toEqual([true, true]);
    expect(resolve).toHaveBeenCalledTimes(1); expect(animator.currentClip).toBe('Idle');
    expect(animator.play(id)).toBe(true); expect(animator.currentClip).toBe(id);
    remove(); expect(animator.currentClip).toBe('Idle'); expect(animator.clipNames).not.toContain(id);
  } finally { remove(); resolve.mockRestore(); animator.dispose(); avatar.dispose(); }
});
it('clears prepared clips when the avatar skeleton is rebound', async () => {
  const one = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' }), two = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  const animator = new AvatarAnimator(one.root, one.clips), id = 'motion:prepared';
  const clip = one.clips[0]!.clone(); clip.name = id;
  const resolve = vi.spyOn(library, 'resolveAvatarLibraryMotion').mockResolvedValue({ clip, loop: true });
  const remove = library.registerAvatarMotionLibrary({ entries: [{ id, name: 'Prepared', category: 'Idle', loop: true, load: async () => new ArrayBuffer(0) }] });
  try { await animator.prepare(id); animator.rebind(two.root, two.clips); await animator.prepare(id); expect(resolve).toHaveBeenCalledTimes(2); }
  finally { remove(); resolve.mockRestore(); animator.dispose(); one.dispose(); two.dispose(); }
});
