/** Tidewater AirHaze hard-shadow query over the live Three CSM targets (standard Z). */
import { type Camera, type DirectionalLight } from 'three/webgpu';
export declare function hazeShadowProvider(sun: DirectionalLight, camera: Camera): ((position: any) => any) | undefined;
