import { describe, expect, it } from 'vitest';
import {
  FilmSession, HISTORY_STEPS, TICKS_PER_SECOND, check, emptyFilm, frame, fromSeconds, isHostOnly, migrate, readFilmFile,
  secondsOnFrame, snap, timecode, toSeconds, validRate, writeFilmFile, forExport, approvalsGained, ownerStateChanged, neededAssets, type FilmProject, type Media, type MediaClip,
} from '../src/index.js';

const s = fromSeconds;
const counter = () => { let n = 0; return () => `id${++n}`; };
const media = (id: string, seconds: number, kind: Media['kind'] = 'video'): Media =>
  ({ id, kind, asset: `asset-${id}`, name: id, duration: s(seconds), camera: null, cues: [] });

/** A film with recordings a (6 s) and b (4 s) placed end to end on V1. */
function film() {
  const session = new FilmSession(emptyFilm(), counter());
  expect(session.run('media.add', { media: media('a', 6) })).toMatchObject({ ok: true });
  expect(session.run('media.add', { media: media('b', 4) })).toMatchObject({ ok: true });
  return session;
}
const clips = (project: FilmProject, track = 'V1') =>
  project.tracks.find((t) => t.id === track)!.clips.map((c) => ({ id: c.id, start: toSeconds(c.start), end: toSeconds(c.start + c.duration),
    ...(c.type === 'media' ? { in: toSeconds(c.in) } : {}) }));
const ok = (result: { ok: boolean }) => expect(result).toMatchObject({ ok: true });

describe('time', () => {
  it('divides common frame and sample rates exactly', () => {
    for (const [num, den] of [[24000, 1001], [24, 1], [25, 1], [30000, 1001], [30, 1], [50, 1], [60000, 1001], [60, 1], [120, 1]] as const) {
      expect(validRate({ num, den })).toBe(true);
      expect(Number.isInteger(frame({ num, den }))).toBe(true);
    }
    for (const rate of [8000, 22050, 44100, 48000, 96000, 192000]) expect(TICKS_PER_SECOND % rate).toBe(0);
    expect(validRate({ num: 11, den: 1 })).toBe(false);
  });
  it('snaps to frames and shows timecode', () => {
    const rate = { num: 30, den: 1 };
    expect(snap(s(1.01), rate)).toBe(s(1));
    expect(secondsOnFrame(0.734, rate)).toBe(22 * frame(rate));
    expect(timecode(s(62.5), rate)).toBe('00:01:02:15');
  });
  it('a thousand splits and trims do not drift', () => {
    const rate = { num: 30000, den: 1001 };
    let t = 0;
    for (let i = 0; i < 1000; i++) t += frame(rate);
    expect(t).toBe(1000 * frame(rate));
    expect(t % frame(rate)).toBe(0);
  });
});

