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

/** Step sound shape per surface: filter type, frequency, length, and loudness. */
const STEPS: Record<
  StepSurface,
  { type: BiquadFilterType; frequency: number; q: number; length: number; gain: number }
> = {
  grass: { type: 'lowpass', frequency: 1100, q: 0.7, length: 0.09, gain: 0.35 },
  dirt: { type: 'lowpass', frequency: 700, q: 1, length: 0.08, gain: 0.4 },
  sand: { type: 'bandpass', frequency: 2600, q: 0.6, length: 0.12, gain: 0.25 },
  rock: { type: 'bandpass', frequency: 1800, q: 2.5, length: 0.05, gain: 0.45 },
  snow: { type: 'bandpass', frequency: 3200, q: 1.2, length: 0.14, gain: 0.3 },
  mud: { type: 'lowpass', frequency: 420, q: 3, length: 0.13, gain: 0.45 },
  hard: { type: 'bandpass', frequency: 1300, q: 3.5, length: 0.045, gain: 0.5 },
  water: { type: 'bandpass', frequency: 900, q: 0.8, length: 0.22, gain: 0.4 },
};

/** Weather bed: noise shaped by two filters, and its loudness. */
const BEDS: Record<AudioState['weather'], { low: number; high: number; gain: number; gusts: boolean }> = {
  clear: { low: 200, high: 700, gain: 0.04, gusts: true },
  fog: { low: 150, high: 500, gain: 0.05, gusts: true },
  rain: { low: 1400, high: 9000, gain: 0.22, gusts: false },
  storm: { low: 700, high: 7000, gain: 0.32, gusts: true },
  snow: { low: 250, high: 900, gain: 0.07, gusts: true },
  sandstorm: { low: 300, high: 2400, gain: 0.3, gusts: true },
};

/** Meters walked per step sound. */
const STRIDE = 0.8;

/**
 * Muffling under water (P2-39): a lowpass on everything leaving the mixer. `open` is above the
 * range of hearing, so above water the filter changes nothing; `cutoff` is where the world goes
 * dull the moment the head dips under.
 */
export const UNDERWATER = { open: 20000, cutoff: 480, fade: 0.12 } as const;

/** Item sounds (P2-16): full loudness up to REF meters, fading out, not played beyond HEARING. */
const ITEM_SOUND = { ref: 3, hearing: 35, rolloff: 1.3 } as const;

type Point = { x: number; y: number; z: number };

/**
 * Recorded sea sounds go through the ambience, whose default is 0.56: this lifts them back to Tidewater's levels
 * there (their mix is set for a master of about 0.9), so the slider still turns them down or off.
 */
const SEA_TRIM = 1.6;

