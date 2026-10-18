import { Group } from 'three/webgpu';
import type { MouthShape } from '../contracts/index.js';
import type { AvatarExpression } from './avatar-expression.js';
/** A screen face attached to the head bone, independent of skin deformation. */
export declare function createRobotFace(width: number, height: number): {
    root: Group<import("three/webgpu").Object3DEventMap>;
    setExpression(value: AvatarExpression): void;
    setMouth(value: MouthShape): void;
    update(delta: number): void;
    dispose(): void;
};