describe('edits', () => {
  it('appends new recordings end to end', () => {
    expect(clips(film().project)).toEqual([{ id: 'id1', start: 0, end: 6, in: 0 }, { id: 'id2', start: 6, end: 10, in: 0 }]);
  });
  it('splits at the playhead on every unlocked track and keeps media time', () => {
    const f = film();
    ok(f.run('playhead.set', { at: 2 }));
    ok(f.run('clip.split'));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 2, in: 0 }, { id: 'id3', start: 2, end: 6, in: 2 },
      { id: 'id2', start: 6, end: 10, in: 0 }]);
    expect(f.history.undoLabel).toBe('Split');
  });
  it('refuses a split on an edge or a gap with a reason', () => {
    const f = film();
    ok(f.run('playhead.set', { at: 6 }));
    expect(f.run('clip.split')).toEqual({ ok: false, reason: 'No clip under the playhead.' });
    expect(f.reason('clip.split', { at: 30 })).toBe('No clip under the playhead.');
  });
  it('normal trim leaves a gap; it cannot cover the neighbour', () => {
    const f = film();
    ok(f.run('clip.trim', { clip: 'id1', edge: 'end', by: -1 }));
    expect(clips(f.project)[0]).toMatchObject({ end: 5 });
    expect(clips(f.project)[1]).toMatchObject({ start: 6 });
    const wider = f.run('clip.trim', { clip: 'id1', edge: 'end', by: 2 });
    expect(wider.ok).toBe(false);
  });
  it('ripple trim moves later clips', () => {
    const f = film();
    ok(f.run('clip.trim', { clip: 'id1', edge: 'end', by: -2, ripple: true }));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 4, in: 0 }, { id: 'id2', start: 4, end: 8, in: 0 }]);
    ok(f.run('clip.trim', { clip: 'id2', edge: 'start', by: 1, ripple: true }));
    expect(clips(f.project)[1]).toEqual({ id: 'id2', start: 4, end: 7, in: 1 });
    expect(f.history.undoLabel).toBe('Ripple trim');
  });
  it('refuses to trim past the recording', () => {
    const f = film();
    expect(f.run('clip.trim', { clip: 'id2', edge: 'end', by: 1, ripple: true })).toMatchObject({ ok: false, reason: expect.stringContaining('recording') });
    expect(f.run('clip.trim', { clip: 'id1', edge: 'start', by: -1 })).toMatchObject({ ok: false });
    expect(f.run('clip.trim', { clip: 'id1', edge: 'end', to: 0 })).toMatchObject({ ok: false, reason: expect.stringContaining('one frame') });
  });
  it('ripple delete closes the gap; lift leaves it', () => {
    const lift = film();
    ok(lift.run('clip.remove', { clips: ['id1'] }));
    expect(clips(lift.project)).toEqual([{ id: 'id2', start: 6, end: 10, in: 0 }]);
    const ripple = film();
    ok(ripple.run('select.set', { clips: ['id1'] }));
    ok(ripple.run('clip.remove', { ripple: true }));
    expect(clips(ripple.project)).toEqual([{ id: 'id2', start: 0, end: 4, in: 0 }]);
    expect(ripple.state.selection).toEqual([]);
    expect(ripple.history.undoLabel).toBe('Ripple delete');
  });
  it('close gap, slip and move', () => {
    const f = film();
    ok(f.run('clip.remove', { clips: ['id1'] }));
    ok(f.run('gap.close', { track: 'V1', at: 1 }));
    expect(clips(f.project)).toEqual([{ id: 'id2', start: 0, end: 4, in: 0 }]);
    ok(f.run('clip.trim', { clip: 'id2', edge: 'end', by: -2 }));
    ok(f.run('clip.slip', { clip: 'id2', by: 1.5 }));
    expect(clips(f.project)[0]).toEqual({ id: 'id2', start: 0, end: 2, in: 1.5 });
    expect(f.run('clip.slip', { clip: 'id2', by: 1 }).ok).toBe(false);
    ok(f.run('clip.move', { clip: 'id2', start: 3 }));
    expect(clips(f.project)[0]).toMatchObject({ start: 3, end: 5 });
  });
  it('rolling moves a cut and slide moves a clip between its neighbours; the film keeps its length', () => {
    const f = film();
    ok(f.run('clip.trim', { clip: 'id1', edge: 'end', by: -2, ripple: true }));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 4, in: 0 }, { id: 'id2', start: 4, end: 8, in: 0 }]);
    expect(f.run('clip.roll', { clip: 'id1', by: -1 }).ok).toBe(false); // b has nothing before its start
    ok(f.run('clip.roll', { clip: 'id1', by: 1 }));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 5, in: 0 }, { id: 'id2', start: 5, end: 8, in: 1 }]);
    expect(f.run('clip.roll', { clip: 'id2', by: 1 }).ok).toBe(false); // no cut after the last clip
    ok(f.run('clip.slide', { clip: 'id2', by: -1 }));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 4, in: 0 }, { id: 'id2', start: 4, end: 7, in: 1 }]);
    expect(f.history.undoLabel).toBe('Slide');
  });
  it('In and Out mark the range that plays and exports', () => {
    const f = film();
    expect(f.run('range.set', { out: 0 }).ok).toBe(false);
    ok(f.run('range.set', { in: 2 }));
    expect(f.project.range).toEqual({ in: s(2), out: s(10) });
    ok(f.run('range.set', { out: 5 }));
    expect(f.history.undoLabel).toBe('Mark Out');
    ok(f.run('range.set', { here: 'in' }));
    expect(f.history.undoLabel).toBe('Mark In');
    expect(f.run('range.set', { in: 6 }).ok).toBe(false);
    ok(f.run('range.clear', {}));
    expect(f.project.range).toBeUndefined();
    expect(f.reason('range.clear', {})).toBe('No In / Out is marked.');
  });
  it('overwrite cuts what is under it; insert pushes later clips', () => {
    const over = film();
    ok(over.run('clip.place', { media: 'b', start: 2, duration: 2 }));
    expect(clips(over.project).map((c) => [c.start, c.end, c.in])).toEqual([[0, 2, 0], [2, 4, 0], [4, 6, 4], [6, 10, 0]]);
    const insert = film();
    ok(insert.run('clip.place', { media: 'b', start: 2, duration: 2, mode: 'insert' }));
    expect(clips(insert.project).map((c) => [c.start, c.end, c.in])).toEqual([[0, 2, 0], [2, 4, 0], [4, 8, 2], [8, 12, 0]]);
  });
  it('locked tracks refuse edits by name', () => {
    const f = film();
    ok(f.run('track.set', { track: 'V1', locked: true }));
    expect(f.run('clip.remove', { clips: ['id1'] })).toEqual({ ok: false, reason: 'Track V1 is locked.' });
    expect(f.run('clip.split', { at: 2 })).toEqual({ ok: false, reason: 'No clip under the playhead.' });
    expect(f.history.undoLabel).toBe('Lock track');
  });
  it('tracks: picture tracks are added on top, and kinds are checked', () => {
    const f = film();
    ok(f.run('track.add', { kind: 'picture' }));
    expect(f.project.tracks.map((t) => t.name)).toEqual(['V2', 'V1', 'A1', 'T1']);
    ok(f.run('media.add', { media: media('song', 20, 'audio'), place: 'none' }));
    expect(f.run('clip.place', { media: 'song', track: 'V1', start: 12 })).toMatchObject({ ok: false, reason: 'Track V1 cannot show audio.' });
    ok(f.run('clip.place', { media: 'song', start: 0 }));
    expect(clips(f.project, 'A1')).toEqual([{ id: expect.any(String), start: 0, end: 20, in: 0 }]);
    expect(f.run('track.remove', { track: 'A1' })).toMatchObject({ ok: false, reason: 'Track A1 still has clips.' });
  });
  it('captions and markers', () => {
    const f = film();
    ok(f.run('caption.add', { text: 'Hello', start: 1 }));
    expect(clips(f.project, 'T1')).toEqual([{ id: 'id3', start: 1, end: 4 }]);
    ok(f.run('clip.set', { clip: 'id3', text: 'Hi', style: 'title' }));
    expect(f.project.tracks.find((t) => t.id === 'T1')!.clips[0]).toMatchObject({ text: 'Hi', style: 'title' });
    ok(f.run('marker.add', { at: 2, label: 'Jump' }));
    expect(f.project.markers).toEqual([{ id: 'id4', at: s(2), label: 'Jump', color: 'blue' }]);
  });
  it('ripple moves what comes after on every track (FILM-15)', () => {
    const f = film(); // a 0-6, b 6-10 on V1 (clips id1, id2)
    ok(f.run('caption.add', { text: 'Later line', start: 7, duration: 2 }));
    ok(f.run('marker.add', { at: 8, label: 'Hit' }));
    const caption = () => f.project.tracks.find((t) => t.kind === 'caption')!.clips[0]!;
    ok(f.run('clip.trim', { clip: 'id1', edge: 'end', by: -2, ripple: true }));
    expect(clips(f.project)).toEqual([{ id: 'id1', start: 0, end: 4, in: 0 }, { id: 'id2', start: 4, end: 8, in: 0 }]);
    expect(toSeconds(caption().start)).toBe(5);
    expect(toSeconds(f.project.markers[0]!.at)).toBe(6);
    ok(f.run('clip.remove', { clips: ['id1'], ripple: true }));
    expect(clips(f.project)).toEqual([{ id: 'id2', start: 0, end: 4, in: 0 }]);
    expect(toSeconds(caption().start)).toBe(1);
    // A line across the cut is shortened, one inside it goes (FILM-15).
    ok(f.run('caption.add', { text: 'Inside', start: 3.2, duration: 0.6 }));
    ok(f.run('clip.trim', { clip: 'id2', edge: 'end', by: -2, ripple: true })); // takes 2-4 out of the film
    const lines = f.project.tracks.find((t) => t.kind === 'caption')!.clips.map((c) => [c.type === 'caption' ? c.text : '', toSeconds(c.start), toSeconds(c.start + c.duration)]);
    expect(lines).toEqual([['Later line', 1, 2]]);
    ok(f.run('edit.undo'));
    // sync off: only the clip's own track follows.
    ok(f.run('clip.trim', { clip: 'id2', edge: 'start', by: 1, ripple: true, sync: false }));
    expect(toSeconds(caption().start)).toBe(1);
  });
  it('cues are kept in media time, so trims never move them', () => {
    const f = film();
    ok(f.run('cues.set', { media: 'a', cues: [{ id: 'c1', actor: 'self', label: 'Me', action: 'wave', start: 3, end: 4, text: 'Hi', volume: 1 }] }));
    ok(f.run('clip.trim', { clip: 'id1', edge: 'start', by: 2, ripple: true }));
    expect(f.project.media[0]!.cues[0]).toMatchObject({ start: s(3), end: s(4) });
    expect(f.run('cues.set', { media: 'a', cues: [{ id: 'c1', actor: 'self', label: 'Me', action: 'wave', start: 5, end: 9, text: '', volume: 1 }] }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('inside its recording') });
    ok(f.run('cues.set', { cues: [{ id: 'd1', actor: 'self', label: 'Me', action: 'none', start: 0, end: 1, text: 'Draft', volume: 1 }] }));
    ok(f.run('edit.undo'));
    expect(f.project.draft).toEqual([]);
  });
  it('a cue keeps the avatar start spot and walk-to spots (FILM-10)', () => {
    const f = film();
    const cue = { id: 'c1', actor: 'self', label: 'Me', action: 'walk', start: 0, end: 4, text: 'Hello', volume: 1, at: { x: 1, z: 2 }, to: [{ x: 5, z: 2 }, { x: 5, z: 8 }] };
    ok(f.run('cues.set', { media: 'a', cues: [cue] }));
    expect(f.project.media[0]!.cues[0]).toMatchObject({ at: { x: 1, z: 2 }, to: [{ x: 5, z: 2 }, { x: 5, z: 8 }] });
    const nine = Array.from({ length: 9 }, (_, i) => ({ x: i, z: 0 }));
    expect(f.run('cues.set', { media: 'a', cues: [{ ...cue, to: nine }] })).toMatchObject({ ok: false });
    expect(f.run('cues.set', { media: 'a', cues: [{ ...cue, at: { x: Number.NaN, z: 0 } }] })).toMatchObject({ ok: false });
  });
  it('re-recording keeps the clip in place and shortens it to the new recording', () => {
    const f = film();
    ok(f.run('media.replace', { media: 'a', asset: 'new', duration: s(3), camera: null, cues: [] }));
    expect(clips(f.project)[0]).toEqual({ id: 'id1', start: 0, end: 3, in: 0 });
    expect(f.project.media[0]!.asset).toBe('new');
  });
});

