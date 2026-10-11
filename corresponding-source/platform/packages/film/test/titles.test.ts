import { describe, expect, it } from 'vitest';
import {
  FilmSession, emptyFilm, flashWarnings, fromSeconds, glyphOffsets, randomOrder, resolveAt, selectorAmount, toSeconds, transitionMask, units,
  type CaptionClip, type MediaClip, type Selector,
} from '../src/index.js';

const s = fromSeconds;
const sel = (over: Partial<Selector> = {}): Selector => ({ based: 'chars', shape: 'square', start: 0, end: 100, offset: 0, random: false, seed: 1, ...over });

describe('range selector', () => {
  it('square covers the units inside the range; offset slides it', () => {
    expect([0, 1, 2, 3].map((i) => selectorAmount(sel({ end: 50 }), i, 4))).toEqual([1, 1, 0, 0]);
    expect([0, 1, 2, 3].map((i) => selectorAmount(sel({ offset: 50 }), i, 4))).toEqual([0, 0, 1, 1]);
    expect([0, 1, 2, 3].map((i) => selectorAmount(sel({ offset: 100 }), i, 4))).toEqual([0, 0, 0, 0]);
  });
  it('soft shapes fade at the edges, and random order is fixed by the seed', () => {
    const smooth = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => selectorAmount(sel({ shape: 'smooth', end: 50 }), i, 10));
    expect(smooth.slice(0, 5)).toEqual([1, 1, 1, 1, 1]); expect(smooth[9]).toBe(0);
    expect(smooth[5]).toBeGreaterThan(0); expect(smooth[5]).toBeLessThan(1);
    expect(selectorAmount(sel({ shape: 'rampUp' }), 0, 4)).toBeCloseTo(0.125, 9);
    expect(randomOrder(6, 7)).toEqual(randomOrder(6, 7));
    expect(randomOrder(6, 7)).not.toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('units by characters, words and lines; offsets per character', () => {
    expect(units('Hi you', 'chars')).toEqual([[0], [1], [3], [4], [5]]);
    expect(units('Hi you', 'words')).toEqual([[0, 1], [3, 4, 5]]);
    expect(units('a b\nc', 'lines')).toEqual([[0, 2], [4]]);
    const g = glyphOffsets('ab', [{ props: { opacity: -1, y: 10 }, selector: sel({ end: 50 }) }]);
    expect(g[0]).toMatchObject({ opacity: -1, y: 10 }); expect(g[1]).toMatchObject({ opacity: 0, y: 0 });
  });
});

describe('title commands', () => {
  const film = () => { let n = 0; return new FilmSession(emptyFilm(), () => `id${++n}`); };
  const caption = (f: FilmSession) => f.project.tracks.find((t) => t.kind === 'caption')!.clips[0] as CaptionClip;
  it('templates, style, presets in and out; the typewriter reveals letters over time', () => {
    const f = film();
    expect(f.run('title.add', { template: 'strip', text: 'Lina', subtitle: 'Captain', start: 0, duration: 4 })).toEqual({ ok: true, result: 'id1' });
    expect(caption(f)).toMatchObject({ template: 'strip', subtitle: 'Captain', title: { size: 44, align: 'left' }, transform: { x: -0.55, y: -0.68 } });
    expect(f.history.undoLabel).toBe('Add name strip');
    expect(f.run('title.style', { clip: 'id1', color: '#ffcc00', font: 'display' })).toMatchObject({ ok: true });
    expect(caption(f).title!.box).toBeDefined();
    expect(f.run('title.style', { clip: 'id1', box: null })).toMatchObject({ ok: true });
    expect(caption(f).title!.box).toBeUndefined();
    expect(f.run('title.animate', { clip: 'id1', preset: 'typewriter' })).toMatchObject({ ok: true });
    const a = caption(f).animators![0]!;
    const at = (t: number) => (resolveAt(caption(f), s(t)) as CaptionClip).animators![0]!.selector.offset;
    expect(at(0)).toBe(0); expect(at(1.5)).toBe(100); expect(at(0.75)).toBeCloseTo(50, 6);
    expect(a.preset).toBe('typewriter:in');
    expect(f.run('title.animate', { clip: 'id1', preset: 'fade_up', edge: 'out' })).toMatchObject({ ok: true });
    const out = caption(f).animators![1]!;
    expect((resolveAt(caption(f), s(4)) as CaptionClip).animators![1]!.selector.offset).toBe(0);
    expect(f.run('animator.remove', { clip: 'id1', animator: a.id })).toMatchObject({ ok: true });
    expect(Object.keys(caption(f).keys!)).toEqual([`animators.${out.id}.offset`]);
    expect(f.run('title.animate', { clip: 'id1', preset: 'spin' })).toMatchObject({ ok: false });
  });
  it('plain captions must become titles before moving or animating', () => {
    const f = film();
    f.run('caption.add', { text: 'Hello', start: 0 });
    expect(f.run('clip.transform', { clip: 'id1', scale: 2 })).toMatchObject({ ok: false, reason: expect.stringContaining('title first') });
    expect(f.run('title.style', { clip: 'id1' })).toMatchObject({ ok: true });
    expect(f.run('clip.transform', { clip: 'id1', scale: 2 })).toMatchObject({ ok: true });
    expect(f.run('key.add', { clip: 'id1', property: 'opacity', at: 1 })).toMatchObject({ ok: true });
  });
});

describe('transitions', () => {
  const film = () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'a', kind: 'video', asset: 'x', name: 'A', duration: s(6), camera: null, cues: [] } });
    f.run('media.add', { media: { id: 'b', kind: 'video', asset: 'y', name: 'B', duration: s(6), camera: null, cues: [] } });
    return f; // A on 0..6 (id1), B on 6..12 (id2)
  };
  it('needs handles: refuses with a reason, works after trimming', () => {
    const f = film();
    expect(f.run('transition.add', { clip: 'id2', kind: 'dissolve', duration: 1 })).toMatchObject({ ok: false, reason: expect.stringContaining('A has only 0.00 s of recording after its end') });
    f.run('clip.trim', { clip: 'id1', edge: 'end', by: -1, ripple: true });
    f.run('clip.trim', { clip: 'id2', edge: 'start', by: 1, ripple: true });
    expect(f.run('transition.add', { clip: 'id2', kind: 'wipe', duration: 1, params: { angle: 90 } })).toMatchObject({ ok: true });
    expect((f.project.tracks[0]!.clips[1] as MediaClip).transition).toMatchObject({ kind: 'wipe', align: 'centre', params: { angle: 90, softness: 0.05 } });
    expect(f.run('transition.add', { clip: 'id1', kind: 'dissolve' })).toMatchObject({ ok: false, reason: expect.stringContaining('clip right before') });
    expect(f.run('transition.set', { clip: 'id2', params: { angle: 999 } })).toMatchObject({ ok: false, reason: expect.stringContaining('between -180 and 180') });
  });
  it('the part before the cut must fit the outgoing clip, the part after it the incoming one', () => {
    const f = film();
    f.run('clip.trim', { clip: 'id1', edge: 'end', by: -5.5, ripple: true }); // A lasts 0.5 s
    f.run('clip.trim', { clip: 'id2', edge: 'start', by: 2, ripple: true }); // B has 2 s before its start
    expect(f.run('transition.add', { clip: 'id2', kind: 'dissolve', duration: 1, align: 'end' })).toMatchObject({ ok: false, reason: expect.stringContaining('longer than one of its clips') });
    expect(f.run('transition.add', { clip: 'id2', kind: 'dissolve', duration: 0.5, align: 'end' })).toMatchObject({ ok: true });
  });
  it('deleting the clip before a transition removes the transition, not the edit', () => {
    const f = film();
    f.run('clip.trim', { clip: 'id1', edge: 'end', by: -1, ripple: true });
    f.run('clip.trim', { clip: 'id2', edge: 'start', by: 1, ripple: true });
    expect(f.run('transition.add', { clip: 'id2', kind: 'dissolve', duration: 1 })).toMatchObject({ ok: true });
    expect(f.reason('clip.remove', { clips: ['id1'] })).toBeNull();
    expect(f.run('clip.remove', { clips: ['id1'] })).toMatchObject({ ok: true });
    expect((f.project.tracks[0]!.clips[0] as MediaClip).transition).toBeUndefined();
  });
  it('a split gives the transition and the fade in only to the left part, the fade out only to the right', () => {
    const f = film();
    f.run('clip.trim', { clip: 'id1', edge: 'end', by: -1, ripple: true });
    f.run('clip.trim', { clip: 'id2', edge: 'start', by: 1, ripple: true });
    expect(f.run('transition.add', { clip: 'id2', kind: 'dip_black', duration: 1 })).toMatchObject({ ok: true });
    expect(f.run('clip.fade', { clip: 'id2', in: 1, out: 1 })).toMatchObject({ ok: true });
    expect(f.run('clip.split', { at: 8, clips: ['id2'] })).toMatchObject({ ok: true });
    const [left, right] = f.project.tracks[0]!.clips.slice(1) as MediaClip[];
    expect(left!.transition?.kind).toBe('dip_black');
    expect(left!.fade).toEqual({ in: s(1), out: 0 });
    expect(right!.transition).toBeUndefined();
    expect(right!.fade).toEqual({ in: 0, out: s(1) });
  });
  it('masks go from all A to all B', () => {
    for (const kind of ['wipe', 'iris', 'blocks', 'dissolve'] as const) {
      expect(transitionMask(kind, {}, [0.3, 0.7], 0)).toBe(0);
      expect(transitionMask(kind, {}, [0.3, 0.7], 1)).toBe(1);
    }
    expect(transitionMask('wipe', { angle: 0, softness: 0 }, [0.2, 0.5], 0.5)).toBe(1);
    expect(transitionMask('wipe', { angle: 0, softness: 0 }, [0.8, 0.5], 0.5)).toBe(0);
  });
  it('warns about white flashes closer than 1/3 s', () => {
    const f = film();
    const p = structuredClone(f.project);
    const [a, b] = p.tracks[0]!.clips as MediaClip[];
    a!.duration = s(0.2); b!.start = s(0.2);
    b!.transition = { kind: 'dip_white', duration: s(0.1), align: 'centre', params: {} };
    const c = { ...b!, id: 'c', start: s(0.4), transition: { kind: 'dip_white' as const, duration: s(0.1), align: 'centre' as const, params: {} } };
    p.tracks[0]!.clips.push(c);
    expect(flashWarnings(p)).toEqual([expect.stringContaining('closer than 1/3 s')]);
  });
});

