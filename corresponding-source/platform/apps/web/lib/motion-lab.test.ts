import { describe, expect, it } from 'vitest';
import { simulateLabRun, type LabFrame } from '@genvr/runtime';
import { runTool, type AssistantHost } from '@genvr/assistant';
import { LabController, labClipTime, motionLabBridge, newLabData, runMotionLab, PERSON } from './motion-lab';

const simulateOn = (lab: LabController) => simulateLabRun(lab.data.course, lab.best()!.settings, lab.data.course.seed).frames.at(-1);

const agent = { kind: 'agent' as const, name: 'Luna' };

describe('motion lab controller (MOTION-LAB L1 + L2)', () => {
  it('starts with the M1 course and saves every change', () => {
    const saved: unknown[] = [];
    const lab = new LabController(newLabData(), (data) => saved.push(data));
    expect(lab.data.course.obstacles).toHaveLength(5);
    lab.setObstacle('gap-1', { width: 1.4 });
    expect(lab.data.course.obstacles.find((o) => o.id === 'gap-1')).toMatchObject({ width: 1.4 });
    expect(saved).toHaveLength(1);
  });
  it('runs, keeps the last 20 runs, saves versions and shows the best as the ghost', () => {
    const lab = new LabController(newLabData());
    for (let i = 0; i < 22; i++) lab.run({ speed: 1.5 + i * 0.01 });
    expect(lab.data.runs).toHaveLength(20);
    expect(lab.data.runs[0]!.id).toBe('run-3');
    const v = lab.saveVersion();
    expect(v).toMatchObject({ id: 'walk-v1', motion: 'Walk', n: 1 });
    lab.saveBest(v.id, PERSON);
    expect(lab.best()?.id).toBe('walk-v1');
    expect(lab.view.ghost?.frames.length).toBeGreaterThan(100);
    lab.fromSeed(77);
    // On a new course the ghost is the best version's settings run on that course.
    expect(lab.view.ghost?.frames.at(-1)).toEqual(simulateOn(lab));
  });
  it('lets an agent ask for the best version, and only the owner confirms it', async () => {
    const lab = new LabController(newLabData());
    await runMotionLab(lab, { kind: 'run' }, agent);
    const v = (await runMotionLab(lab, { kind: 'save_version', note: 'first' }, agent)) as { id: string };
    expect(await runMotionLab(lab, { kind: 'save_best', version: v.id }, agent)).toMatchObject({ best: null, pending: v.id });
    expect(lab.best()).toBeUndefined();
    lab.confirmPendingBest();
    expect(lab.best()?.id).toBe(v.id);
    expect(lab.data.best_pending).toBeNull();
  });
  it('does the course through the agent tool: add, change, remove, seed, traffic', async () => {
    const lab = new LabController(newLabData());
    const added = (await runMotionLab(lab, { kind: 'obstacle_add', obstacle: { kind: 'step', z: 26, height: 0.2 } }, agent)) as { id: string };
    expect(added.id).toBe('step-2');
    await runMotionLab(lab, { kind: 'obstacle_set', id: 'step-2', set: { height: 0.25 } }, agent);
    await runMotionLab(lab, { kind: 'obstacle_remove', id: 'step-2' }, agent);
    await expect(runMotionLab(lab, { kind: 'obstacle_add', obstacle: { kind: 'beam', z: 2 } }, agent)).rejects.toThrow(/not built yet/);
    const a = await runMotionLab(lab, { kind: 'course_from_seed', seed: 12 }, agent);
    expect(a).toEqual(await runMotionLab(new LabController(newLabData()), { kind: 'course_from_seed', seed: 12 }, agent));
    await runMotionLab(lab, { kind: 'traffic_set', cars: [{ id: 'car-1', lane: 0, speed: 12, runs_red: true }] }, agent);
    expect(lab.data.course.cars[0]).toMatchObject({ speed: 12, runs_red: true });
    await expect(runMotionLab(lab, { kind: 'version_delete', version: 'x' }, agent)).rejects.toThrow();
    lab.run();
    const mine = lab.saveVersion(undefined, 'by a person');
    await expect(runMotionLab(lab, { kind: 'version_delete', version: mine.id, confirm: true }, agent)).rejects.toThrow(/owner/);
    const theirs = (await runMotionLab(lab, { kind: 'save_version' }, agent)) as { id: string };
    lab.saveBest(theirs.id);
    await expect(runMotionLab(lab, { kind: 'version_delete', version: theirs.id, confirm: true }, agent)).rejects.toThrow(/best/);
    lab.saveBest(mine.id);
    expect(await runMotionLab(lab, { kind: 'version_delete', version: theirs.id, confirm: true }, agent)).toEqual({ deleted: theirs.id });
  });
  it('gives the same scores to a person and an agent for the same run', async () => {
    const a = new LabController(newLabData()), b = new LabController(newLabData());
    const personRun = a.run({ stride: 0.7 }, PERSON);
    const agentRun = (await runMotionLab(b, { kind: 'run', settings: { stride: 0.7 } }, agent)) as { score: unknown };
    expect(agentRun.score).toEqual(personRun.score);
    expect(await runMotionLab(null, { kind: 'inspect' }, agent).catch((e: Error) => e.message)).toMatch(/motion lab project/);
  });
});