describe('invariants', () => {
  it('finds overlaps, wrong kinds, missing media and too-long films', () => {
    const project = film().project;
    const v1 = project.tracks[0]!;
    (v1.clips[1] as MediaClip).start = s(5);
    v1.clips.push({ id: 'cap', type: 'caption', start: s(20), duration: s(1), text: 'x', style: 'subtitle' });
    project.tracks[1]!.clips.push({ id: 'ghost', type: 'media', media: 'none', in: 0, start: s(200), duration: s(1), volume: 1 });
    const problems = check(project).map((p) => p.problem).join(' | ');
    expect(problems).toContain('overlap');
    expect(problems).toContain('cannot hold a caption');
    expect(problems).toContain('missing');
    expect(problems).toContain('longer than 180 seconds');
  });
  it('an edit that breaks a rule changes nothing', () => {
    const f = film(), before = f.project;
    expect(f.run('clip.place', { media: 'a', start: 178 }).ok).toBe(false);
    expect(f.project).toBe(before);
    expect(f.history.past.length).toBe(2);
  });
});

describe('commands, undo and batch', () => {
  it('lists every command with reasons; host-only commands are hidden from MCP', () => {
    const f = new FilmSession(emptyFilm(), counter());
    const list = f.list();
    expect(list.find((c) => c.id === 'edit.undo')).toMatchObject({ enabled: false, reason: 'Nothing to undo.' });
    expect(list.find((c) => c.id === 'clip.remove')).toMatchObject({ enabled: false, reason: 'Select a clip first.' });
    expect(list.find((c) => c.id === 'clip.split')).toMatchObject({ shortcut: 'Ctrl+K' });
    expect(list.some((c) => c.id === 'media.add')).toBe(false);
    expect(isHostOnly('media.add')).toBe(true);
    expect(f.run('nope')).toEqual({ ok: false, reason: 'Unknown command nope.' });
    expect(f.run('clip.trim', { edge: 'end' })).toMatchObject({ ok: false });
  });
  it('undo and redo carry labels; history holds 200 steps', () => {
    const f = film();
    ok(f.run('marker.add', { at: 1 }));
    expect(f.run('edit.undo')).toEqual({ ok: true, result: 'Add marker' });
    expect(f.project.markers).toEqual([]);
    expect(f.run('edit.redo')).toEqual({ ok: true, result: 'Add marker' });
    expect(f.project.markers.length).toBe(1);
    for (let i = 0; i < HISTORY_STEPS + 20; i++) ok(f.run('track.set', { track: 'V1', muted: i % 2 === 0 }));
    expect(f.history.past.length).toBe(HISTORY_STEPS);
    expect(f.history.labels().done.at(-1)).toBe('Unmute track');
  });
  it('history goto, playhead steps and renaming a recording', () => {
    const f = film();
    ok(f.run('marker.add', { at: 1 }));
    ok(f.run('marker.add', { at: 2 }));
    expect(f.run('history.goto', { done: 2 })).toEqual({ ok: true, result: 'Record shot' });
    expect(f.project.markers).toEqual([]);
    ok(f.run('history.goto', { done: 4 }));
    expect(f.project.markers.length).toBe(2);
    expect(f.run('history.goto', { done: 9 })).toEqual({ ok: false, reason: 'That history step does not exist.' });
    ok(f.run('playhead.set', { at: 1 }));
    ok(f.run('playhead.step', { frames: -3 }));
    expect(f.state.playhead).toBe(s(0.9));
    ok(f.run('playhead.step', { frames: -100 }));
    expect(f.state.playhead).toBe(0);
    ok(f.run('media.set', { media: 'a', name: 'Opening' }));
    expect(f.history.undoLabel).toBe('Rename recording');
    expect(f.project.media[0]!.name).toBe('Opening');
    expect(f.run('media.remove', { media: 'a' })).toMatchObject({ ok: false, reason: 'This recording is used by 1 clip on the timeline; remove them first.' });
    ok(f.run('clip.remove', { clips: ['id1'] }));
    ok(f.run('media.remove', { media: 'a' }));
    expect(f.project.media.map((m) => m.id)).toEqual(['b']);
  });
  it('atomic batch: all or nothing, one undo step', () => {
    const f = film(), before = f.project;
    const failed = f.batch([{ id: 'clip.split', args: { at: 2 } }, { id: 'clip.remove', args: { clips: ['missing'] } }]);
    expect(failed).toMatchObject({ ok: false, failed: { index: 1, id: 'clip.remove' }, kept: 0 });
    expect(f.project).toBe(before);
    const done = f.batch([{ id: 'clip.split', args: { at: 2 } }, { id: 'caption.add', args: { text: 'Go', start: 0 } }], { label: 'Opening' });
    expect(done.ok).toBe(true);
    expect(f.history.undoLabel).toBe('Opening');
    ok(f.run('edit.undo'));
    expect(f.project).toBe(before);
  });
  it('non-atomic batch keeps the steps before the error', () => {
    const f = film();
    const result = f.batch([{ id: 'marker.add', args: { at: 1 } }, { id: 'clip.slip', args: { clip: 'id1', by: 99 } }], { atomic: false });
    expect(result).toMatchObject({ ok: false, kept: 1, failed: { index: 1 } });
    expect(f.project.markers.length).toBe(1);
    expect(f.history.undoLabel).toBe('Batch: 1 edits');
  });
  it('inspect answers in seconds', () => {
    const result = film().run('project.inspect');
    expect(result).toMatchObject({ ok: true, result: { seconds: 10, tracks: [{ id: 'V1', clips: [{ startSeconds: 0, endSeconds: 6 }, { startSeconds: 6, endSeconds: 10 }] }, {}, {}] } });
  });
});

