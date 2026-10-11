/** Tidewater 4811ba48 MIT: LensDroplets.js two-layer clinging/sliding water lenses. */
import { TSL } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- callback nodes */
type N = any;
const { Fn, If, uniform: rawUniform, wgslFn, vec2, float, max, min, sqrt, smoothstep, mix } = TSL as N;
const uniform = (value: unknown): N => rawUniform(value).setGroup(TSL.renderGroup);
const LENS_WGSL = `fn lensState(uv:vec2f,wetValue:f32,ageValue:f32,seedValue:f32,aspect:f32)->vec4f{
var acc:LensAcc;acc.n2=vec2f(0.0);acc.cover=0.0;acc.trail=0.0;
let p=vec2f(uv.x*aspect,uv.y);
lensLayer(p,0.05,0.003,0.011,wetValue*0.5,false,&acc,wetValue,ageValue,seedValue);
lensLayer(p,0.13,0.01,0.026,wetValue*0.22,true,&acc,wetValue,ageValue,seedValue);
return vec4f(acc.n2,acc.cover,acc.trail);
}

// integer hash (pcg2d) of the float bits: no transcendentals (18 cells x 2 hashes per pixel)
fn lensHash2( p: vec2f ) -> vec2f {
	var v = bitcast<vec2u>( p ) * 1664525u + 1013904223u;
	v.x += v.y * 1664525u; v.y += v.x * 1664525u;
	v = v ^ ( v >> vec2u( 16u ) );
	v.x += v.y * 1664525u; v.y += v.x * 1664525u;
	v = v ^ ( v >> vec2u( 16u ) );
	return vec2f( v >> vec2u( 8u ) ) / 16777216.0;
}

struct LensAcc { n2: vec2f, cover: f32, trail: f32 };

// one layer of droplets (clinging, or sliding: heavy drops that start sliding after a delay)
fn lensLayer( p: vec2f, cell: f32, rMin: f32, rMax: f32, density: f32, slide: bool, acc: ptr<function, LensAcc>, wetValue:f32,ageValue:f32,seedValue:f32 ) {
	let wet = wetValue; let age = ageValue; let seed = seedValue;
	let c0 = floor( p / cell );
	for ( var j = -1; j <= 1; j++ ) {
		for ( var i = -1; i <= 1; i++ ) {
			let c = c0 + vec2f( f32( i ), f32( j ) );
			let h = lensHash2( c + seed );
			// no drop in this cell: it adds nothing (skip the outline math, most cells are empty)
			if ( h.x >= density ) { continue; }
			let h2 = lensHash2( c + seed + 17.3 );
			var center = ( c + ( vec2f( 0.2 ) + h2 * 0.6 ) ) * cell;
			// evaporation shrinks drops; big ones last longer
			let life = clamp( wet * 1.6 - h2.y * 0.6, 0.0, 1.0 );
			let r = mix( rMin, rMax, h.y * h.y ) * sqrt( life );
			if ( slide ) {
				// heavy drops start sliding after a delay and accelerate
				let t0 = h2.x * 3.0 + 0.4;
				let s = max( age - t0, 0.0 );
				let dy = s * s * ( r * 3.5 );
				center.y += dy;
				// wet streak above a sliding drop
				let dxT = abs( p.x - center.x );
				let above = center.y - p.y;
				let tr = smoothstep( r * 0.45, 0.0, dxT ) * smoothstep( 0.0, 0.01, above ) * smoothstep( dy + 0.01, 0.0, above );
				( *acc ).trail = max( ( *acc ).trail, tr * life );
			}
			// irregular outline: a few lobes, sliding drops stretched vertically
			let d = ( p - center ) * vec2f( 1.0, select( 1.0, 0.8, slide ) );
			// outside the largest outline (wobble <= 1.18): no coverage, skip the lobes
			let rB = max( r * 1.18, 1e-4 );
			if ( dot( d, d ) >= rB * rB ) { continue; }
			let ang = atan2( d.y, d.x );
			let wobble = 1.0 + sin( ang * 3.0 + h.x * 40.0 ) * 0.12 + sin( ang * 5.0 + h2.y * 30.0 ) * 0.06;
			let q = d / max( r * wobble, 1e-4 );
			let rq = dot( q, q );
			let a = smoothstep( 1.0, 0.7, rq );
			if ( a > ( *acc ).cover ) {
				( *acc ).n2 = q;
				( *acc ).cover = a;
			}
		}
	}
}

`;

export class LensDrops {
  readonly wet = uniform(0);
  readonly age = uniform(100);
  readonly seed = uniform(0);
  readonly aspect = uniform(1);
  duration = 9;
  #wasUnder = false;
  readonly #state = wgslFn(LENS_WGSL);
  resize(w: number, h: number): void {
    this.aspect.value = w / h;
  }
  update(dt: number, underwater: boolean): void {
    if (underwater) this.wet.value = 0;
    else {
      if (this.#wasUnder) {
        this.wet.value = 1;
        this.age.value = 0;
        this.seed.value = Math.random() * 97;
      }
      this.age.value += dt;
      this.wet.value = Math.max(0, this.wet.value - dt / this.duration);
    }
    this.#wasUnder = underwater;
  }
  node(uv: N, sharp: (uv: N) => N, blurred: (uv: N) => N): N {
    return Fn(() => {
      const col = sharp(uv).toVar();
      If(this.wet.greaterThan(0.001), () => {
        const acc = this.#state({
          uv,
          wetValue: this.wet,
          ageValue: this.age,
          seedValue: this.seed,
          aspect: this.aspect,
        }).toVar();
        If(acc.z.greaterThan(0.001), () => {
          const n = acc.xy,
            r2 = min(n.dot(n), 1),
            nz = sqrt(max(float(1).sub(r2), 0));
          const off = n.mul(-0.05).mul(nz.mul(-0.5).add(1));
          const inside = blurred(uv.add(vec2(off.x.div(this.aspect), off.y)));
          const edge = smoothstep(0.45, 1, r2),
            highlight = smoothstep(0.3, 0, n.sub(vec2(-0.3, -0.4)).length()).mul(0.35);
          col.assign(mix(col, inside.mul(mix(1.04, 0.7, edge)).add(inside.mul(highlight)), acc.z));
        });
        col.assign(mix(col, blurred(uv).mul(0.9), acc.w.mul(0.6)));
      });
      return col;
    })();
  }
  reset(): void {
    this.wet.value = 0;
    this.age.value = 100;
    this.#wasUnder = false;
  }
  dispose(): void {}
}