describe('run settings changes', () => {
  it('keeps the settings an agent does not name', async () => {
    const lab = new LabController(newLabData());
    lab.setSettings({ stride: 0.6, lean_deg: 8 });
    await runMotionLab(lab, { kind: 'settings_set', settings: { speed: 2 } }, agent);
    expect(lab.data.settings).toMatchObject({ speed: 2, stride: 0.6, lean_deg: 8 });
    await runMotionLab(lab, { kind: 'run', settings: { speed: 1.8 } }, agent);
    expect(lab.data.runs.at(-1)!.settings).toMatchObject({ speed: 1.8, stride: 0.6, lean_deg: 8 });
  });
});

describe('motion lab in the in-app Assistant', () => {
  // The same host wiring as assistant-panel.tsx.
  const host = { motionLab: async (input: { operation: unknown }) => runMotionLab(motionLabBridge.get(), input.operation, { kind: 'agent', name: 'Assistant' }) } as unknown as AssistantHost;
  it('builds, runs and asks for the best version, and the owner confirms it', async () => {
    const lab = new LabController(newLabData());
    const unregister = motionLabBridge.register(lab);
    try {
      expect((await runTool('motion_lab', { operation: { kind: 'obstacle_set', id: 'gap-1', set: { width: 1.2 } } }, host)).ok).toBe(true);
      const run = await runTool('motion_lab', { operation: { kind: 'run' } }, host);
      expect(run.ok).toBe(true);
      expect(lab.data.runs.at(-1)?.by).toBe('agent');
      const saved = JSON.parse((await runTool('motion_lab', { operation: { kind: 'save_version' } }, host)).result) as { id: string; by: string };
      expect(saved.by).toBe('agent');
      expect(JSON.parse((await runTool('motion_lab', { operation: { kind: 'save_best', version: saved.id } }, host)).result)).toMatchObject({ best: null, pending: saved.id });
      expect(lab.best()).toBeUndefined();
      expect(lab.data.best_pending).toMatchObject({ version: saved.id, by: 'Assistant' });
      lab.confirmPendingBest();
      expect(lab.best()?.id).toBe(saved.id);
      expect(await runTool('motion_lab', { operation: { kind: 'version_delete', version: saved.id, confirm: true } }, host))
        .toMatchObject({ ok: false, result: 'Only the owner can delete the best version.' });
      const personVersion = lab.saveVersion(undefined, '', PERSON);
      expect((await runTool('motion_lab', { operation: { kind: 'version_delete', version: personVersion.id, confirm: true } }, host)).ok).toBe(false);
      expect(lab.data.versions.map((v) => v.id)).toContain(personVersion.id);
    } finally { unregister(); }
    expect((await runTool('motion_lab', { operation: { kind: 'inspect' } }, host)).result).toMatch(/motion lab project/);
  });
});

