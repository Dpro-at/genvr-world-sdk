import { describe, expect, it, vi } from 'vitest';
import { LabController, newLabData, runMotionLab } from './motion-lab';
import { MadeMovesController, madeMovesBridge, memoryMadeMotionStore } from './made-moves';
import { runAvatarStudio } from './avatar-studio';

const agent = { kind: 'agent' as const, name: 'Luna' };
/** A lab with a saved punch (does not travel) and a saved walk loop that travels and finishes the course. */
async function setup() {
  const store = memoryMadeMotionStore();
  const lab = new LabController(newLabData());
  lab.setMadeStore(store);
  lab.newMotion('Punch', { frames: 60 });
  lab.poseSet(30, { 'R.elbow.bend': 120 }); lab.keyAdd(30);
  lab.poseSaveVersion();
  lab.newMotion('My walk', { frames: 60 });
  lab.keyAdd(0, undefined, 'linear'); lab.poseSet(0, { 'L.leg.forward': 25, 'R.leg.forward': -20 });
  lab.poseSet(30, { 'L.leg.forward': -20, 'R.leg.forward': 25 }); lab.keyAdd(30, undefined, 'linear');
  lab.setCourse({ ...lab.data.course, obstacles: [], street: null, cars: [], finish_z: 4 });
  lab.poseSaveVersion();
  await new Promise((r) => setTimeout(r, 0));
  const saved: unknown[] = [];
  const moves = new MadeMovesController(store, [], (m) => saved.push(m));
  const player = { setMadeMoves: vi.fn(), playAnimation: vi.fn(() => true) };
  moves.setPlayer(player);
  return { store, lab, moves, player, saved };
}

describe('made motions in the game (board M19)', () => {
  it('Save as version puts the made motion in My motions with its keys, score and pace', async () => {
    const { store } = await setup();
    const rows = await store.list();
    expect(rows.map((r) => r.name).sort()).toEqual(['My walk', 'Punch']);
    const punch = rows.find((r) => r.name === 'Punch')!;
    expect(punch.motion.keys).toHaveLength(2);
    expect(punch.pace.speed).toBe(0);
    expect(punch.rights.shareable).toBe(true);
  });
  it('puts a motion on a key and plays it; one move per key; the game gets every change', async () => {
    const { moves, player, saved } = await setup();
    const used = await moves.use('Punch', { slot: 3 });
    expect(used).toMatchObject({ name: 'Punch', slot: 3, once: true });
    expect(player.setMadeMoves).toHaveBeenLastCalledWith([expect.objectContaining({ slot: 3, once: true })]);
    await moves.use('My walk', { slot: 3 }, false);
    expect(moves.moves.map((m) => m.name)).toEqual(['My walk']);
    expect(saved).toHaveLength(2);
    await moves.preview('Punch');
    expect(player.playAnimation).toHaveBeenCalledWith(expect.stringMatching(/^motion:made-punch-v1/));
  });
  it('replaces Walk only with a travelling loop that passed the course', async () => {
    const { moves } = await setup();
    await expect(moves.use('Punch', { replaces: 'Walk' })).rejects.toThrow(/does not travel/);
    const walk = await moves.use('My walk', { replaces: 'Walk' });
    expect(walk).toMatchObject({ replaces: 'Walk', once: false });
    await moves.use('Punch', { replaces: 'Jump' });
    moves.unuse('My walk');
    expect(moves.moves.map((m) => m.replaces)).toEqual(['Jump']);
  });
  it('does the same through avatar_studio and motion_lab', async () => {
    const { lab, moves } = await setup();
    const off = madeMovesBridge.register(moves);
    try {
      const mine = await runAvatarStudio({ action: 'moves_mine' }) as { mine: Array<{ name: string }> };
      expect(mine.mine.map((m) => m.name)).toContain('Punch');
      expect(await runAvatarStudio({ action: 'move_use', motion: 'Punch', slot: 5 })).toMatchObject({ slot: 5 });
      expect(() => runAvatarStudio({ action: 'move_use', motion: 'Punch' })).toThrow(/slot 1–8 or replaces/);
      runAvatarStudio({ action: 'move_unuse', motion: 'Punch' });
      expect(moves.moves).toHaveLength(0);
      lab.openMotionAt('Punch');
      expect(await runMotionLab(lab, { kind: 'made_to_moves' }, agent)).toMatchObject({ name: 'Punch', version: 1 });
    } finally { off(); }
  });
});