export class WorldAudio {
  #context: AudioContext | null = null;
  #effects: GainNode | null = null;
  #voice: GainNode | null = null;
  #ambience: GainNode | null = null;
  /** Everything passes through this on its way out, so going under water muffles the lot. */
  #muffle: BiquadFilterNode | null = null;
  #underwater = false;
  #noise: AudioBuffer | null = null;
  #bed: {
    source: AudioBufferSourceNode;
    low: BiquadFilterNode;
    high: BiquadFilterNode;
    gain: GainNode;
  } | null = null;
  #volumes: AudioVolumes = { effects: 0.8, ambience: 0.56 };
  #state: AudioState = { weather: 'clear', sky: 'day' };
  #walked = 0;
  #nextCritter = 2;
  #gust = 0;
  #disposed = false;
  /** Decoded item sound files by link (fetched once). */
  readonly #buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** The same files once decoded, for scheduled one-shots that cannot wait (the surf). */
  readonly #decoded = new Map<string, AudioBuffer>();
  /** Voices of recorded one-shots per group (the surf's crash, wash, backwash), oldest first. */
  readonly #voices = new Map<string, Array<{ source: AudioBufferSourceNode; gain: GainNode }>>();
  /** Looping recorded beds by file (the distant surf). */
  readonly #loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; panner: PannerNode }>();
  /** Sound is off on purpose (the quiet studio, a paused game): voice lines do not wake it. */
  #paused = false;
  /** Where the player hears from (the camera). */
  #listener: Point = { x: 0, y: 0, z: 0 };
  readonly #start = () => this.#ensure();

  constructor(private readonly target: EventTarget = window) {
    // Browsers only allow sound after the player interacts with the page.
    target.addEventListener('pointerdown', this.#start, { once: false });
    target.addEventListener('keydown', this.#start, { once: false });
  }

  setVolumes(volumes: AudioVolumes): void {
    this.#volumes = volumes;
    const now = this.#context?.currentTime ?? 0;
    this.#effects?.gain.setTargetAtTime(volumes.effects, now, 0.05);
    this.#ambience?.gain.setTargetAtTime(volumes.ambience, now, 0.2);
  }

  /**
   * The camera went under or came back up (P2-39): everything turns dull under water and clear
   * again above it. Remembered, so sound that starts later comes out right.
   */
  setUnderwater(under: boolean): void {
    if (this.#underwater === under) return;
    this.#underwater = under;
    const context = this.#context;
    if (!context || !this.#muffle) return;
    this.#muffle.frequency.setTargetAtTime(
      under ? UNDERWATER.cutoff : UNDERWATER.open,
      context.currentTime,
      UNDERWATER.fade,
    );
  }

  /** True while the sound is muffled (the camera is under water). */
  get underwater(): boolean {
    return this.#underwater;
  }

  setState(state: AudioState): void {
    this.#state = state;
    this.#shapeBed();
  }

  /** Call every frame with how far the player moved on the ground and what is under the feet. */
  update(dt: number, moved: number, grounded: boolean, surface: StepSurface): void {
    const context = this.#context;
    if (!context || context.state !== 'running') return;
    if (grounded || surface === 'water') {
      this.#walked += moved;
      if (this.#walked >= STRIDE) {
        this.#walked = 0;
        this.step(surface);
      }
    } else this.#walked = STRIDE * 0.6;
    // Gusts of wind: the bed swells and falls slowly.
    const bed = this.#bed;
    if (bed && BEDS[this.#state.weather].gusts) {
      this.#gust += dt * 0.35;
      const swell = 0.75 + 0.35 * Math.sin(this.#gust) * Math.sin(this.#gust * 0.37);
      bed.gain.gain.setTargetAtTime(BEDS[this.#state.weather].gain * swell, context.currentTime, 0.4);
    }
    // Birds by day, crickets at night (only in calm weather).
    this.#nextCritter -= dt;
    if (this.#nextCritter <= 0) {
      const calm = this.#state.weather === 'clear' || this.#state.weather === 'fog';
      if (calm && this.#state.sky === 'night') this.#cricket();
      else if (calm && this.#state.sky !== 'storm') this.#bird();
      this.#nextCritter = 2.5 + Math.random() * 6;
    }
  }

  /** Where sounds are heard from and which way is forward (call every frame with the camera). */
  setListener(position: Point, forward: Point): void {
    this.#listener = { ...position };
    const listener = this.#context?.listener;
    if (!listener) return;
    if (listener.positionX) {
      const at = this.#context!.currentTime;
      listener.positionX.setValueAtTime(position.x, at);
      listener.positionY.setValueAtTime(position.y, at);
      listener.positionZ.setValueAtTime(position.z, at);
      listener.forwardX.setValueAtTime(forward.x, at);
      listener.forwardY.setValueAtTime(forward.y, at);
      listener.forwardZ.setValueAtTime(forward.z, at);
      listener.upX.setValueAtTime(0, at);
      listener.upY.setValueAtTime(1, at);
      listener.upZ.setValueAtTime(0, at);
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /**
   * Plays a sound file at a place in the world (item sounds, P2-16): louder when near, from
   * the side it comes from, and skipped when too far to hear. Files are fetched once.
   */
  playAt(url: string, position: Point): void {
    const context = this.#context;
    const out = this.#effects;
    if (!context || !out || context.state !== 'running') return;
    const l = this.#listener;
    if (Math.hypot(position.x - l.x, position.y - l.y, position.z - l.z) > ITEM_SOUND.hearing) return;
    let buffer = this.#buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) =>
          response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`)),
        )
        .then((data) => context.decodeAudioData(data))
        .catch(() => null);
      this.#buffers.set(url, buffer);
    }
    void buffer.then((decoded) => {
      if (!decoded || this.#context !== context) return;
      const source = context.createBufferSource();
      source.buffer = decoded;
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = ITEM_SOUND.ref;
      panner.maxDistance = ITEM_SOUND.hearing;
      panner.rolloffFactor = ITEM_SOUND.rolloff;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      source.connect(panner).connect(out);
      source.start();
    });
  }

  /**
   * Plays a voice line at a speaker (lip sync, P2-44): like `playAt`, through an analyser the speaker's mouth reads
   * when the line has no mouth cues. Resolves when the sound starts, with its start on the audio clock and that
   * clock; null when audio is off, too far to hear, or the file cannot be played.
   */
  playVoice(
    url: string,
    position: Point,
  ): Promise<{ startedAt: number; analyser: AnalyserNode; now: () => number } | null> {
    const context = this.#context;
    const out = this.#voice;
    if (!context || !out || this.#paused) return Promise.resolve(null);
    const l = this.#listener;
    if (Math.hypot(position.x - l.x, position.y - l.y, position.z - l.z) > ITEM_SOUND.hearing)
      return Promise.resolve(null);
    // A line that comes while the sound is still starting (just after Test or a join) waits for it, not the next one.
    const awake =
      context.state === 'running'
        ? Promise.resolve(true)
        : context.resume().then(
            () => true,
            () => false,
          );
    let buffer = this.#buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) =>
          response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`)),
        )
        .then((data) => context.decodeAudioData(data))
        .catch(() => null);
      this.#buffers.set(url, buffer);
    }
    return Promise.all([buffer, awake]).then(([decoded, ok]) => {
      if (!decoded || !ok || this.#paused || this.#context !== context || context.state !== 'running')
        return null;
      const source = context.createBufferSource();
      source.buffer = decoded;
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = ITEM_SOUND.ref;
      panner.maxDistance = ITEM_SOUND.hearing;
      panner.rolloffFactor = ITEM_SOUND.rolloff;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(panner).connect(out);
      source.connect(analyser);
      const startedAt = context.currentTime;
      source.start();
      return { startedAt, analyser, now: () => context.currentTime };
    });
  }

  // ---- recorded sounds placed in the world (the surf, Tidewater sea plan task 6)

  /** Audio clock time while the sound runs, null before the first tap, while paused or suspended. */
  get audioTime(): number | null {
    const context = this.#context;
    return context && context.state === 'running' && !this.#paused ? context.currentTime : null;
  }

  /** Fetches and decodes a sound file once (needs the audio to have started); resolves null when it cannot. */
  loadSample(url: string): Promise<AudioBuffer | null> {
    const context = this.#context;
    if (!context) return Promise.resolve(null);
    let buffer = this.#buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) =>
          response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`)),
        )
        .then((data) => context.decodeAudioData(data))
        .then((decoded) => {
          this.#decoded.set(url, decoded);
          return decoded;
        })
        .catch(() => null);
      this.#buffers.set(url, buffer);
    }
    return buffer;
  }

  /** True once `loadSample(url)` has a decoded buffer. */
  sampleReady(url: string): boolean {
    return this.#decoded.has(url);
  }

  /**
   * Plays a slice of a loaded file in the world through the ambience: `delay` seconds from now on the audio clock,
   * from `position` (HRTF panning only: `gain` already holds the distance), through a low-pass for the air. At most
   * `limit` voices of a `group` sound at once; the oldest fades out. False when the file is not loaded or the
   * sound is off.
   */
  playSample(
    url: string,
    options: {
      offset: number;
      duration: number;
      delay: number;
      position: Point;
      gain: number;
      rate: number;
      lowpass: number;
      group: string;
      limit: number;
    },
  ): boolean {
    const context = this.#context;
    const out = this.#ambience;
    const decoded = this.#decoded.get(url);
    if (!context || !out || !decoded || this.#paused || context.state !== 'running') return false;
    const at = context.currentTime + Math.max(0.005, options.delay);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = options.rate;
    const gain = context.createGain();
    gain.gain.value = options.gain * SEA_TRIM;
    const air = context.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = options.lowpass;
    const panner = this.#panner(context, options.position);
    source.connect(gain).connect(air).connect(panner).connect(out);
    source.start(at, options.offset, options.duration);
    const voices = this.#voices.get(options.group) ?? [];
    this.#voices.set(options.group, voices);
    const voice = { source, gain };
    voices.push(voice);
    source.onended = () => {
      const k = voices.indexOf(voice);
      if (k >= 0) voices.splice(k, 1);
      gain.disconnect();
      air.disconnect();
      panner.disconnect();
    };
    while (voices.length > options.limit) {
      const old = voices.shift()!;
      old.gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      try {
        old.source.stop(context.currentTime + 0.3);
      } catch {
        // already stopped
      }
    }
    return true;
  }

  /**
   * A looping bed of a loaded file at `position`, eased to `gain` (0 fades it out); started at a random point the
   * first time it is heard.
   */
  setLoop(url: string, gain: number, position: Point): void {
    const context = this.#context;
    const out = this.#ambience;
    if (!context || !out || context.state !== 'running') return;
    let bed = this.#loops.get(url);
    if (!bed) {
      const decoded = this.#decoded.get(url);
      if (!decoded || gain < 1e-4) return;
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.loop = true;
      const level = context.createGain();
      level.gain.value = 0;
      const panner = this.#panner(context, position);
      source.connect(level).connect(panner).connect(out);
      source.start(context.currentTime + 0.02, Math.random() * decoded.duration);
      bed = { source, gain: level, panner };
      this.#loops.set(url, bed);
    }
    const now = context.currentTime;
    // fades in slowly the first time, then follows within half a second
    bed.gain.gain.setTargetAtTime(gain * SEA_TRIM, now, bed.gain.gain.value === 0 ? 0.8 : 0.5);
    bed.panner.positionX.setTargetAtTime(position.x, now, 0.1);
    bed.panner.positionY.setTargetAtTime(position.y, now, 0.1);
    bed.panner.positionZ.setTargetAtTime(position.z, now, 0.1);
  }

  /** A panner that only gives the direction (HRTF); the caller sets the level for the distance. */
  #panner(context: AudioContext, position: Point): PannerNode {
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.rolloffFactor = 0;
    panner.maxDistance = 10000;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    return panner;
  }

  /** One footstep on a surface, with a little random variation so steps never sound the same. */
  step(surface: StepSurface): void {
    const context = this.#context;
    const out = this.#effects;
    if (!context || !out || !this.#noise) return;
    const shape = STEPS[surface];
    const at = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.#noise;
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = context.createBiquadFilter();
    filter.type = shape.type;
    filter.frequency.value = shape.frequency * (0.9 + Math.random() * 0.2);
    filter.Q.value = shape.q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(shape.gain * (0.8 + Math.random() * 0.3), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + shape.length);
    source.connect(filter).connect(gain).connect(out);
    source.start(at, Math.random() * 1.5, shape.length + 0.05);
  }

  /**
   * Effects of a game (P9-12), made like the steps (shaped noise, no files) and placed in the world:
   * `strike` is a short whoosh through the air, `hit` a dull thump with a knock on top.
   */
  gameSound(kind: 'strike' | 'hit', position: Point): void {
    const context = this.#context;
    const out = this.#effects;
    if (!context || !out || !this.#noise || context.state !== 'running') return;
    const l = this.#listener;
    if (Math.hypot(position.x - l.x, position.y - l.y, position.z - l.z) > ITEM_SOUND.hearing) return;
    const at = context.currentTime;
    const panner = context.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = ITEM_SOUND.ref;
    panner.maxDistance = ITEM_SOUND.hearing;
    panner.rolloffFactor = ITEM_SOUND.rolloff;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y + 1.2;
    panner.positionZ.value = position.z;
    panner.connect(out);
    const source = context.createBufferSource();
    source.buffer = this.#noise;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    if (kind === 'strike') {
      // A band of noise that sweeps up and back down: the tool passing.
      const length = 0.22;
      filter.type = 'bandpass';
      filter.Q.value = 1.4;
      filter.frequency.setValueAtTime(500, at);
      filter.frequency.exponentialRampToValueAtTime(2400, at + length * 0.45);
      filter.frequency.exponentialRampToValueAtTime(700, at + length);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + length * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      source.connect(filter).connect(gain).connect(panner);
      source.start(at, Math.random() * 1.5, length + 0.05);
      return;
    }
    // A hit: a low thump of noise and a short falling knock.
    const length = 0.16;
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.7, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(gain).connect(panner);
    source.start(at, Math.random() * 1.5, length + 0.05);
    const knock = context.createOscillator();
    const knockGain = context.createGain();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(240, at);
    knock.frequency.exponentialRampToValueAtTime(90, at + 0.1);
    knockGain.gain.setValueAtTime(0.25, at);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    knock.connect(knockGain).connect(panner);
    knock.start(at);
    knock.stop(at + 0.14);
  }

  /** Thunder a moment after a lightning flash: a low rumble that rolls away. */
  thunder(): void {
    const context = this.#context;
    const out = this.#ambience;
    if (!context || !out || !this.#noise) return;
    const at = context.currentTime + 0.4 + Math.random() * 1.2;
    const source = context.createBufferSource();
    source.buffer = this.#noise;
    source.playbackRate.value = 0.5;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.9, at + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.2);
    source.connect(filter).connect(gain).connect(out);
    source.start(at, 0, 3.4);
  }

  #bird(): void {
    const context = this.#context;
    const out = this.#ambience;
    if (!context || !out) return;
    let at = context.currentTime;
    const base = 2400 + Math.random() * 1800;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), at + 0.08);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.13);
      at += 0.13 + Math.random() * 0.08;
    }
  }

  #cricket(): void {
    const context = this.#context;
    const out = this.#ambience;
    if (!context || !out) return;
    let at = context.currentTime;
    for (let i = 0; i < 3; i += 1) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 4300 + Math.random() * 300;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.03, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.06);
      at += 0.08;
    }
  }

  /** Creates the audio graph on the first interaction, or resumes it. */
  #tap: MediaStreamAudioDestinationNode | null = null;
  #externalVoice: MediaStreamAudioSourceNode | null = null;
  #externalVoiceStream: MediaStream | null = null;
  setVoiceRecordingStream(stream: MediaStream | null): void {
    this.#externalVoice?.disconnect(); this.#externalVoice = null; this.#externalVoiceStream = stream;
    if(stream && this.#context && this.#tap) {this.#externalVoice=this.#context.createMediaStreamSource(stream);this.#externalVoice.connect(this.#tap);}
  }
  /**
   * A live copy of the whole world mix (FILM-08: recorded with a filmed shot), after the underwater
   * muffle and the volume sliders; null until the world's sound has started.
   */
  recordingStream(): MediaStream | null {
    if (!this.#context || !this.#muffle) return null;
    if (!this.#tap) { this.#tap = this.#context.createMediaStreamDestination(); this.#muffle.connect(this.#tap); this.setVoiceRecordingStream(this.#externalVoiceStream); }
    return this.#tap.stream;
  }

  #ensure(): void {
    if (this.#disposed) return;
    if (this.#context) {
      if (this.#context.state === 'suspended') void this.#context.resume();
      return;
    }
    const context = new AudioContext();
    this.#context = context;
    this.#effects = context.createGain();
    this.#voice = context.createGain();
    this.#ambience = context.createGain();
    this.#effects.gain.value = this.#volumes.effects;
    this.#ambience.gain.value = this.#volumes.ambience;
    // Under water the high sounds go first, which is what makes it sound muffled. A lowpass wide
    // open (UNDERWATER.open) passes everything, so above water nothing changes.
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 0.7;
    muffle.frequency.value = this.#underwater ? UNDERWATER.cutoff : UNDERWATER.open;
    muffle.connect(context.destination);
    this.#muffle = muffle;
    this.#effects.connect(muffle);
    this.#voice.connect(muffle);
    this.#ambience.connect(muffle);
    // Two seconds of white noise, reused by every step, the weather, and thunder.
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.#noise = noise;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(high).connect(low).connect(gain).connect(this.#ambience);
    source.start();
    this.#bed = { source, low, high, gain };
    this.#shapeBed();
  }

  #shapeBed(): void {
    const bed = this.#bed;
    const context = this.#context;
    if (!bed || !context) return;
    const shape = BEDS[this.#state.weather];
    const now = context.currentTime;
    bed.high.frequency.setTargetAtTime(shape.low, now, 0.8);
    bed.low.frequency.setTargetAtTime(shape.high, now, 0.8);
    bed.gain.gain.setTargetAtTime(shape.gain, now, 1.2);
  }

  /** Stops or restarts all sound (menus, the studio's device preview). */
  setPaused(paused: boolean): void {
    this.#paused = paused;
    if (!this.#context) return;
    void (paused ? this.#context.suspend() : this.#context.resume());
  }

  dispose(): void {
    this.#disposed = true;
    this.target.removeEventListener('pointerdown', this.#start);
    this.target.removeEventListener('keydown', this.#start);
    this.#bed?.source.stop();
    for (const loop of this.#loops.values()) loop.source.stop();
    this.#loops.clear();
    void this.#context?.close();
    this.#context = null;
  }
}
