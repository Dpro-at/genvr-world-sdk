import type { HumanData } from './format.js';
/** Expressions built from our own baked face targets; no foreign avatar topology is copied. */
export const HUMAN_EXPRESSION_TARGETS = {
  faceSmile: { 'face.mouthCorners+': .55, 'face.cheekVolume+': .08, 'face.eyeOpen-': .12 },
  faceAngry: { 'face.browHeight-': .28, 'face.browAngle-': .35, 'face.eyeOpen-': .15, 'face.mouthCorners-': .20 },
  faceSad: { 'face.browHeight+': .12, 'face.browAngle+': .25, 'face.mouthCorners-': .45, 'face.eyeOpen-': .10 },
  faceSurprised: { 'face.browHeight+': .4, 'face.eyeOpen+': .5 },
  faceThinking: { 'face.browHeight+': .10, 'face.browAngle+': .15, 'face.eyeOpen-': .08 },
} as const;
export function humanExpressionTargets(data: HumanData, drawn: number): Record<keyof typeof HUMAN_EXPRESSION_TARGETS, Float32Array> {
  return Object.fromEntries(Object.entries(HUMAN_EXPRESSION_TARGETS).map(([name, terms]) => {
    const values = new Float32Array(drawn * 3);
    for (const [key, amount] of Object.entries(terms)) {
      const target = data.targets.get(key); if (!target) continue;
      for (let i = 0; i < target.indices.length; i++) {
        const vertex = target.indices[i]!; if (vertex >= drawn) continue;
        for (let axis = 0; axis < 3; axis++) values[vertex * 3 + axis] = values[vertex * 3 + axis]! + target.deltas[i * 3 + axis]! * amount;
      }
    }
    return [name, values];
  })) as Record<keyof typeof HUMAN_EXPRESSION_TARGETS, Float32Array>;
}
