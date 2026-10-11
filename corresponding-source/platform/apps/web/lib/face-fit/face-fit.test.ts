import { describe, expect, it } from 'vitest';
import { fitFace, HUMAN_FACE } from './fit';
import { FACE_MEASURES, measureFace, type FaceMeasures, type LandmarkPoint } from './measure';

/** A plain upright face: 478 points, the ones the measures read placed like a face (picture units 0..1). */
function face(change: (points: LandmarkPoint[]) => void = () => {}): LandmarkPoint[] {
  const points: LandmarkPoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const put = (i: number, x: number, y: number) => (points[i] = { x, y });
  // Eyes (the person's right on the picture's left).
  put(33, 0.36, 0.42);
  put(133, 0.45, 0.42);
  put(159, 0.405, 0.405);
  put(145, 0.405, 0.435);
  put(263, 0.64, 0.42);
  put(362, 0.55, 0.42);
  put(386, 0.595, 0.405);
  put(374, 0.595, 0.435);
  put(105, 0.4, 0.37);
  put(334, 0.6, 0.37);
  // Nose, mouth, chin and the outline.
  put(168, 0.5, 0.42);
  put(1, 0.5, 0.55);
  put(64, 0.46, 0.56);
  put(294, 0.54, 0.56);
  put(61, 0.43, 0.65);
  put(291, 0.57, 0.65);
  put(0, 0.5, 0.63);
  put(13, 0.5, 0.645);
  put(14, 0.5, 0.655);
  put(17, 0.5, 0.675);
  put(152, 0.5, 0.78);
  put(10, 0.5, 0.2);
  put(234, 0.3, 0.45);
  put(454, 0.7, 0.45);
  put(172, 0.35, 0.68);
  put(397, 0.65, 0.68);
  put(176, 0.44, 0.75);
  put(400, 0.56, 0.75);
  change(points);
  return points;
}

describe('face from a photo: measures (FACE-02)', () => {
  it('reads proportions that do not change with the picture size', () => {
    const small = measureFace(face(), 400, 400);
    const large = measureFace(face(), 1600, 1600);
    expect('measures' in small && 'measures' in large).toBe(true);
    if (!('measures' in small) || !('measures' in large)) return;
    for (const measure of FACE_MEASURES) expect(small.measures[measure]).toBeCloseTo(large.measures[measure], 6);
    // A wider nose reads wider.
    const wide = measureFace(
      face((p) => {
        p[64] = { x: 0.44, y: 0.56 };
        p[294] = { x: 0.56, y: 0.56 };
      }),
      400,
      400,
    );
    expect('measures' in wide && wide.measures.noseWidth > small.measures.noseWidth).toBe(true);
  });

  it('refuses a tilted head, a turned head, a tiny face and a missing face', () => {
    const tilted = face((p) => {
      p[263] = { x: 0.64, y: 0.48 };
      p[362] = { x: 0.55, y: 0.46 };
    });
    expect(measureFace(tilted, 400, 400)).toEqual({ problem: 'tilted' });
    expect(measureFace(face((p) => (p[1] = { x: 0.6, y: 0.55 })), 400, 400)).toEqual({ problem: 'turned' });
    const tiny = face((p) => p.forEach((point) => ((point.x = 0.5 + (point.x - 0.5) * 0.3), (point.y = 0.5 + (point.y - 0.5) * 0.3))));
    expect(measureFace(tiny, 400, 400)).toEqual({ problem: 'small' });
    expect(measureFace([], 400, 400)).toEqual({ problem: 'no-face' });
  });
});

describe('face from a photo: fit (FACE-02)', () => {
  const photo = (change: Partial<FaceMeasures>) => ({ ...HUMAN_FACE, ...change });

  it('the average face sets no control', () => {
    expect(fitFace(HUMAN_FACE)).toEqual({});
  });

  it('a wider nose and a narrower mouth move their own controls, and nothing far away', () => {
    // One spread is 10 % (nose) and 8 % (mouth) of the average; two spreads put a control at its end.
    const face = fitFace(
      photo({ noseWidth: HUMAN_FACE.noseWidth * (1 + 0.1 * 1.2), mouthWidth: HUMAN_FACE.mouthWidth * (1 - 0.08 * 1) }),
    );
    expect(face.noseWidth).toBeGreaterThan(0.3);
    expect(face.nostrils ?? 0).toBeGreaterThanOrEqual(0);
    expect(face.mouthWidth).toBeLessThan(-0.3);
    expect(face.jawWidth).toBeUndefined();
    expect(face.eyeSize).toBeUndefined();
  });

  it('never goes past -1..1, and scales with the strength', () => {
    const far = fitFace(photo({ jawWidth: HUMAN_FACE.jawWidth * 1.5 }));
    expect(far.jawWidth).toBeLessThanOrEqual(1);
    expect(far.jawWidth).toBeGreaterThan(0.9);
    const half = fitFace(photo({ jawWidth: HUMAN_FACE.jawWidth * 1.5 }), 0.5);
    expect(half.jawWidth).toBeCloseTo(far.jawWidth! / 2, 1);
  });
});