describe('saving', () => {
  const v1 = { version: 1, shots: [
    { id: 's1', asset: 'x1', name: 'Shot 1', duration: 2.96, in: 0.5, out: 2.5, camera: null,
      cues: [{ id: 'c', actor: 'self', label: 'Me', action: 'none', start: 0, end: 9, text: 'Hello', volume: 1, audio: 'snd' }] },
    { id: 's2', asset: 'x2', name: 'Shot 2', duration: 0.23, in: 0, out: 0.23, camera: { preset: 'orbit', position: [0, 3, -8], target: [0, 1.5, 0],
      follow_player: false, fov: 50, speed: 12, seed: 1, roll: 0 } },
  ] };
  it('migrates version 1 saves to tracks on frames', () => {
    const project = migrate(v1, [{ id: 'p', actor: 'self', label: 'Me', action: 'none', start: 1, end: 2, text: 'Next', volume: 1 }]);
    expect(project.version).toBe(2);
    expect(clips(project)).toEqual([{ id: 's1', start: 0, end: 2, in: 0.5 }, { id: 's2', start: 2, end: 2.2, in: 0 }]);
    expect(project.media[0]!.cues[0]).toMatchObject({ end: s(2.96), audio: 'snd' });
    expect(project.media[1]!.camera?.preset).toBe('orbit');
    expect(project.draft[0]).toMatchObject({ start: s(1), text: 'Next' });
    expect(check(project)).toEqual([]);
  });
  it('refuses unknown versions and damaged saves', () => {
    expect(() => migrate({ version: 9 })).toThrow('Unsupported film version 9');
    expect(() => migrate({ ...emptyFilm(), tracks: 'x' })).toThrow('damaged');
  });
  it('the project file round-trips and refuses damage', () => {
    const project = film().project;
    const assets = [{ id: 'asset-a', type: 'video/webm', bytes: new Uint8Array([1, 2, 3]) }, { id: 'asset-b', type: 'video/webm', bytes: new Uint8Array([4]) }];
    const file = writeFilmFile(project, assets);
    const back = readFilmFile(file);
    expect(back.project).toEqual(project);
    expect(back.assets.map((a) => [...a.bytes])).toEqual([[1, 2, 3], [4]]);
    expect(() => writeFilmFile(project, assets.slice(0, 1))).toThrow('not here');
    expect(() => readFilmFile(file.slice(0, file.length - 1))).toThrow('cut off');
    expect(() => readFilmFile(new Uint8Array(20))).toThrow('wrong start');
  });
});