describe('sharing a motion (board M14)', () => {
  const ready = async () => {
    const lab = new LabController(newLabData());
    lab.run({}, PERSON);
    const v = lab.saveVersion(undefined, '', PERSON);
    return { lab, v };
  };
  it('keeps a new version private, lets an agent prepare a share and only the owner publish it', async () => {
    const { lab, v } = await ready();
    expect(lab.data.runs.at(-1)!.score.finished).toBe(true);
    expect(lab.shareStatus(v.id)).toBe('private');
    const prepared = (await runMotionLab(lab, { kind: 'share_prepare', version: v.id, share: { name: 'Calm walk', tags: ['walk', 'street'] } }, agent)) as { share: { state: string; prepared_by: string; licence: string } };
    expect(prepared.share).toMatchObject({ state: 'pending', prepared_by: 'Luna', licence: 'genvr-community-1' });
    expect(lab.shareStatus(v.id)).toBe('pending');
    await expect(runMotionLab(lab, { kind: 'share', version: v.id, confirm: true }, agent)).rejects.toThrow(/Only the owner shares/);
    expect(lab.shareStatus(v.id)).toBe('pending');
    // `confirm: true` is required by the schema.
    await expect(runMotionLab(lab, { kind: 'share', version: v.id }, PERSON)).rejects.toThrow();
    const shared = (await runMotionLab(lab, { kind: 'share', version: v.id, confirm: true }, PERSON)) as { share: { state: string; where: string }; note: string };
    expect(shared.share).toMatchObject({ state: 'shared', where: 'local-preview' });
    expect(shared.note).toMatch(/Local preview/);
    expect(() => lab.deleteVersion(v.id, PERSON)).toThrow(/stop sharing/);
    expect(await runMotionLab(lab, { kind: 'unshare', version: v.id, confirm: true }, agent)).toMatchObject({ share: { state: 'stopped' } });
    expect(lab.shareStatus(v.id)).toBe('private');
  });
  it('publishes through the host adapter when one is connected', async () => {
    const { lab, v } = await ready();
    const calls: string[] = [];
    lab.setPublisher({ publish: async (share) => { calls.push(`publish ${share.name}`); return { url: 'https://genvr.example/motions/1' }; }, unpublish: async (share) => { calls.push(`unpublish ${share.version}`); } });
    lab.prepareShare(v.id, { name: 'Walk' }, PERSON);
    expect(await lab.share(v.id, PERSON)).toMatchObject({ state: 'shared', where: 'platform', url: 'https://genvr.example/motions/1' });
    await lab.unshare(v.id);
    expect(calls).toEqual(['publish Walk', `unpublish ${v.id}`]);
  });
  it('never shares a motion that is not a GenVR library move or does not pass the course', async () => {
    const { lab } = await ready();
    lab.setObstacle('gap-1', { width: 3 });
    lab.run({}, PERSON);
    const fell = lab.saveVersion(undefined, '', PERSON);
    expect(lab.data.runs.at(-1)!.score.finished).toBe(false);
    expect(lab.shareStatus(fell.id)).toBe('blocked');
    expect(() => lab.prepareShare(fell.id, { name: 'x' }, PERSON)).toThrow(/cannot be shared/);
    const data = { ...lab.data, versions: lab.data.versions.map((x) => ({ ...x, settings: { ...x.settings, motion: 'Mixamo Walk' }, score: { ...x.score, finished: true, fell: false } })) };
    const other = new LabController(data);
    expect(other.rights(fell.id)).toMatchObject({ not_mixamo: false });
    expect(other.shareStatus(fell.id)).toBe('blocked');
  });
  it('shows the library move it is like, run on the same course, and my shared versions', async () => {
    const { lab, v } = await ready();
    const similar = await runMotionLab(lab, { kind: 'motion_similar', version: v.id }, agent) as { similar: Array<{ name: string; source: string; alike: number; note: string }> };
    expect(similar.similar[0]).toMatchObject({ name: 'Walk', source: 'library' });
    expect(similar.similar[0]!.alike).toBeGreaterThan(50);
    expect(similar.similar[0]!.note).toMatch(/library .* cm/);
    lab.prepareShare(v.id, { name: 'Calm walk' }, PERSON);
    await lab.share(v.id, PERSON);
    lab.run({ speed: 1.7 }, PERSON);
    const v2 = lab.saveVersion(undefined, '', PERSON);
    expect(lab.similar(v2.id).map((s) => s.source)).toEqual(expect.arrayContaining(['library', 'mine']));
    const mine = await runMotionLab(lab, { kind: 'motions_mine' }, agent) as { publishing: string; licence: { name: string }; motions: Array<{ version: string; status: string }> };
    expect(mine.publishing).toBe('local-preview');
    expect(mine.licence.name).toBe('GenVR community licence');
    expect(mine.motions.map((m) => [m.version, m.status])).toEqual([[v2.id, 'private'], [v.id, 'shared']]);
  });
});

