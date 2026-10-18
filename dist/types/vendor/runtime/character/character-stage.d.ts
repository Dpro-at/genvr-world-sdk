import type { AvatarExpression } from '../avatar-expression.js';
import { type CharacterRecipe } from '../../contracts/index.js';
import { type ViewFace } from '../view-cube.js';
import { type MusclePaintMode } from './muscle-paint-mode.js';
import type { MusclePaint } from './human/paint.js';
import { type CharacterShading, type CharacterViewMode } from './view-modes.js';
/** What the editor shows about the character now. */
export interface CharacterStageInfo {
    /** The body asked for, and whether it is drawn (a mesh body shows Classic while its model loads). */
    body: string;
    ready: boolean;
    faces: number;
    /** Quads of a body made of quads (our generated body); 0 for triangle bodies. */
    quads: number;
    vertices: number;
    bones: number;
    /** Standing height at rest (m). */
    height: number;
    clip: string | null;
    expression: AvatarExpression;
    expressionSupported: boolean;
    mouth: import('../../contracts/index.js').MouthShape;
    backend: 'WebGPU' | 'WebGL';
}
export interface CharacterStageColors {
    /** Bone lines and wire (the page's ink). */
    line: string;
    /** Floor grid lines. */
    grid: string;
}
export interface CharacterStage {
    readonly info: CharacterStageInfo;
    /** Every clip the character can play (Core moves and emotes), by name. */
    readonly clips: readonly string[];
    setRecipe(recipe: CharacterRecipe): void;
    setViewMode(mode: CharacterViewMode): void;
    /** In the muscle and fat views: show one muscle group or fat region (1 + its index), 0 for all. */
    setAnatomyFocus(muscle: number, fat: number): void;
    setShading(shading: CharacterShading): void;
    setGrid(on: boolean): void;
    /** First person: turn the upper arms forward so idle hands come into view. */
    setHandsUp(on: boolean): void;
    setColors(colors: CharacterStageColors): void;
    /** Plays a clip in a loop (the editor previews every move in a loop). */
    play(clip: string): void;
    presentAnimation(id: string): boolean;
    setMouth(shape: import('../../contracts/index.js').MouthShape): void;
    presentExpression(expression: AvatarExpression): boolean;
    importAvatarMotion(id: string, data: ArrayBuffer): Promise<boolean>;
    setPaused(paused: boolean): void;
    /** Manual eyelid inspection: null restores automatic blinking. */
    setEyeClosure(amount: number | null): void;
    resetView(): void;
    /** Close-up on the face from the front (face work: eyes, mouth, lines). */
    focusFace(): void;
    lookFrom(face: ViewFace): void;
    onChange(listener: (info: CharacterStageInfo) => void): () => void;
    /**
     * The muscle paint tool (generated bodies): the character is replaced by the default boy, static, to paint
     * muscles on; `stopPaint` brings the character back.
     */
    startPaint(paint: MusclePaint): Promise<MusclePaintMode>;
    stopPaint(): void;
    dispose(): void;
}
/**
 * The character editor's stage (CHAR-01): one character on a calm floor, with the editor's view modes, shaping and
 * clips. Uses the game's own avatar (`createGenvrAvatar`), so every body, clip and spring looks as in play.
 */
export declare function createCharacterStage({ container, recipe: firstRecipe, colors: firstColors, viewCube: showCube, }: {
    container: HTMLElement;
    recipe: CharacterRecipe;
    colors?: CharacterStageColors;
    viewCube?: boolean;
}): Promise<CharacterStage>;
