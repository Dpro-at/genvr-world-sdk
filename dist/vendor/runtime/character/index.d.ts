/** The character editor (CHAR-01): recipe shaping, view modes and the editor stage. */
export { boneFactors, boneRoles, shapedBody, shapedJoints, shapeSkin, type BoneRole, type ShapeBone, type ShapeInput, type ShapeOutput, } from './shape.js';
export { armsOnlyIndex, CHARACTER_VIEW_MODES, viewModeSetup, type CharacterShading, type CharacterViewMode, type ViewModeSetup, } from './view-modes.js';
export { createCharacterStage, type CharacterStage, type CharacterStageColors, type CharacterStageInfo, } from './character-stage.js';
export type { ViewFace } from '../view-cube.js';
export type { MusclePaintMode, PaintBrush } from './muscle-paint-mode.js';
export { POSE_CONTROLS, type PaintPoseValues, type PoseControl } from './human/paint-pose.js';
export { emptyPaint, MUSCLE_PAINT_FORMAT, rasterizePaint, type MusclePaint, type PaintStroke, } from './human/paint.js';