describe('title keys follow edits', () => {
  it('a split keeps every key on its film moment; trims keep in and out animations on their edges', () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `k${++n}`);
    expect(f.run('title.add', { text: 'Hello', start: 0, duration: 6 })).toMatchObject({ ok: true });
    const title = () => f.project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'caption')!;
    const id = title().id;
    expect(f.run('title.animate', { clip: id, preset: 'typewriter', edge: 'in' })).toMatchObject({ ok: true });
    expect(f.run('title.animate', { clip: id, preset: 'typewriter', edge: 'out' })).toMatchObject({ ok: true });
    const lanes = () => Object.values((title() as { keys: Record<string, { at: number }[]> }).keys).map((k) => k.map((x) => toSeconds(x.at)));
    expect(lanes()).toEqual([[0, 1.5], [4.5, 6]]);
    expect(f.run('clip.trim', { clip: id, edge: 'end', by: -1 })).toMatchObject({ ok: true });
    expect(lanes()).toEqual([[0, 1.5], [3.5, 5]]); // the out animation still ends with the clip
    expect(f.run('clip.trim', { clip: id, edge: 'start', by: 1 })).toMatchObject({ ok: true });
    expect(lanes()).toEqual([[0, 1.5], [2.5, 4]]); // the in animation stays at the start; the rest keeps its film moment
    expect(f.run('clip.split', { at: 3, clips: [id] })).toMatchObject({ ok: true });
    const parts = f.project.tracks.flatMap((t) => t.clips).filter((c) => c.type === 'caption') as { start: number; keys: Record<string, { at: number }[]> }[];
    const right = parts.find((c) => c.start === s(3))!;
    expect(Object.values(right.keys).map((k) => k.map((x) => toSeconds(x.at)))).toEqual([[-2, -0.5], [0.5, 2]]);
  });
});