describe('the lab view keeps the move in step with the run', () => {
  const frame = (t: number, z: number, clip: string) => ({ t, x: 0, y: 0, z, tilt: 0, feet: [{ x: -0.1, y: 0, z, planted: true }, { x: 0.1, y: 0, z, planted: false }], com: [0, z], speed: 0, clip }) as unknown as LabFrame;
  it('advances a ground move by distance over its natural speed, so faster runs step faster', () => {
    // Walk's natural speed is 1.4 m/s: walking 2.8 m in 1 s is two seconds of the clip, 0.7 m is half a second.
    const fast = Array.from({ length: 61 }, (_, i) => frame(i / 60, (i / 60) * 2.8, 'Walk'));
    const slow = Array.from({ length: 61 }, (_, i) => frame(i / 60, (i / 60) * 0.7, 'Walk'));
    expect(labClipTime(fast, 60)).toBeCloseTo(2, 5);
    expect(labClipTime(slow, 60)).toBeCloseTo(0.5, 5);
    // Seeking back gives the same pose as playing there.
    expect(labClipTime(fast, 30)).toBeCloseTo(1, 5);
  });
  it('counts other moves from the moment they began', () => {
    const frames = [...Array.from({ length: 30 }, (_, i) => frame(i / 60, i * 0.02, 'Walk')), ...Array.from({ length: 30 }, (_, i) => frame((30 + i) / 60, 0.6 + i * 0.03, 'Jump Forward'))];
    expect(labClipTime(frames, 29 + 30)).toBeCloseTo(29 / 60, 5);
    expect(labClipTime(frames, 30)).toBe(0);
  });
});