it('preserves a saved character voice and its dialogue audio through portable film export', () => {
  const session = new FilmSession(emptyFilm(), counter());
  const voice = { id: '12345678-1234-4234-9234-123456789abc', name: 'Atlas', language: 'ar', voiceType: 'male' as const, model: 'chatterbox-multilingual-v3' };
  const cue = { id: 'dialogue', actor: 'self', label: 'Guide', action: 'none', start: s(.5), end: s(2.5), text: 'مرحبا', audio: 'speech', voice, volume: 1 };
  const shot: Media = { ...media('shot', 3), cues: [cue] };
  expect(session.run('media.add', { media: shot }).ok).toBe(true);
  const file = writeFilmFile(session.project, [{ id: 'asset-shot', type: 'video/webm', bytes: new Uint8Array([1, 2]) }, { id: 'speech', type: 'audio/wav', bytes: new Uint8Array([3, 4]) }]);
  const restored = readFilmFile(file);
  expect(restored.project.media[0]!.cues[0]!.voice).toEqual(voice);
  expect(restored.assets.some(asset => asset.id === 'speech')).toBe(true);
});

describe('film settings (FILM-A2)', () => {
  it('fills defaults, merges parts, undoes, and is visible to agents', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const shown = () => (session.run('project.inspect') as { ok: true; result: { settings: Record<string, unknown> } }).result.settings;
    expect(shown()).toMatchObject({ kind: 'film', shotSeconds: 5, worldSound: true, caption: { size: 'medium', place: 'bottom' } });
    ok(session.run('project.settings', { kind: 'series', name: 'The Island', languages: [{ lang: 'ar', level: 'text_voice' }, { lang: 'de', level: 'text' }] }));
    ok(session.run('project.settings', { caption: { place: 'top' }, director: { autonomy: 'each' } }));
    expect(shown()).toMatchObject({ kind: 'series', name: 'The Island', caption: { size: 'medium', place: 'top', inExport: true }, director: { autonomy: 'each' } });
    expect(session.run('project.settings', { languages: [{ lang: 'ar', level: 'text' }, { lang: 'ar', level: 'text' }] })).toMatchObject({ ok: false });
    expect(session.run('project.settings', { shotSeconds: 31 })).toMatchObject({ ok: false });
    ok(session.run('edit.undo'));
    expect(shown()).toMatchObject({ caption: { place: 'bottom' }, director: { autonomy: 'end' } });
    expect(session.list().some((c) => c.id === 'project.settings' && c.enabled)).toBe(true);
    // Saved films keep their settings.
    expect(readFilmFile(writeFilmFile(session.project, [])).project.settings?.name).toBe('The Island');
  });
});

describe('export per language (FILM-A3)', () => {
  const tracks = (project: FilmProject) => Object.fromEntries(project.tracks.filter((t) => t.lang).map((t) => [`${t.kind}:${t.lang}`, { hidden: t.hidden, muted: t.muted }]));
  const withLanguages = () => {
    const base = emptyFilm();
    const extra = (['ar', 'en'] as const).flatMap((lang, i) => [
      { id: `T${i + 2}`, kind: 'caption' as const, name: `T${i + 2}`, lang, locked: false, muted: false, solo: false, hidden: lang !== 'ar', clips: [] },
      { id: `A${i + 5}`, kind: 'sound' as const, name: `A${i + 5}`, lang, locked: false, muted: false, solo: false, hidden: false, clips: [] },
    ]);
    return { ...base, tracks: [...base.tracks, ...extra] };
  };
  it('keeps only the chosen language', () => {
    expect(tracks(forExport(withLanguages(), { language: 'en' }))).toEqual({
      'caption:ar': { hidden: true, muted: false }, 'sound:ar': { hidden: false, muted: true },
      'caption:en': { hidden: false, muted: false }, 'sound:en': { hidden: false, muted: false } });
  });
  it('hides captions on request and refuses a missing language', () => {
    expect(Object.values(tracks(forExport(withLanguages(), { captions: 'none' }))).filter((t) => t.hidden).length).toBe(2);
    expect(() => forExport(withLanguages(), { language: 'de' })).toThrow(/no captions or voice in de/);
    // Without options the film is unchanged.
    expect(tracks(forExport(withLanguages()))).toEqual(tracks(withLanguages()));
  });
});

