/**
 * World audio (task P2-08): footsteps that match the ground, and ambience that follows the
 * weather and the time of day. Everything is made with the Web Audio API (no files): shaped
 * noise and short tones, kept soft for kids. Item sounds from packages play in place through
 * `playAt` (P2-16). Audio starts after the player's first tap or key (browser rule).
 */
export type StepSurface = 'grass' | 'dirt' | 'sand' | 'rock' | 'snow' | 'mud' | 'hard' | 'water';
export interface AudioState {
    weather: 'clear' | 'rain' | 'snow' | 'storm' | 'fog' | 'sandstorm';
    sky: 'day' | 'sunset' | 'night' | 'storm' | 'tropical';
}
/** Loudness (0-1): effects for steps, ambience for weather and nature (the "music" slider for now). */
export interface AudioVolumes {
    effects: number;
    ambience: number;
}
/**
 * Muffling under water (P2-39): a lowpass on everything leaving the mixer. `open` is above the
 * range of hearing, so above water the filter changes nothing; `cutoff` is where the world goes
 * dull the moment the head dips under.
 */
export declare const UNDERWATER: {
    readonly open: 20000;
    readonly cutoff: 480;
    readonly fade: 0.12;
};
type Point = {
    x: number;
    y: number;
    z: number;
};
export declare class WorldAudio {
    #private;
    private readonly target;
    constructor(target?: EventTarget);
    setVolumes(volumes: AudioVolumes): void;
    /**
     * The camera went under or came back up (P2-39): everything turns dull under water and clear
     * again above it. Remembered, so sound that starts later comes out right.
     */
    setUnderwater(under: boolean): void;
    /** True while the sound is muffled (the camera is under water). */
    get underwater(): boolean;
    setState(state: AudioState): void;
    /** Call every frame with how far the player moved on the ground and what is under the feet. */
    update(dt: number, moved: number, grounded: boolean, surface: StepSurface): void;
    /** Where sounds are heard from and which way is forward (call every frame with the camera). */
    setListener(position: Point, forward: Point): void;
    /**
     * Plays a sound file at a place in the world (item sounds, P2-16): louder when near, from
     * the side it comes from, and skipped when too far to hear. Files are fetched once.
     */
    playAt(url: string, position: Point): void;
    /**
     * Plays a voice line at a speaker (lip sync, P2-44): like `playAt`, through an analyser the speaker's mouth reads
     * when the line has no mouth cues. Resolves when the sound starts, with its start on the audio clock and that
     * clock; null when audio is off, too far to hear, or the file cannot be played.
     */
    playVoice(url: string, position: Point): Promise<{
        startedAt: number;
        analyser: AnalyserNode;
        now: () => number;
    } | null>;
    /** Audio clock time while the sound runs, null before the first tap, while paused or suspended. */
    get audioTime(): number | null;
    /** Fetches and decodes a sound file once (needs the audio to have started); resolves null when it cannot. */
    loadSample(url: string): Promise<AudioBuffer | null>;
    /** True once `loadSample(url)` has a decoded buffer. */
    sampleReady(url: string): boolean;
    /**
     * Plays a slice of a loaded file in the world through the ambience: `delay` seconds from now on the audio clock,
     * from `position` (HRTF panning only: `gain` already holds the distance), through a low-pass for the air. At most
     * `limit` voices of a `group` sound at once; the oldest fades out. False when the file is not loaded or the
     * sound is off.
     */
    playSample(url: string, options: {
        offset: number;
        duration: number;
        delay: number;
        position: Point;
        gain: number;
        rate: number;
        lowpass: number;
        group: string;
        limit: number;
    }): boolean;
    /**
     * A looping bed of a loaded file at `position`, eased to `gain` (0 fades it out); started at a random point the
     * first time it is heard.
     */
    setLoop(url: string, gain: number, position: Point): void;
    /** One footstep on a surface, with a little random variation so steps never sound the same. */
    step(surface: StepSurface): void;
    /**
     * Effects of a game (P9-12), made like the steps (shaped noise, no files) and placed in the world:
     * `strike` is a short whoosh through the air, `hit` a dull thump with a knock on top.
     */
    gameSound(kind: 'strike' | 'hit', position: Point): void;
    /** Thunder a moment after a lightning flash: a low rumble that rolls away. */
    thunder(): void;
    /**
     * A live copy of the whole world mix (FILM-08: recorded with a filmed shot), after the underwater
     * muffle and the volume sliders; null until the world's sound has started.
     */
    recordingStream(): MediaStream | null;
    /** Stops or restarts all sound (menus, the studio's device preview). */
    setPaused(paused: boolean): void;
    dispose(): void;
}
export {};
