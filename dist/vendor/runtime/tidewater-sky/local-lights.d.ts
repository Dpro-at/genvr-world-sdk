import { Color, Vector3, Vector4, type Camera, type PointLight, type SpotLight, type MeshStandardNodeMaterial } from 'three/webgpu';
export declare function localSpotProfile(cosine: number, inner: number, outer: number): number;
export declare function localAttenuation(distanceSquared: number, range: number, spot?: number): number;
export declare function localWaterTransmission(receiverHeight: number, lightHeight: number, distance: number, seaLevel: number, extinction: readonly number[]): number[];
export interface LocalLightSource {
    position: Vector3;
    color: Color;
    intensity: number;
    range: number;
    dir?: Vector3;
    cosInner?: number;
    cosOuter?: number;
    enabled?: boolean;
    flicker?: number;
    phase?: number;
    scale?: number;
    update?: () => void;
}
export declare class LocalLights {
    #private;
    readonly sources: LocalLightSource[];
    enabled: boolean;
    strength: number;
    active: number;
    time: number;
    readonly positions: Vector4[];
    readonly colors: Vector4[];
    readonly directions: Vector4[];
    readonly count: any;
    readonly seaLevel: any;
    readonly waterExtinction: any;
    readonly positionArray: any;
    readonly colorArray: any;
    readonly directionArray: any;
    readonly flashlight: {
        on: boolean;
        intensity: number;
        range: number;
        color: Color;
        cosInner: number;
        cosOuter: number;
        position: Vector3;
        dir: Vector3;
        primed: boolean;
    };
    constructor();
    add(source: LocalLightSource): LocalLightSource;
    remove(source: LocalLightSource): void;
    /** Bind an existing scene lamp. Caller hides its original Three light while this gate is active. */
    addLight(light: PointLight | SpotLight): LocalLightSource;
    toggleFlashlight(on?: boolean): boolean;
    update(camera: Camera, dt: number, night: number): void;
    attach(material: MeshStandardNodeMaterial): void;
    detach(material: MeshStandardNodeMaterial): void;
    dispose(): void;
}
