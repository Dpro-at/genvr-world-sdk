import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_STYLES, LabProjectData } from '@genvr/contracts';
import { LabController, newLabData, runMotionLab, PERSON } from './motion-lab';

const agent = { kind: 'agent' as const, name: 'Luna' };

describe('board M16 · motion check and styles in the Lab and through motion_lab', () => {
  it('check_all keeps a report of every move in the three styles; check_report lists the worst first', async () => {
    const saved: LabProjectData[] = [];
    const lab = new LabController(newLabData(), (data) => saved.push(data));
    const all = await runMotionLab(lab, { kind: 'check_all' }, agent) as { body: string; moves: number; worst: Record<string, Array<{ move: string; score: number }>> };
    expect(all.body).toBe('robot');
    expect(all.moves).toBeGreaterThanOrEqual(30);
    expect(Object.keys(all.worst)).toEqual(['realistic', 'game', 'anime']);
    const report = await runMotionLab(lab, { kind: 'check_report', style: 'realistic', limit: 5 }, agent) as { cells: Array<{ score: number; style: string }> };
    expect(report.cells).toHaveLength(5);
    expect(report.cells.map((c) => c.score)).toEqual([...report.cells.map((c) => c.score)].sort((a, b) => a - b));
    expect(report.cells.every((c) => c.style === 'realistic')).toBe(true);
    // Kept in the project, so it is there after a reload.
    const kept = LabProjectData.parse(saved.at(-1)).check!;
    expect(kept.report.cells.length).toBe(all.moves * 3);
    expect(new LabController(saved.at(-1)!).checkReport('game', 3)).toHaveLength(3);
  }, 120000);
  it('check_move checks one move again and puts it in the report', async () => {
    const lab = new LabController(newLabData());
    await expect(runMotionLab(lab, { kind: 'check_report' }, agent)).rejects.toThrow('check_all first');
    lab.checkAll(['realistic']);
    const card = await runMotionLab(lab, { kind: 'check_move', move: 'Walk' }, agent) as { move: string; score: number; issues: unknown[] };
    expect(card).toMatchObject({ move: 'Walk', style: 'realistic' });
    expect(lab.checkReport('realistic', 999).filter((c) => c.move === 'Walk')).toEqual([card]);
    await expect(runMotionLab(lab, { kind: 'check_move', move: 'Moonwalk' }, agent)).rejects.toThrow('No move');
  }, 120000);
  it('a person changes a style at once; an agent asks and the owner confirms (the agent cannot)', async () => {
    const lab = new LabController(newLabData());
    expect(lab.data.styles).toEqual(DEFAULT_MOTION_STYLES);
    lab.setStyle('game', { limits: { foot_slide_cm: 2 } }, PERSON);
    expect(lab.data.styles.game.limits.foot_slide_cm).toBe(2);
    const asked = await runMotionLab(lab, { kind: 'style_set', style: 'anime', params: { amplitude: 1.4 } }, agent);
    expect(asked).toMatchObject({ applied: false, pending: 'anime' });
    expect(lab.data.styles.anime.params.amplitude).toBe(1.3);
    await expect(runMotionLab(lab, { kind: 'style_confirm', confirm: true }, agent)).rejects.toThrow('Only the owner');
    expect(lab.data.style_pending).toMatchObject({ style: 'anime', by: 'Luna' });
    lab.confirmPendingStyle(PERSON);
    expect(lab.data.styles.anime.params.amplitude).toBe(1.4);
    expect(lab.data.style_pending).toBeNull();
    // Limits stay inside the contract.
    expect(() => lab.setStyle('realistic', { limits: { foot_slide_cm: 99 } }, PERSON)).toThrow();
    expect(await runMotionLab(lab, { kind: 'style_params', style: 'game' }, agent)).toMatchObject({ styles: { id: 'game' } });
  });
  it('the Check mode keeps the style, the open move and the frame', () => {
    const lab = new LabController(newLabData());
    lab.setMode('check');
    lab.setCheckView({ style: 'anime', move: 'Walk', frame: 12 });
    expect(lab.view).toMatchObject({ mode: 'check', check: { style: 'anime', move: 'Walk', frame: 12 } });
  });
});
