import { SpeechMouth } from '@genvr/runtime';
import type { MouthShape } from '@genvr/contracts';
import type { Asset, SceneCue } from './model';

/** Cue audio is monitored live and exported from its timeline asset, never recorded twice. */
export class SceneSpeech {
  private context: AudioContext | null = null;
  private lines: Array<{ cue: SceneCue; buffer: AudioBuffer; mouth: SpeechMouth }> = [];
  private sources: AudioBufferSourceNode[] = [];
  private started: number | null = null;
  private active = new Set<string>();
  constructor(private mouth: (actor: string, shape: MouthShape) => void) {}
  async prepare(cues: SceneCue[], assets: Asset[]) {
    this.stop();
    this.lines = [];
    const sounding = cues.filter(cue => cue.audio);
    if (!sounding.length) return;
    this.context ??= new AudioContext();
    await Promise.race([this.context.resume(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Audio is waiting for browser activation. Press Play once, then record again.')), 3000))]);
    for (const cue of sounding) {
      const asset = assets.find(row => row.id === cue.audio);
      if (!asset) throw new Error(`Dialogue audio is missing for ${cue.label}.`);
      const buffer = await this.context.decodeAudioData(await asset.blob.arrayBuffer());
      this.lines.push({ cue, buffer, mouth: new SpeechMouth() });
    }
  }
  start() {
    this.stop();
    if (!this.context || !this.lines.length) return;
    this.started = this.context.currentTime;
    for (const line of this.lines) {
      const { cue, buffer } = line;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = cue.volume;
      source.connect(gain).connect(this.context.destination);
      source.start(this.started + cue.start, 0, Math.min(buffer.duration, cue.end - cue.start));
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.sources.push(source);
      line.mouth.speak({ duration: Math.min(buffer.duration, cue.end - cue.start), cues: [] }, cue.start, {
        fftSize: 512,
        getFloatTimeDomainData: out => {
          const offset = Math.max(0, Math.floor(((this.context!.currentTime - this.started!) - cue.start) * buffer.sampleRate));
          out.fill(0);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < out.length && offset + i < samples.length; i++) out[i] = samples[offset + i]! * cue.volume;
        },
      });
    }
  }
  tick() {
    if (this.started === null || !this.context) return;
    const time = this.context.currentTime - this.started, speaking = new Map<string, MouthShape>();
    for (const line of this.lines) {
      if (time >= line.cue.start && time < Math.min(line.cue.end, line.cue.start + line.buffer.duration)) speaking.set(line.cue.actor, line.mouth.shapeAt(time));
    }
    for (const actor of this.active) if (!speaking.has(actor)) this.mouth(actor, 'X');
    for (const [actor, shape] of speaking) this.mouth(actor, shape);
    this.active = new Set(speaking.keys());
    if (this.lines.every(line => time >= line.cue.end)) this.stop();
  }
  stop() {
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.sources = []; this.started = null;
    for (const actor of this.active) this.mouth(actor, 'X');
    this.active.clear();
  }
  dispose() { this.stop(); void this.context?.close(); this.context = null; this.lines = []; }
}
