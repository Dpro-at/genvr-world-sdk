import type { DirectionalLight, Scene } from 'three/webgpu';
import type { RealisticQuality } from './realistic-quality.js';
/** Shadow layout for a quality (null: the plain single map). */
export declare function shadowSetup(quality: RealisticQuality | null): {
    cascades: number;
    mapSize: number;
    far: number;
};
/**
 * The sun's shadows (P2-36): one map around the player, or cascaded shadows for the realistic
 * sky: sharp near the camera, reaching hundreds of meters (far hills and trees cast shadows).
 */
export declare class SunShadows {
    #private;
    private readonly sun;
    private readonly scene?;
    constructor(sun: DirectionalLight, scene?: Scene | undefined);
    apply(quality: RealisticQuality | null): void;
    dispose(): void;
}
