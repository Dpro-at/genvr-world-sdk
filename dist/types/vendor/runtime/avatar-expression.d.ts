import type { SkinnedMesh } from 'three/webgpu';
export type AvatarExpression = 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised' | 'thinking';
export declare const EXPRESSION_MORPHS: Record<AvatarExpression, Record<string, number>>;
export declare const EXPRESSION_KEYS: string[];
/** The mouth is composed first each frame; expression weights never accumulate over previous frames. */
export declare function applyAvatarExpression(mesh: SkinnedMesh, expression: AvatarExpression, weights: Record<string, number>, delta: number): void;