describe('lab character (board M17)', () => {
  const ID = 'user.mixamo.' + 'a'.repeat(64) + '.character';
  const source = (avatar: string | null, list = [{ id: ID, name: 'rpm-male-blue', source: 'mine' as const, leg: 0.97 }]) => ({
    list: async () => list, avatar: async () => avatar, body: async (id: string) => id as `user.${string}`,
  });
  it('follows the Avatar tab by default and runs with that character', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source(ID));
    await lab.refreshCharacters();
    expect(lab.data.who).toBe('avatar');
    expect(lab.character.id).toBe(ID);
    expect(lab.legScale).toBeCloseTo(0.97 / 0.84);
    expect(lab.run({}, PERSON).settings.character).toBe(ID);
  });
  it('picking in the Lab stops following; a deleted pick falls back to the robot', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source(ID));
    await lab.refreshCharacters();
    lab.setWho('robot');
    expect(lab.character.id).toBe('robot');
    lab.setWho(ID);
    lab.setCharacterSource(source(null, []));
    await lab.refreshCharacters();
    expect(lab.missingCharacter).toBe(ID);
    expect(lab.character.id).toBe('robot');
    expect(() => lab.setWho('human')).toThrow(/No character "human"/);
  });
  it('keeps the best version per move and character', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source(null));
    await lab.refreshCharacters();
    const robot = lab.saveVersion(lab.run({}, PERSON).id);
    lab.saveBest(robot.id);
    lab.setWho(ID);
    expect(lab.best()).toBeUndefined();
    const mine = lab.saveVersion(lab.run({}, PERSON).id);
    lab.saveBest(mine.id);
    expect(lab.best()?.id).toBe(mine.id);
    expect(lab.best('Walk', 'robot')?.id).toBe(robot.id);
  });
  it('lists and picks characters through the agent tool', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source(null));
    const list = await runMotionLab(lab, { kind: 'characters' }, agent) as { characters: Array<{ id: string }> };
    expect(list.characters.map((c) => c.id)).toEqual(['robot', ID]);
    await runMotionLab(lab, { kind: 'who_set', who: ID }, agent);
    expect(lab.character.name).toBe('rpm-male-blue');
    await expect(runMotionLab(lab, { kind: 'who_set', who: 'warrior' }, agent)).rejects.toThrow(/No character/);
  });
  it('paces the clip with the leg length', () => {
    const frames = [0, 1, 2].map((i) => ({ x: 0, z: i * 0.1, clip: 'Walk', t: i / 60 })) as unknown as LabFrame[];
    expect(labClipTime(frames, 2, 2)).toBeCloseTo(labClipTime(frames, 2) / 2);
  });
});