describe('cast and script (FILM-B1/B2/B3)', () => {
  const setup = () => {
    const session = new FilmSession(emptyFilm(), counter());
    ok(session.run('project.settings', { languages: [{ lang: 'ar', level: 'text_voice' }, { lang: 'en', level: 'text' }] }));
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self', linesBy: { kind: 'agent', name: 'Main agent' } }) as { ok: true; result: string }).result;
    const atlas = (session.run('cast.add', { name: 'Atlas', actor: 'self' }) as { ok: true; result: string }).result;
    return { session, luna, atlas };
  };
  it('adds characters with voices per language and refuses duplicates', () => {
    const { session, luna } = setup();
    expect(session.run('cast.add', { name: 'luna', actor: 'self' })).toMatchObject({ ok: false });
    ok(session.run('cast.voice', { cast: luna, lang: 'ar', voice: { kind: 'person', name: 'Sara K.' } }));
    ok(session.run('cast.voice', { cast: luna, lang: 'en', voice: { kind: 'ai', voiceId: '6f1c2c1e-0b8a-4a8e-9a43-3c3a3b0a7d11', name: 'Luna EN' } }));
    ok(session.run('cast.set', { cast: luna, role: 'lead', personality: 'Brave guide' }));
    expect(session.project.cast![0]).toMatchObject({ name: 'Luna', role: 'lead', voices: { ar: { kind: 'person' }, en: { kind: 'ai' } } });
  });
  it('agents write only their own characters; approval is owner only; an agent edit goes back to draft', () => {
    const { session, luna, atlas } = setup();
    expect(session.run('line.write', { cast: atlas, text: { ar: 'هنا' }, by: 'agent' })).toMatchObject({ ok: false });
    const line = (session.run('line.write', { cast: luna, text: { ar: 'أهلاً' }, by: 'agent' }) as { ok: true; result: string }).result;
    expect(isHostOnly('line.approve')).toBe(true);
    ok(session.run('line.approve', { line }));
    expect(session.project.lines![0]!.status).toBe('approved');
    ok(session.run('line.set', { line, text: { en: 'Welcome' }, by: 'agent' }));
    expect(session.project.lines![0]).toMatchObject({ status: 'draft', text: { ar: 'أهلاً', en: 'Welcome' } });
    expect(session.run('line.place', { line, lang: 'en' })).toMatchObject({ ok: false });
    ok(session.run('line.approve', { line }));
    ok(session.run('line.place', { line, lang: 'en', seconds: 2 }));
    expect(session.project.draft[0]).toMatchObject({ actor: 'self', label: 'Luna', text: 'Welcome' });
  });
  it('removing a character with lines needs confirm; language status lists what is missing', () => {
    const { session, luna } = setup();
    ok(session.run('line.write', { cast: luna, text: { ar: 'أهلاً' } }));
    expect(session.run('cast.remove', { cast: luna })).toMatchObject({ ok: false });
    const status = (session.run('project.inspect') as { ok: true; result: { languageStatus: Array<{ lang: string; missing: string[] }> } }).result.languageStatus;
    expect(status).toEqual([expect.objectContaining({ lang: 'ar', missing: ['captions', 'voice'] }), expect.objectContaining({ lang: 'en', missing: ['words', 'captions'] })]);
    ok(session.run('cast.remove', { cast: luna, confirm: true }));
    expect(session.project.lines).toEqual([]);
    expect(readFilmFile(writeFilmFile(session.project, [])).project.cast?.map((c) => c.name)).toEqual(['Atlas']);
  });
});

describe('owner-only rules hold for agents (FILM-B2 security)', () => {
  it('agents cannot take over writing, delete approved lines, or remove owner characters', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self', linesBy: { kind: 'agent', name: 'Main agent' } }) as { ok: true; result: string }).result;
    const atlas = (session.run('cast.add', { name: 'Atlas', actor: 'self' }) as { ok: true; result: string }).result;
    expect(session.run('cast.set', { cast: atlas, linesBy: { kind: 'agent', name: 'Main agent' }, by: 'agent' })).toMatchObject({ ok: false });
    ok(session.run('cast.set', { cast: atlas, personality: 'Calm', by: 'agent' }));
    expect(session.run('cast.remove', { cast: atlas, by: 'agent' })).toMatchObject({ ok: false });
    const line = (session.run('line.write', { cast: luna, text: { en: 'Hi' }, by: 'agent' }) as { ok: true; result: string }).result;
    ok(session.run('line.approve', { line }));
    expect(session.run('line.remove', { line, by: 'agent' })).toMatchObject({ ok: false });
    expect(session.run('cast.remove', { cast: luna, confirm: true, by: 'agent' })).toMatchObject({ ok: false });
  });
  it('history targets show an approval an undo or redo would bring back', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self' }) as { ok: true; result: string }).result;
    const line = (session.run('line.write', { cast: luna, text: { en: 'Hi' } }) as { ok: true; result: string }).result;
    ok(session.run('line.approve', { line }));
    ok(session.run('line.approve', { line, approved: false }));
    expect(approvalsGained(session.project, session.historyTarget('edit.undo')!)).toEqual([line]);
    ok(session.run('edit.undo')); ok(session.run('edit.undo'));
    expect(approvalsGained(session.project, session.historyTarget('edit.redo')!)).toEqual([line]);
    expect(approvalsGained(session.project, session.historyTarget('history.goto', { done: 4 })!)).toEqual([]);
    expect(session.historyTarget('clip.split')).toBeNull();
  });
});

