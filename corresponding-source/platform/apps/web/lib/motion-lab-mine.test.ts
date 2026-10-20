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
