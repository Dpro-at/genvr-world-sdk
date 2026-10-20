import { describe, expect, it } from 'vitest';
import { WorldSession } from '../src/session.js';
import { importStudioProject, worldMadeMoves } from '../src/studio-project.js';

const punch = {
  id: 'punch-v2', name: 'Punch', slot: 3, once: true, passes_course: true, pace: { speed: 0, stride: 0 }, rights: { shareable: true, reasons: [] },
  motion: { id: 'made-punch', name: 'Punch', frames: 60, loop: true, keys: [{ frame: 0, ease: 'smooth' as const, values: { 'R.elbow.bend': 90 } }], draft: null, pins: [], by: 'person' as const, at: '' },
};

describe('a world session keeps its made motions (board M19)', () => {
  it('exports them for the upload, undoes the change and refuses a motion that is not shareable', () => {
    const session = WorldSession.create();
    session.setMadeMoves([punch]);
    expect(session.export().madeMoves?.map((m) => m.name)).toEqual(['Punch']);
    expect(new WorldSession(session.serialize()).madeMoves).toHaveLength(1);
    session.undo();
    expect(session.export().madeMoves).toBeUndefined();
    expect(() => session.setMadeMoves([{ ...punch, rights: { shareable: false, reasons: ['imported'] } }])).toThrow(/shareable/);
    expect(session.madeMoves).toEqual([]);
  });
  it('brings a world file\'s made motions into a Studio project, and sends only shareable ones back out', () => {
    const session = WorldSession.create();
    session.setMadeMoves([punch]);
    const project = importStudioProject(session.serialize());
    expect(project.madeMoves?.map((m) => m.slot)).toEqual([3]);
    expect(worldMadeMoves({ madeMoves: [punch, { ...punch, id: 'x-v1', slot: 4, rights: { shareable: false, reasons: ['imported'] } }] }).map((m) => m.id)).toEqual(['punch-v2']);
  });
});
