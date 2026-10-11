/**
 * Sound for films (FILM-08): loudness (ITU-R BS.1770 style: K-weighting, 400 ms blocks with 75 %
 * overlap, absolute gate -70 LUFS, relative gate -10 LU), beat finding for fitting music, fades and
 * ducking curves. Pure maths on sample arrays, so it is tested without a browser.
 */

/** Biquad coefficients of the two K-weighting stages for a sample rate (pre-filter shelf + RLB high-pass). */
function kWeighting(rate: number) {
  // Stage 1: high shelf (+4 dB above ~1.5 kHz). Stage 2: high-pass at ~38 Hz. Constants from BS.1770 / pyloudnorm.
  const shelf = (() => {
    const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.974450955533;
    const K = Math.tan((Math.PI * fc) / rate), Vh = 10 ** (G / 20), Vb = Vh ** 0.499666774155;
    const a0 = 1 + K / Q + K * K;
    return { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  const highpass = (() => {
    const Q = 0.5003270373253953, fc = 38.13547087613982, K = Math.tan((Math.PI * fc) / rate);
    const a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, highpass];
}
function filter(x: Float32Array, f: { b: number[]; a: number[] }): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const [b0, b1, b2] = f.b as [number, number, number], [, a1, a2] = f.a as [number, number, number];
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]!; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Integrated loudness in LUFS of 1..n channels (equal weights), or -Infinity for silence. */
export function loudness(channels: Float32Array[], rate: number): number {
  const weighted = channels.map((c) => kWeighting(rate).reduce((s, f) => filter(s, f), c));
  const block = Math.round(rate * 0.4), hop = Math.round(rate * 0.1), n = weighted[0]?.length ?? 0;
  const blocks: number[] = [];
  for (let start = 0; start + block <= n; start += hop) {
    let sum = 0;
    for (const c of weighted) { let s = 0; for (let i = start; i < start + block; i++) s += c[i]! * c[i]!; sum += s / block; }
    blocks.push(sum);
  }
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const loud = blocks.filter((ms) => ms > 0 && lufs(ms) > -70);
  if (!loud.length) return -Infinity;
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const relative = lufs(mean(loud)) - 10;
  const gated = loud.filter((ms) => lufs(ms) > relative);
  return lufs(mean(gated.length ? gated : loud));
}
/** Gain (linear) that brings a measured loudness to a target. */
export const gainFor = (measured: number, target: number) => Number.isFinite(measured) ? 10 ** ((target - measured) / 20) : 1;

/** Beats of a piece of music: tempo by autocorrelation of the onset strength (60-180 BPM), phase by best alignment. */
export function findBeats(mono: Float32Array, rate: number): { bpm: number; beats: number[] } {
  const hop = Math.round(rate / 100), frames = Math.floor(mono.length / hop); // 100 frames per second
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += mono[i]! * mono[i]!; energy[f] = Math.sqrt(s / hop); }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  let bestLag = 50, bestScore = -1;
  for (let lag = Math.round(6000 / 180); lag <= Math.round(6000 / 60); lag++) {
    let s = 0; for (let f = lag; f < frames; f++) s += onset[f]! * onset[f - lag]!;
    // A light preference for tempos near 120 BPM settles half / double ambiguity.
    const bpm = 6000 / lag, weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.2) ** 2);
    if (s * weight > bestScore) { bestScore = s * weight; bestLag = lag; }
  }
  let bestPhase = 0, phaseScore = -1;
  for (let phase = 0; phase < bestLag; phase++) {
    let s = 0; for (let f = phase; f < frames; f += bestLag) s += onset[f]!;
    if (s > phaseScore) { phaseScore = s; bestPhase = phase; }
  }
  const beats: number[] = [];
  for (let f = bestPhase; f < frames; f += bestLag) beats.push(f / 100);
  return { bpm: 6000 / bestLag, beats };
}

/**
 * How to fit music (seconds `from`..`from+length` of the recording) to `target` seconds by cutting at
 * beats: keep a head and a tail on whole bars (4 beats) and drop the middle. Returns the two kept
 * parts, or null when the music is already short enough (it is then left as it is).
 */
export function fitMusic(beats: number[], from: number, length: number, target: number): { head: [number, number]; tail: [number, number] } | null {
  if (length <= target + 0.01) return null;
  const inside = beats.filter((b) => b > from + 0.5 && b < from + length - 0.5);
  if (inside.length < 8) return null;
  const bar = (inside[4]! - inside[0]!) || 2;
  const cutAt = (t: number) => inside.reduce((best, b) => Math.abs(b - t) < Math.abs(best - t) ? b : best, inside[0]!);
  // Head ends on a beat near 40 % of the target; the tail starts on a beat so that the rest fills the target.
  const headEnd = cutAt(from + target * 0.4);
  const want = from + length - (target - (headEnd - from));
  let tailStart = cutAt(want);
  if (tailStart <= headEnd) tailStart = headEnd + bar;
  if (tailStart >= from + length) return null;
  return { head: [from, headEnd], tail: [tailStart, from + length] };
}

/** Gain (0..1) of ducked music at time t: down by `amountDb` while dialogue plays, with `fade` seconds ramps. */
export function duckGain(t: number, dialogue: [number, number][], amountDb: number, fade: number): number {
  const low = 10 ** (-amountDb / 20);
  let gain = 1;
  for (const [a, b] of dialogue) {
    const k = t < a - fade || t > b + fade ? 0 : t < a ? (t - (a - fade)) / fade : t > b ? 1 - (t - b) / fade : 1;
    gain = Math.min(gain, 1 - (1 - low) * Math.max(0, Math.min(1, k)));
  }
  return gain;
}
/** Gain (0..1) of a clip's fade in / out at t seconds after the clip start. */
export function fadeGain(t: number, duration: number, fadeIn: number, fadeOut: number): number {
  const a = fadeIn > 0 ? Math.min(1, Math.max(0, t / fadeIn)) : 1;
  const b = fadeOut > 0 ? Math.min(1, Math.max(0, (duration - t) / fadeOut)) : 1;
  return Math.min(a, b);
}
