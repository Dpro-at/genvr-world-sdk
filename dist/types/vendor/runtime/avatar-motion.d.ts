import { AnimationClip, Object3D } from 'three/webgpu';
import type { GenvrAvatar } from './avatar.js';
/** Import supplied motion data without downloading a model or changing the avatar's geometry. */
export declare function retargetAvatarMotion(data: ArrayBuffer, avatar: {
    root: Object3D;
    body: GenvrAvatar['body'];
}, name: string): Promise<AnimationClip>;
