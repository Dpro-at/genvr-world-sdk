/**
 * Face from a photo (FACE-02, owner notes 82/86): proportions of a face from its MediaPipe Face Landmarker points
 * (478 points with the irises, image coordinates 0..1). The average face is measured the same way
 * (tooling/face-fit/human-mean.ts), so a photo is compared with it like for like. Every measure is
 * a ratio (by the distance between the eye centres, or the face height), so the photo's size and distance do not
 * matter.
 */

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe Face Mesh point numbers (the person's right is the image's left). */
const P = {
  rightOuter: 33,
  rightInner: 133,
  rightTop: 159,
  rightBottom: 145,
  leftOuter: 263,
  leftInner: 362,
  leftTop: 386,
  leftBottom: 374,
  rightBrow: 105,
  leftBrow: 334,
  bridge: 168,
  tip: 1,
  rightWing: 64,
  leftWing: 294,
  rightCorner: 61,
  leftCorner: 291,
  upperLipTop: 0,
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipBottom: 17,
  chin: 152,
  forehead: 10,
  rightCheek: 234,
  leftCheek: 454,
  rightJaw: 172,
  leftJaw: 397,
  rightChin: 176,
  leftChin: 400,
} as const;

/** The proportions measured, in a fixed order (the fit's rows). */
export const FACE_MEASURES = [
  'eyeWidth',
  'eyeOpen',
  'eyeSpacing',
  'eyeHeight',
  'eyeTilt',
  'browHeight',
  'noseWidth',
  'noseLength',
  'mouthWidth',
  'mouthHeight',
  'upperLip',
  'lowerLip',
  'mouthCorners',
  'jawWidth',
  'chinWidth',
  'chinHeight',
  'faceWidth',
] as const;
export type FaceMeasure = (typeof FACE_MEASURES)[number];
export type FaceMeasures = Record<FaceMeasure, number>;

/** Why a picture cannot be used, in words for the person. */
export type PhotoProblem = 'no-face' | 'many-faces' | 'turned' | 'tilted' | 'small';

/** Head turn and tilt the measures still hold for (the model card: tilted no more than 8 degrees). */
const LIMITS = { turn: 0.12, tiltDegrees: 8, smallest: 0.2 };

/**
 * The measures of one face, or why the picture does not work: the head must face the camera (turn), stand upright
 * (tilt) and fill enough of the picture (small). `width` / `height` are the picture's pixels (points are 0..1).
 */
export function measureFace(
  points: readonly LandmarkPoint[],
  width: number,
  height: number,
): { measures: FaceMeasures } | { problem: PhotoProblem } {
  if (points.length < 478) return { problem: 'no-face' };
  const at = (i: number) => ({ x: points[i]!.x * width, y: points[i]!.y * height });
  const distance = (a: number, b: number) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
  // The eye centres from their corners, not the pupils: our drawn eyes have no pupil the model can find, and the
  // corners are what both a photo and our head show clearly.
  const centre = (outer: number, inner: number) => ({
    x: (at(outer).x + at(inner).x) / 2,
    y: (at(outer).y + at(inner).y) / 2,
  });
  const rightEye = centre(P.rightOuter, P.rightInner);
  const leftEye = centre(P.leftOuter, P.leftInner);
  const pupils = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const faceHeight = at(P.chin).y - at(P.forehead).y;
  if (!(pupils > 0) || !(faceHeight > 0)) return { problem: 'no-face' };
  // Tilt: the line between the eyes; turn: the nose tip off the middle of the cheeks.
  const tilt = (Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x) * 180) / Math.PI;
  if (Math.abs(tilt) > LIMITS.tiltDegrees) return { problem: 'tilted' };
  const cheeks = distance(P.rightCheek, P.leftCheek);
  const middle = (at(P.rightCheek).x + at(P.leftCheek).x) / 2;
  if (Math.abs(at(P.tip).x - middle) / cheeks > LIMITS.turn) return { problem: 'turned' };
  if (faceHeight / height < LIMITS.smallest && cheeks / width < LIMITS.smallest) return { problem: 'small' };

  const eyeY = (rightEye.y + leftEye.y) / 2;
  const mouthY = (at(P.upperLipInner).y + at(P.lowerLipInner).y) / 2;
  const eyeWidth = (distance(P.rightOuter, P.rightInner) + distance(P.leftOuter, P.leftInner)) / 2;
  // Outer corner above the inner one is a positive tilt (y grows downwards in pictures).
  const slant = (outer: number, inner: number) =>
    Math.atan2(at(inner).y - at(outer).y, Math.abs(at(inner).x - at(outer).x));
  return {
    measures: {
      eyeWidth: eyeWidth / pupils,
      eyeOpen: (distance(P.rightTop, P.rightBottom) + distance(P.leftTop, P.leftBottom)) / 2 / eyeWidth,
      eyeSpacing: distance(P.rightInner, P.leftInner) / pupils,
      eyeHeight: (at(P.chin).y - eyeY) / faceHeight,
      eyeTilt: (slant(P.rightOuter, P.rightInner) + slant(P.leftOuter, P.leftInner)) / 2,
      browHeight: (eyeY - (at(P.rightBrow).y + at(P.leftBrow).y) / 2) / pupils,
      noseWidth: distance(P.rightWing, P.leftWing) / pupils,
      noseLength: (at(P.tip).y - at(P.bridge).y) / pupils,
      mouthWidth: distance(P.rightCorner, P.leftCorner) / pupils,
      mouthHeight: (at(P.chin).y - mouthY) / faceHeight,
      upperLip: distance(P.upperLipTop, P.upperLipInner) / pupils,
      lowerLip: distance(P.lowerLipInner, P.lowerLipBottom) / pupils,
      mouthCorners: (mouthY - (at(P.rightCorner).y + at(P.leftCorner).y) / 2) / pupils,
      jawWidth: distance(P.rightJaw, P.leftJaw) / pupils,
      chinWidth: distance(P.rightChin, P.leftChin) / pupils,
      chinHeight: (at(P.chin).y - at(P.lowerLipBottom).y) / pupils,
      faceWidth: cheeks / faceHeight,
    },
  };
}