describe('bones by numbers and mouse + key frames (board M11)', () => {
  const made = () => { const lab = new LabController(newLabData()); lab.newMotion('Punch', { frames: 120 }); return lab; };
  it('makes a motion with a whole-pose key on frame 0 and opens it in Pose', () => {
    const lab = made();
    expect(lab.view.mode).toBe('pose');
    expect(lab.openMotion).toMatchObject({ id: 'made-punch', frames: 120, loop: true });
    expect(lab.poseGet(0).keyed_rows).toEqual(['body', 'right_arm', 'right_hand', 'left_arm', 'left_hand', 'legs']);
    expect(() => lab.newMotion('walk')).toThrow(/library move/);
    expect(() => lab.newMotion('punch')).toThrow(/already/);
  });
  it('keeps a slider change as a draft until Key, and fills the frames between keys', () => {
    const lab = made();
    lab.poseSet(60, { 'R.elbow.bend': 100 });
    expect(lab.poseGet(60)).toMatchObject({ keyed_rows: [], draft: ['R.elbow.bend'] });
    lab.keyAdd(60, ['right_arm'], 'linear');
    expect(lab.poseGet(60).keyed_rows).toEqual(['right_arm']);
    expect(lab.openMotion!.draft).toBeNull();
    // Frame 0 holds 12 (standing); frame 30 lies halfway on the smooth ease out of frame 0.
    expect(lab.poseAt(30)['R.elbow.bend']).toBeCloseTo(56, 0);
    lab.keyEase(0, 'hold');
    expect(lab.poseAt(30)['R.elbow.bend']).toBe(12);
    // A change on a keyed frame changes the key.
    lab.poseSet(60, { 'R.elbow.bend': 90 });
    expect(lab.openMotion!.keys.find((k) => k.frame === 60)!.values['R.elbow.bend']).toBe(90);
    lab.keyCopy(60, 90, ['right_arm']);
    expect(lab.poseGet(90).keyed_rows).toEqual(['right_arm']);
    lab.keyRemove(90);
    expect(lab.openMotion!.keys.map((k) => k.frame)).toEqual([0, 60]);
    expect(() => lab.keyRemove(0, undefined) && lab.keyRemove(60)).toThrow(/at least one key/);
  });
  it('stops at the joint law, mirrors, moves a hand and keeps a pinned foot', () => {
    const lab = made();
    expect(lab.poseSet(10, { 'R.elbow.bend': 400 }).stopped).toEqual(['R.elbow.bend']);
    lab.keyAdd(10);
    lab.poseMirror(10);
    expect(lab.poseAt(10)['L.elbow.bend']).toBeGreaterThan(100);
    const move = lab.limbMove(20, 'right_hand', [-0.3, 1.35, 0.35]);
    expect(move.miss_cm).toBeLessThan(3);
    lab.pin('left_foot');
    const foot = lab.poseGet(30).limbs.left_foot;
    lab.poseSet(30, { 'L.knee.bend': 60, 'L.leg.forward': 30 });
    const after = lab.poseGet(30);
    expect(Math.hypot(...after.limbs.left_foot.map((v, i) => v - foot[i]!))).toBeLessThan(0.01);
    expect(after.pose['root.y']).toBeLessThan(0);
  });
  it('tests in the course, saves a version with its keys, rolls the keys back and counts as made in the lab', () => {
    const lab = made();
    lab.poseSet(60, { 'R.elbow.bend': 120 }); lab.keyAdd(60);
    const run = lab.poseTest();
    expect(run.settings.motion).toBe('Punch');
    expect(run.move).toEqual({ speed: 0, stride: 0 });
    expect(lab.view.mode).toBe('run');
    const v = lab.poseSaveVersion('first punch');
    expect(v.run).toBe(run.id);
    expect(v.made?.keys).toHaveLength(2);
    expect(lab.rights(v.id).not_mixamo).toBe(true);
    lab.keyRemove(60);
    lab.rollback(v.id);
    expect(lab.openMotion!.keys).toHaveLength(2);
    // Keys unchanged: Save as version keeps the last test; changed keys test again.
    expect(lab.poseSaveVersion().run).toBe(run.id);
    lab.poseSet(60, { 'R.elbow.bend': 110 });
    expect(lab.poseSaveVersion().run).not.toBe(run.id);
  });
  it('does the same through motion_lab', async () => {
    const lab = new LabController(newLabData());
    await runMotionLab(lab, { kind: 'pose_new', name: 'Wave', frames: 60 }, agent);
    const set = await runMotionLab(lab, { kind: 'pose_set', frame: 30, joint: 'arm.up', side: 'right', value: 150 }, agent) as { set: Record<string, number> };
    expect(set.set['R.arm.up']).toBeGreaterThan(100);
    await runMotionLab(lab, { kind: 'key_add', frame: 30, rows: ['right_arm'] }, agent);
    await runMotionLab(lab, { kind: 'pin', limb: 'right_foot' }, agent);
    await runMotionLab(lab, { kind: 'limb_move', frame: 45, limb: 'left_hand', by: [0, 0.2, 0.2] }, agent);
    await runMotionLab(lab, { kind: 'pose_mirror', frame: 45, mode: 'left_to_right' }, agent);
    const got = await runMotionLab(lab, { kind: 'pose_get', frame: 30 }, agent) as { keyed_rows: string[]; pins: string[] };
    expect(got).toMatchObject({ keyed_rows: ['right_arm'], pins: ['right_foot'] });
    expect(await runMotionLab(lab, { kind: 'pose_list' }, agent)).toMatchObject({ open: 'made-wave', motions: [{ name: 'Wave', keys: 2 }] });
    const version = await runMotionLab(lab, { kind: 'pose_save_version' }, agent) as { by: string; made: unknown };
    expect(version).toMatchObject({ by: 'agent' });
    expect(version.made).toBeTruthy();
    await expect(runMotionLab(lab, { kind: 'pose_set', frame: 90, joint: 'arm.up', value: 1 }, agent)).rejects.toThrow(/past the end/);
    await expect(runMotionLab(lab, { kind: 'pose_set', frame: 1, joint: 'tail.wag', value: 1 }, agent)).rejects.toThrow(/not a pose slider/);
  });
});
