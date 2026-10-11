/** Deterministic reference for Tidewater's periodic gradient weather field (MIT; LICENSE-tidewater.md). */
export function cloudHash(cell: readonly number[]): number[] {
  const p = cell.map(v => (Math.imul(v, 1664525) + 1013904223) >>> 0);
  for (let pass = 0; pass < 2; pass++) {
    p[0] = (p[0]! + Math.imul(p[1]!, p[2]!)) >>> 0;
    p[1] = (p[1]! + Math.imul(p[2]!, p[0]!)) >>> 0;
    p[2] = (p[2]! + Math.imul(p[0]!, p[1]!)) >>> 0;
    if (pass === 0) for (let i = 0; i < 3; i++) p[i] = (p[i]! ^ (p[i]! >>> 16)) >>> 0;
  }
  return p;
}
const mod = (v: number, period: number) => ((v % period) + period) % period;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (v: number) => Math.min(1, Math.max(0, v));
export function cloudPerlin(p: readonly number[], period: number): number {
  const cell = p.map(Math.floor), f = p.map(v => v - Math.floor(v));
  const fade = f.map(v => v * v * v * (v * (v * 6 - 15) + 10));
  const g = (x: number, y: number, z: number) => {
    const h = (cloudHash([mod(cell[0]! + x, period), mod(cell[1]! + y, period), mod(cell[2]! + z, period)])[0]! >>> 24) & 15;
    const o = [f[0]! - x, f[1]! - y, f[2]! - z];
    const u = h < 8 ? o[0]! : o[1]!;
    const v = h < 4 ? o[1]! : h === 12 || h === 14 ? o[0]! : o[2]!;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return mix(mix(mix(g(0,0,0),g(1,0,0),fade[0]!),mix(g(0,1,0),g(1,1,0),fade[0]!),fade[1]!),
    mix(mix(g(0,0,1),g(1,0,1),fade[0]!),mix(g(0,1,1),g(1,1,1),fade[0]!),fade[1]!),fade[2]!);
}
export function cloudWeather(u: number, v: number): number {
  const fbm = (frequency: number, octaves: number, seed: number) => {
    let sum = 0, weights = 0, weight = 0.5;
    for (let i = 0; i < octaves; i++, frequency *= 2, weight *= 0.5) {
      sum += cloudPerlin([u * frequency, v * frequency, (seed * 13.37 + 0.5) * frequency], frequency) * weight;
      weights += weight;
    }
    return sum / weights * 0.5 + 0.5;
  };
  return sat(sat((fbm(4,5,0) - 0.5) * 1.32 + 0.5) + (fbm(6,6,1) * 2 - 1) * 0.13 + 0.26 - 0.5);
}
/** Inverted nearest-feature distance, periodic in every axis. */
export function cloudWorley(p: readonly number[], cells: number): number {
  const q = p.map(v => v * cells), i = q.map(Math.floor), f = q.map(v => v - Math.floor(v));
  let d = Infinity;
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const h = cloudHash([mod(i[0]! + x,cells),mod(i[1]! + y,cells),mod(i[2]! + z,cells)]).map(v => v / 4294967296);
    d = Math.min(d, Math.hypot(x+h[0]!-f[0]!,y+h[1]!-f[1]!,z+h[2]!-f[2]!));
  }
  return sat(1-d);
}
export function cloudShape(p: readonly number[]): number[] {
  return [4,8,16].map(c => {
    const billow = cloudWorley(p,c)*0.625 + cloudWorley(p,c*2)*0.25 + cloudWorley(p,c*4)*0.125;
    return sat(billow);
  });
}
/** Tileable high-pass blue-noise dither; removes the local low-frequency component. */
export function cloudBlue(x: number,y: number): number {
  const hash=(dx:number,dy:number)=>cloudHash([mod(x+dx,64),mod(y+dy,64),17])[0]!/4294967296;
  let neighbors=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)neighbors+=hash(dx,dy);
  return sat(0.5+(hash(0,0)-neighbors/8)*0.9);
}