describe('agents cannot route around owner-only rules (FILM-B2 security, round 2)', () => {
  it('a once-approved line stays the owner’s to delete, even after an agent edit', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self', linesBy: { kind: 'agent', name: 'A' } }) as { ok: true; result: string }).result;
    const line = (session.run('line.write', { cast: luna, text: { en: 'Hi' }, by: 'agent' }) as { ok: true; result: string }).result;
    ok(session.run('line.approve', { line }));
    ok(session.run('line.set', { line, text: { en: 'Hey' }, by: 'agent' }));
    expect(session.project.lines![0]!.status).toBe('draft');
    expect(session.run('line.remove', { line, by: 'agent' })).toMatchObject({ ok: false });
    expect(session.run('cast.remove', { cast: luna, confirm: true, by: 'agent' })).toMatchObject({ ok: false });
  });
  it('history steps that change owner-only state are detected', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const atlas = (session.run('cast.add', { name: 'Atlas', actor: 'self' }) as { ok: true; result: string }).result;
    ok(session.run('cast.set', { cast: atlas, linesBy: { kind: 'agent', name: 'A' } }));
    expect(ownerStateChanged(session.project, session.historyTarget('edit.undo')!)).toBe(true);
    ok(session.run('cast.set', { cast: atlas, personality: 'Calm' }));
    expect(ownerStateChanged(session.project, session.historyTarget('edit.undo')!)).toBe(false);
  });
});

describe('owner drafts are protected from agent history steps', () => {
  it('undoing the owner’s own draft line counts as an owner-only change', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const atlas = (session.run('cast.add', { name: 'Atlas', actor: 'self' }) as { ok: true; result: string }).result;
    ok(session.run('line.write', { cast: atlas, text: { en: 'Draft' } }));
    expect(ownerStateChanged(session.project, session.historyTarget('edit.undo')!)).toBe(true);
  });
});

describe('scenes, links and scene sound (FILM-C1/C2/C3)', () => {
  const setup = () => {
    const session = film();
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self' }) as { ok: true; result: string }).result;
    const scene = (session.run('scene.add', { name: 'The hut', place: 'Forest', who: [{ cast: luna, job: 'opens the door' }], spots: [{ name: 'Hut door', x: 4, z: -2 }] }) as { ok: true; result: string }).result;
    return { session, luna, scene };
  };
  it('scenes hold shots (one scene per shot), check names and spots, and sound merges', () => {
    const { session, scene } = setup();
    const other = (session.run('scene.add', { name: 'Arrival' }) as { ok: true; result: string }).result;
    ok(session.run('scene.shot', { scene, media: 'a' }));
    ok(session.run('scene.shot', { scene: other, media: 'a' }));
    expect(session.project.scenes!.map((s) => s.shots)).toEqual([[], ['a']]);
    expect(session.run('scene.set', { scene, who: [{ cast: 'nobody', job: 'x' }] })).toMatchObject({ ok: false });
    expect(session.run('scene.set', { scene, spots: [{ name: 'A', x: 0, z: 0 }, { name: 'a', x: 1, z: 1 }] })).toMatchObject({ ok: false });
    ok(session.run('scene.set', { scene, sound: { mode: 'own', ambience: 70 } }));
    expect(session.project.scenes![0]!.sound).toEqual({ mode: 'own', ambience: 70, steps: 80 });
    expect(session.run('scene.remove', { scene: other })).toMatchObject({ ok: false });
    ok(session.run('scene.remove', { scene: other, confirm: true }));
    ok(session.run('scene.move', { scene, index: 0 }));
  });
  it('links join shots at times inside them; a flashback needs its return; removing a recording cleans up', () => {
    const { session, scene } = setup();
    ok(session.run('scene.shot', { scene, media: 'b' }));
    expect(session.run('link.add', { from: { media: 'a', at: 5 }, to: { media: 'b', at: 9 }, kind: 'continue' })).toMatchObject({ ok: false });
    expect(session.run('link.add', { from: { media: 'a', at: 5 }, to: { media: 'b', at: 2 }, kind: 'flashback' })).toMatchObject({ ok: false });
    const link = (session.run('link.add', { from: { media: 'a', at: 5 }, to: { media: 'b', at: 2 }, kind: 'flashback', returnAt: 5.5, look: 'blur' }) as { ok: true; result: string }).result;
    ok(session.run('link.set', { link, kind: 'jump', returnAt: null }));
    expect(session.project.links![0]).toMatchObject({ kind: 'jump', look: 'blur' });
    expect(session.project.links![0]!.returnAt).toBeUndefined();
    const clipB = session.project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'media' && c.media === 'b')!.id;
    ok(session.run('clip.remove', { clips: [clipB] }));
    ok(session.run('media.remove', { media: 'b' }));
    expect(session.project.links).toEqual([]);
    expect(session.project.scenes![0]!.shots).toEqual([]);
  });
});

