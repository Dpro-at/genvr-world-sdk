import { describe, expect, it } from 'vitest';
import { LabProjectData } from '@genvr/contracts';
import { motionGlb } from '../../../packages/runtime/test/helpers/motion-glb';
import { LabController, mineKey, newLabData, runMotionLab, PERSON, type LabCharacterSource } from './motion-lab';

const agent = { kind: 'agent' as const, name: 'Luna' };
const ID = `user.mixamo.${'a1b2c3d4e5f6'.padEnd(64, '0')}.motion`;
/** A Studio source with one private motion (a hand-made motion-only GLB standing in for a Mixamo file). */
function source(): LabCharacterSource {
  return { list: async () => [], avatar: async () => null, body: async () => 'robot',
    motions: async () => [{ id: ID, name: 'Swing Walk', pack: 'Test Pack', seconds: 1 }], motionData: async () => motionGlb() };
}

describe('board M20 P1 · My motions (private) in the Lab', () => {
  it('lists the private motions by key, name and pack; tries and checks one on our character', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source()); await lab.refreshCharacters();
    const key = mineKey(ID);
    expect(key).toBe('mine:a1b2c3d4e5f6');
    const list = await runMotionLab(lab, { kind: 'mine_list', query: 'swing' }, agent) as { total: number; private: boolean; motions: Array<{ key: string; pack: string }> };
    expect(list).toMatchObject({ total: 1, private: true, motions: [{ key, pack: 'Test Pack' }] });
    const card = await runMotionLab(lab, { kind: 'check_move', move: key }, agent) as { move: string; score: number; private: boolean; pace: { speed: number } };
    expect(card).toMatchObject({ move: key, style: 'realistic', private: true });
    expect(card.score).toBeGreaterThanOrEqual(0);
    expect(lab.mineCheck(key)?.cells.realistic).toBeDefined();
  }, 60000);
  it('runs the course with a private motion (tried first) and keeps only its key, never the file or its name', async () => {
    const saved: LabProjectData[] = [];
    const lab = new LabController(newLabData(), (d) => saved.push(d));
    lab.setCharacterSource(source()); await lab.refreshCharacters();
    const key = mineKey(ID);
    expect(() => lab.run({ motion: key }, PERSON)).toThrow('Try');
    const run = await runMotionLab(lab, { kind: 'run', settings: { motion: key } }, agent) as { id: string; motion: string };
    expect(run.motion).toBe(key);
    const text = JSON.stringify(saved.at(-1));
    expect(text).toContain(key);
    expect(text).not.toContain('Swing Walk');
    expect(text).not.toContain('Test Pack');
    expect(text).not.toContain(ID);
    // The person's Run button does the same.
    expect((await lab.runPrepared({ motion: key }, PERSON)).settings.motion).toBe(key);
  }, 60000);
  it('an unknown private motion is refused', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source()); await lab.refreshCharacters();
    await expect(runMotionLab(lab, { kind: 'check_move', move: 'mine:000000000000' }, agent)).rejects.toThrow('No private motion');
  });
});

describe('board M20 P2 · Compare our move with a private reference', () => {
  it('compare checks both, shows them together, keeps the pair by keys only; the same for a person and an agent', async () => {
    const saved: LabProjectData[] = [];
    const lab = new LabController(newLabData(), (d) => saved.push(d));
    lab.setCharacterSource(source()); await lab.refreshCharacters();
    const key = mineKey(ID);
    const result = await runMotionLab(lab, { kind: 'compare', ours: 'Walk', ref: key, place: 'over' }, agent) as { style: string; ours: { move: string; score: number }; ref: { move: string; score: number }; rows: Array<{ check: string }>; private_reference: boolean };
    expect(result).toMatchObject({ style: 'realistic', ours: { move: 'Walk' }, ref: { move: key }, private_reference: true });
    expect(result.rows.map((r) => r.check)).toEqual(['foot_slide', 'ground', 'joint_limits', 'body_clash', 'balance', 'loop_seam', 'speed_match']);
    // The person sees it: Check mode, our move in the card, the reference over it.
    expect(lab.view).toMatchObject({ mode: 'check', check: { move: 'Walk', compare: { ours: 'Walk', ref: key, place: 'over' } } });
    expect(lab.comparison?.ref.score).toBe(result.ref.score);
    lab.setComparePlace('beside');
    expect(lab.view.check.compare?.place).toBe('beside');
    // Kept by keys only.
    expect(LabProjectData.parse(saved.at(-1)).references).toEqual([expect.objectContaining({ ours: 'Walk', ref: key })]);
    const text = JSON.stringify(saved.at(-1));
    expect(text).not.toContain('Swing Walk'); expect(text).not.toContain(ID);
    // Comparing the same pair again does not add a second row; opening another move ends the comparison.
    await lab.compare('Walk', key);
    expect(lab.data.references).toHaveLength(1);
    lab.setCheckView({ move: 'Run' });
    expect(lab.view.check.compare).toBeNull();
  }, 120000);
  it('ours must be one of our moves and the reference a known private motion', async () => {
    const lab = new LabController(newLabData());
    lab.setCharacterSource(source()); await lab.refreshCharacters();
    const key = mineKey(ID);
    await expect(runMotionLab(lab, { kind: 'compare', ours: key, ref: key }, agent)).rejects.toThrow('move of ours');
    await expect(runMotionLab(lab, { kind: 'compare', ours: 'Walk', ref: 'mine:000000000000' }, agent)).rejects.toThrow('No private motion');
    await expect(runMotionLab(lab, { kind: 'compare', ours: 'Moonwalk', ref: key }, agent)).rejects.toThrow('No move');
    await expect(runMotionLab(lab, { kind: 'compare', ours: 'Walk', ref: 'Swing Walk' } as never, agent)).rejects.toThrow();
  }, 60000);
});
