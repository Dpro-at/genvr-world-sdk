import type { FaceFeature } from '@genvr/contracts';
import humanMean from './human-mean.json';
import { FACE_MEASURES, type FaceMeasure, type FaceMeasures } from './measure';

/**
 * Face from a photo (FACE-02): which face controls a photo's proportions move, and how. A photo is compared with the
 * average human face (MediaPipe's canonical face measured the same way, tooling/face-fit/human-mean.ts ->
 * human-mean.json), so only the person's own difference moves the controls and our head keeps its style (anime
 * proportions stay anime). Each control moves the proportions of its own face part in a known direction (weights
 * below); a control at its end means `FULL_CONTROL_SPREADS` standard deviations of people on its main proportion.
 *
 * A first try read our own rendered head with the same face model to learn these slopes; two such readings did not
 * agree (the drawn eyes read differently each time), so the directions are set here instead (2026-10-07).
 */
export const FACE_FIT: Partial<Record<FaceFeature, Partial<Record<FaceMeasure, number>>>> = {
  eyeSize: { eyeWidth: 1, eyeOpen: 0.4 },
  eyeOpen: { eyeOpen: 1 },
  eyeSpacing: { eyeSpacing: 1 },
  eyeHeight: { eyeHeight: 1, browHeight: -0.3 },
  eyeTilt: { eyeTilt: 1 },
  browHeight: { browHeight: 1 },
  noseSize: { noseWidth: 0.5, noseLength: 0.5 },
  noseWidth: { noseWidth: 1 },
  nostrils: { noseWidth: 0.5 },
  noseLength: { noseLength: 1 },
  mouthWidth: { mouthWidth: 1 },
  mouthHeight: { mouthHeight: 1 },
  upperLip: { upperLip: 1 },
  lowerLip: { lowerLip: 1 },
  mouthCorners: { mouthCorners: 1 },
  cheekVolume: { faceWidth: 0.4, jawWidth: 0.3 },
  chinWidth: { chinWidth: 1 },
  chinHeight: { chinHeight: 1 },
  jawWidth: { jawWidth: 1 },
  // The face's width over its height: one proportion, so one control (a longer head is the same face narrower).
  headWidth: { faceWidth: 1 },
};

/**
 * How much people differ in each proportion (one standard deviation): a share of the average, or an angle (radians)
 * for the eye tilt and a height for the mouth corners. Estimates (lips and the eye opening differ far more between
 * people than the eye spacing), not measured on a population.
 */
const SPREAD_SHARE: Record<Exclude<FaceMeasure, 'eyeTilt' | 'mouthCorners'>, number> = {
  eyeWidth: 0.07,
  eyeOpen: 0.15,
  eyeSpacing: 0.06,
  eyeHeight: 0.04,
  browHeight: 0.12,
  noseWidth: 0.1,
  noseLength: 0.08,
  mouthWidth: 0.08,
  mouthHeight: 0.1,
  upperLip: 0.2,
  lowerLip: 0.2,
  jawWidth: 0.06,
  chinWidth: 0.08,
  chinHeight: 0.1,
  faceWidth: 0.05,
};
const SPREAD_ABSOLUTE = { eyeTilt: 0.06, mouthCorners: 0.02 };
const FULL_CONTROL_SPREADS = 2;
/** A difference further than this many spreads is read as this many (a bad reading, not a face). */
const MOST_SPREADS = 3;
/** Pull towards 0 (the face as made): small differences never become extreme controls. */
const RIDGE = 0.08;
const STEPS = 300;

/** The average human face's proportions (see the top). */
export const HUMAN_FACE: FaceMeasures = humanMean;

/**
 * The face controls for a photo's proportions: bounded least squares (-1..1 each) of the person's differences from
 * the average face, in standard deviations (at most `MOST_SPREADS`), over the controls' directions, with a pull
 * towards 0. `strength` (0..1) scales the result; controls at 0 are left out.
 */
export function fitFace(photo: FaceMeasures, strength = 1): Partial<Record<FaceFeature, number>> {
  const spread = (measure: FaceMeasure) =>
    measure === 'eyeTilt' || measure === 'mouthCorners'
      ? SPREAD_ABSOLUTE[measure]
      : SPREAD_SHARE[measure] * Math.max(1e-3, Math.abs(HUMAN_FACE[measure]));
  // In control units: 1 = a control at its end on its main proportion.
  const target = FACE_MEASURES.map((measure) => {
    const spreads = (photo[measure] - HUMAN_FACE[measure]) / spread(measure);
    return Math.max(-MOST_SPREADS, Math.min(MOST_SPREADS, spreads)) / FULL_CONTROL_SPREADS;
  });
  const features = Object.keys(FACE_FIT) as FaceFeature[];
  const columns = new Map(features.map((feature) => [feature, FACE_MEASURES.map((m) => FACE_FIT[feature]?.[m] ?? 0)]));
  const values = new Map<FaceFeature, number>(features.map((feature) => [feature, 0]));
  // Coordinate descent: each control in turn to its best value with the others held, clamped to -1..1.
  const residual = [...target];
  for (let step = 0; step < STEPS; step += 1) {
    let moved = 0;
    for (const feature of features) {
      const column = columns.get(feature)!;
      const current = values.get(feature)!;
      let dot = 0;
      let norm = RIDGE;
      column.forEach((a, row) => {
        dot += a * (residual[row]! + a * current);
        norm += a * a;
      });
      const next = Math.max(-1, Math.min(1, dot / norm));
      if (next === current) continue;
      column.forEach((a, row) => {
        residual[row] = residual[row]! - a * (next - current);
      });
      values.set(feature, next);
      moved = Math.max(moved, Math.abs(next - current));
    }
    if (moved < 1e-5) break;
  }
  const face: Partial<Record<FaceFeature, number>> = {};
  for (const [feature, value] of values) {
    const scaled = Math.round(value * Math.max(0, Math.min(1, strength)) * 100) / 100;
    if (scaled !== 0) face[feature] = scaled;
  }
  return face;
}