describe('AI suggestions and voice takes (FILM-D1/D3)', () => {
  it('a suggestion only edits its own shot and changes nothing until the owner keeps it', () => {
    const session = film();
    const shot = session.project.tracks.find((t) => t.id === 'V1')!.clips[0]!.id;
    const other = session.project.tracks.find((t) => t.id === 'V1')!.clips[1]!.id;
    const request = (session.run('suggestion.ask', { kind: 'colour', clip: shot, prompt: 'late afternoon' }) as { ok: true; result: string }).result;
    expect(session.run('suggestion.add', { kind: 'colour', clip: shot, label: 'Warm', steps: [{ id: 'cast.set', args: { clip: shot } }] })).toMatchObject({ ok: false });
    expect(session.run('suggestion.add', { kind: 'colour', clip: shot, label: 'Warm', steps: [{ id: 'look.apply', args: { clip: other, look: 'warm' } }] })).toMatchObject({ ok: false });
    const id = (session.run('suggestion.add', { kind: 'colour', clip: shot, label: 'Warm', request, steps: [{ id: 'look.apply', args: { clip: shot, look: 'warm_afternoon' } }] }) as { ok: true; result: string }).result;
    expect(session.project.requests![0]!.status).toBe('answered');
    const before = JSON.stringify(session.project.tracks);
    expect(JSON.stringify(session.project.tracks)).toBe(before);
    expect(isHostOnly('suggestion.mark')).toBe(true);
    const s = session.project.suggestions![0]!;
    expect(session.batch([...s.steps, { id: 'suggestion.mark', args: { suggestion: id, status: 'kept' } }])).toMatchObject({ ok: true });
    expect(session.project.suggestions![0]!.status).toBe('kept');
    expect(session.run('suggestion.mark', { suggestion: id, status: 'dropped' })).toMatchObject({ ok: false });
  });
  it('voice takes are host-only; keeping one makes it the cue voice and keeps its audio', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const luna = (session.run('cast.add', { name: 'Luna', actor: 'self' }) as { ok: true; result: string }).result;
    const line = (session.run('line.write', { cast: luna, text: { ar: 'أهلاً' } }) as { ok: true; result: string }).result;
    ok(session.run('line.approve', { line })); ok(session.run('line.place', { line, lang: 'ar' }));
    for (const id of ['take.add', 'take.keep', 'take.remove']) expect(isHostOnly(id)).toBe(true);
    const t1 = (session.run('take.add', { line, lang: 'ar', asset: 'take-a', seconds: 2, by: 'Sara K.' }) as { ok: true; result: string }).result;
    const t2 = (session.run('take.add', { line, lang: 'ar', asset: 'take-b', seconds: 2.2, by: 'Sara K.' }) as { ok: true; result: string }).result;
    ok(session.run('take.keep', { take: t2 })); ok(session.run('take.keep', { take: t1 }));
    expect(session.project.takes!.map((t) => t.kept)).toEqual([true, false]);
    expect(session.project.draft[0]!.audio).toBe('take-a');
    expect(neededAssets(session.project).has('take-b')).toBe(true);
    ok(session.run('take.remove', { take: t1 }));
    expect(session.project.draft[0]!.audio).toBeUndefined();
  });
});

describe('owner decisions on suggestions and takes are protected from agent history steps', () => {
  it('undoing a kept suggestion or a take counts as owner-only', () => {
    const session = film();
    const shot = session.project.tracks.find((t) => t.id === 'V1')!.clips[0]!.id;
    const id = (session.run('suggestion.add', { kind: 'colour', clip: shot, label: 'Warm', steps: [{ id: 'look.apply', args: { clip: shot, look: 'warm_afternoon' } }] }) as { ok: true; result: string }).result;
    expect(ownerStateChanged(session.project, session.historyTarget('edit.undo')!)).toBe(false);
    ok(session.run('suggestion.mark', { suggestion: id, status: 'dropped' }));
    expect(ownerStateChanged(session.project, session.historyTarget('edit.undo')!)).toBe(true);
  });
});

describe('episodes and the AI director (FILM-E1/E3)', () => {
  it('episodes hold scenes by number; deleting one moves its scenes to episode 1', () => {
    const session = new FilmSession(emptyFilm(), counter());
    const e1 = (session.run('episode.add', { title: 'Arrival' }) as { ok: true; result: string }).result;
    const e2 = (session.run('episode.add', { title: 'The storm', outline: 'Rain comes' }) as { ok: true; result: string }).result;
    expect(session.run('episode.set', { episode: e1, cast: ['nobody'] })).toMatchObject({ ok: false });
    ok(session.run('scene.add', { name: 'Hut', episode: 2 }));
    expect(session.run('episode.remove', { episode: e2 })).toMatchObject({ ok: false });
    ok(session.run('episode.remove', { episode: e2, confirm: true }));
    expect(session.project.scenes![0]!.episode).toBe(1);
  });
  it('a run waits for an agent, records its steps, pauses for the owner with autonomy each, and never runs twice', () => {
    const session = new FilmSession(emptyFilm(), counter());
    ok(session.run('director.start', { idea: 'Three friends on an island', kind: 'series', episodes: 3, minutes: 2, autonomy: 'each' }));
    expect(session.run('director.start', { idea: 'again', kind: 'film', episodes: 1, minutes: 1, autonomy: 'auto' })).toMatchObject({ ok: false });
    expect(session.run('director.step', { label: 'Story', op: 'project.settings', state: 'done' })).toMatchObject({ ok: false });
    ok(session.run('director.claim', { agent: 'Dpro · Main agent' }));
    const step = (session.run('director.step', { label: 'Write the story', op: 'project.settings', state: 'done' }) as { ok: true; result: string }).result;
    expect(session.project.director).toMatchObject({ status: 'paused', by: 'Dpro · Main agent' });
    expect(session.run('director.step', { label: 'Cast', op: 'cast.add', state: 'running' })).toMatchObject({ ok: false });
    expect(session.run('director.pause', { resume: true })).toMatchObject({ ok: false });
    expect(isHostOnly('director.approve')).toBe(true);
    ok(session.run('director.approve', { step }));
    expect(session.project.director!.status).toBe('running');
    ok(session.run('director.stop'));
    expect(session.project.director!.status).toBe('stopped');
  });
});
