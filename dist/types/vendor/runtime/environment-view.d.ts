import { type WorldDocument } from '../contracts/index.js';
import { type StyleLook } from '../core-library/index.js';
import { DirectionalLight, Group, HemisphereLight, Vector3, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import { type RealisticQuality } from './realistic-quality.js';
import { type SkyState } from './sky-cycle.js';
/**
 * Sky, light, fog, and weather of a place (tasks P2-02, P2-06). `apply` reads the world's sky and
 * weather presets (Core Library items) and the style; it runs again whenever `set_sky` or
 * `set_weather` changes them, so changes show live for everyone. Weather particles (rain, snow,
 * dust) follow the player; storms flash lightning. Nights have stars and a moon; with a
 * day-night cycle (`set_sky` params `cycle`, minutes per day) the sun crosses the sky and the
 * colors follow the time of day.
 */
export declare class EnvironmentView {
    #private;
    private readonly scene;
    private style;
    /** Fewer particles on phones and tablets. */
    private readonly quality;
    /** Needed for light from the sky (Realistic); without it styles lit by the sky show the sky only. */
    private readonly renderer?;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly hemisphere: HemisphereLight;
    readonly sun: DirectionalLight;
    /** Where the sun sits relative to the player. */
    readonly sunOffset: Vector3;
    /** Called at each lightning flash (the audio system plays thunder a moment later). */
    onLightning: (() => void) | null;
    constructor(scene: Scene, style: StyleLook, 
    /** Far end of clear-air fog for this map size. */
    fogFar: number, 
    /** Fewer particles on phones and tablets. */
    quality?: number, 
    /** Needed for light from the sky (Realistic); without it styles lit by the sky show the sky only. */
    renderer?: WebGPURenderer | undefined);
    /** True for styles lit by a physical sky (Realistic, P2-36). */
    get realistic(): boolean;
    /** Quality of the realistic sky and light; applies at once. */
    setRealisticQuality(quality: RealisticQuality): void;
    /** Applies the world's sky and weather; cheap when nothing changed. */
    apply(environment: WorldDocument['environment']): void;
    /** A new style (its light changes the scene); applies the current sky and weather again. */
    setStyle(style: StyleLook): void;
    /** How much night it is now: 0 by day, 1 in deep night (lamps shine from about a quarter). */
    get night(): number;
    /** The sky shown now, by name (a cycling sky moves through day, sunset, and night). */
    get lightingNight(): number;
    get skyPhase(): SkyState['phase'];
    /** The time of day in the cycle (0 midnight, 0.5 noon), or null for a fixed sky. */
    get timeOfDay(): number | null;
    /** Call every frame with the player's and the camera's positions. */
    update(dt: number, center: Vector3, time: number, eye?: Vector3, camera?: Camera): void;
    dispose(): void;
}
