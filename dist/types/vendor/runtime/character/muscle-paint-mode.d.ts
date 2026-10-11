import { type PerspectiveCamera, type Scene } from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type PaintPoseValues } from './human/paint-pose.js';
import { type MusclePaint } from './human/paint.js';
/**
 * The muscle paint tool (owner, 2026-10-05): the default boy with the baked muscle map underneath and the painted
 * strokes on top. Left drag paints with the brush, right drag orbits, the wheel zooms. The arms can be lowered,
 * raised and bent (owner: paint under the arm and round the elbow); the pose is only for the view - every stroke is
 * stored on the A-pose body (`human/paint.ts`), the same format an agent writes, so the bake does not change.
 */
export interface PaintBrush {
    /** The muscle part (contracts MUSCLE_PARTS), or null to erase. */
    part: string | null;
    /** Brush radius in cm. */
    radius: number;
    strength: number;
    mirror: boolean;
}
export interface MusclePaintMode {
    setBrush(brush: PaintBrush): void;
    /** Turns the view to a muscle (his left side's, for a muscle on both sides) and frames it (owner: "click it, go there"). */
    focusPart(part: string): void;
    /** Turns the view to the skin led by these bones (his left side's) and frames it, e.g. ['LeftHand'] for the fingers. */
    focusBones(bones: readonly string[]): void;
    /** The view pose (`human/paint-pose.ts` controls, clamped to the joint law); strokes stay on the A-pose body. */
    setPose(values: PaintPoseValues): void;
    /** The A-pose's own values of the controls that do not start at 0 (arm up, arm to the front, elbow bend). */
    poseRest: Readonly<Record<string, number>>;
    /** The asked slider values, stopped at the last pose the joint law allows, and what the result breaks. */
    limitPose(values: PaintPoseValues, asked: Readonly<Record<string, number>>): {
        values: PaintPoseValues;
        problems: string[];
    };
    /** What breaks the joint law in a pose (empty: fine). */
    poseProblems(values: PaintPoseValues): string[];
    paint(): MusclePaint;
    undo(): void;
    clear(): void;
    onChange(listener: (paint: MusclePaint) => void): () => void;
    dispose(): void;
}
export declare function startMusclePaint({ scene, camera, controls, canvas, paint: first, }: {
    scene: Scene;
    camera: PerspectiveCamera;
    controls: OrbitControls;
    canvas: HTMLCanvasElement;
    paint: MusclePaint;
}): Promise<MusclePaintMode>;
