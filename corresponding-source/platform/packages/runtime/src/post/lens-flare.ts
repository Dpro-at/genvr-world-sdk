/** Tidewater 4811ba48 MIT: LensFlare.js seven-blade ghosts, dispersive halo and starburst. */
import {
  StorageBufferAttribute,
  Vector2,
  Vector3,
  TSL,
  type Texture,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL functions */
type N = any;
const {
  uniform: rawUniform,
  storage,
  Fn,
  textureLoad,
  textureSize,
  texture,
  ivec2,
  vec2,
  float,
  clamp,
  smoothstep,
  mix,
  wgslFn,
} = TSL as N;
const uniform = (value: unknown): N => rawUniform(value).setGroup(TSL.renderGroup);
const FLARE_WGSL = `fn flareLight( uv: vec2f,aspect:f32,sunUV:vec2f,strength:f32,visibility:f32,sunColor:vec3f,outputHeight:f32 ) -> vec3f {
	let asp = vec2f( aspect, 1.0 );
	let p = ( uv - 0.5 ) * asp * vec2f( 1.0, -1.0 );
	let s = ( sunUV - 0.5 ) * asp * vec2f( 1.0, -1.0 );
	let vis = visibility;
	// light arriving from the sun disc (the key light colour follows the atmosphere's
	// transmittance; at night the moon is the key light and flares only faintly)
	let light = sunColor * vis * strength * 0.02;
	if ( vis <= 0.0 ) { return vec3f( 0.0 ); }

	var ghosts = vec3f( 0.0 );
{let pd=flarePolyDist(p-s*0.72);let body=vec3f(smoothstep(0.01755,0.015795,pd),smoothstep(0.018,0.0162,pd),smoothstep(0.018449999999999998,0.016604999999999998,pd));let rim=smoothstep(0.0099,0.018,pd)*.7+.3;ghosts+=body*rim*vec3f(1,0.85,0.6)*4.753086419753087;}
{let pd=flarePolyDist(p-s*0.44);let body=vec3f(smoothstep(0.043875,0.0394875,pd),smoothstep(0.045,0.0405,pd),smoothstep(0.04612499999999999,0.041512499999999994,pd));let rim=smoothstep(0.02475,0.045,pd)*.7+.3;ghosts+=body*rim*vec3f(0.55,0.9,1)*0.4839506172839506;}
{let pd=flarePolyDist(p-s*0.16);let body=vec3f(smoothstep(0.021449999999999997,0.019305,pd),smoothstep(0.022,0.019799999999999998,pd),smoothstep(0.022549999999999997,0.020294999999999997,pd));let rim=smoothstep(0.0121,0.022,pd)*.7+.3;ghosts+=body*rim*vec3f(0.8,1,0.7)*2.6033057851239674;}
{let pd=flarePolyDist(p-s*-0.18);let body=vec3f(smoothstep(0.06825,0.06142500000000001,pd),smoothstep(0.07,0.06300000000000001,pd),smoothstep(0.07175,0.064575,pd));let rim=smoothstep(0.038500000000000006,0.07,pd)*.7+.3;ghosts+=body*rim*vec3f(0.6,0.75,1)*0.1257142857142857;}
{let pd=flarePolyDist(p-s*-0.42);let body=vec3f(smoothstep(0.029249999999999998,0.026324999999999998,pd),smoothstep(0.03,0.027,pd),smoothstep(0.030749999999999996,0.027674999999999998,pd));let rim=smoothstep(0.0165,0.03,pd)*.7+.3;ghosts+=body*rim*vec3f(1,0.7,0.9)*1.2444444444444447;}
{let pd=flarePolyDist(p-s*-0.75);let body=vec3f(smoothstep(0.10725,0.096525,pd),smoothstep(0.11,0.099,pd),smoothstep(0.11274999999999999,0.101475,pd));let rim=smoothstep(0.060500000000000005,0.11,pd)*.7+.3;ghosts+=body*rim*vec3f(0.7,1,0.85)*0.03239669421487604;}
{let pd=flarePolyDist(p-s*-1.15);let body=vec3f(smoothstep(0.04875,0.043875000000000004,pd),smoothstep(0.05,0.045000000000000005,pd),smoothstep(0.05125,0.046125,pd));let rim=smoothstep(0.027500000000000004,0.05,pd)*.7+.3;ghosts+=body*rim*vec3f(1,0.8,0.55)*0.3136;}


	// fade the ghosts as the sun nears the centre (they collapse onto it and vanish)
	let offAxis = smoothstep( 0.02, 0.2, length( s ) );

	// halo: dispersive ring about the image centre
	let rc = length( p );
	let halo = vec3f( smoothstep( 0.03, 0.0, abs( rc - 0.43 ) ), smoothstep( 0.03, 0.0, abs( rc - 0.445 ) ), smoothstep( 0.03, 0.0, abs( rc - 0.46 ) ) ) * smoothstep( 0.25, 0.8, length( s ) ) * 0.12;

	// starburst and veiling glare around the sun (distances in image heights)
	let q = p - s;
	let rq = max( length( q ), 1e-4 );
	let aq = atan2( q.y, q.x ) + .3;
	let px = 1.0 / max( outputHeight, 1.0 );
	// the nearest spike (two per blade) and this pixel's distance from its line
	let seg = 0.4487989505128276;
	let k = floor( aq / seg + 0.5 );
	let perp = abs( sin( aq - k * seg ) ) * rq;
	let ki = k - 14.0 * floor( k / 14.0 ); // same spike across the atan2 seam
	let h1 = fract( sin( ki * 12.9898 + 4.1 ) * 43758.5453 );
	let h2 = fract( sin( ki * 78.233 + 1.7 ) * 43758.5453 );
	// thin at the disc, a little softer outward (same energy across the line: dimmer as it widens)
	let width = px * 0.8 + rq * 0.003;
	let line = exp( - ( perp * perp ) / ( width * width ) ) * ( px * 0.8 / width );
	let len = 0.05 + 0.08 * h1;
	let lenC = vec3f( len * 1.12, len, len * 0.88 );
	let taper = exp( - rq / lenC - ( rq * rq ) / ( lenC * lenC * 4.0 ) );
	let spikes = line * taper * ( 0.45 + 0.55 * h2 ) * 1.4;
	// fine streaks around the disc: smooth angular noise, short
	let t = ( aq * 0.15915494309189535 + 0.5 ) * 48.0;
	let ti = floor( t );
	let hA = fract( sin( ( ti - 48.0 * floor( ti / 48.0 ) ) * 91.345 ) * 43758.5453 );
	let hB = fract( sin( ( ti + 1.0 - 48.0 * floor( ( ti + 1.0 ) / 48.0 ) ) * 91.345 ) * 43758.5453 );
	let n = mix( hA, hB, smoothstep( 0.0, 1.0, t - ti ) );
	let fine = pow( n, 5.0 ) * exp( - rq / 0.03 ) * 0.3;
	let glow = exp( rq * -5.0 ) * 0.05 + exp( rq * -40.0 ) * 0.4;
	let burst = spikes + vec3f( fine + glow );

	return light * ( ghosts * offAxis + halo + burst );
}

const FLARE_SEG: f32 = 0.8975979010256552;

// aperture polygon: distance scaled so the polygon edge sits at the given radius
fn flarePolyDist( d: vec2f ) -> f32 {
	let a = atan2( d.y, d.x ) + .3;
	return length( d ) * cos( floor( a / FLARE_SEG + 0.5 ) * FLARE_SEG - a );
}

// HDR flare light for this screen position (added before exposure / tone mapping)
`;

export class LensFlare {
  readonly strength = uniform(1);
  readonly sunUV = uniform(new Vector2(0.5, 0.5));
  readonly #sun = uniform(new Vector3(0, 1, 0));
  readonly #color = uniform(new Vector3(1, 1, 1));
  readonly #aspect = uniform(1);
  readonly #height = uniform(1);
  readonly #inView = uniform(0);
  readonly #above = uniform(1);
  readonly #disc = uniform(1.5);
  readonly #dt = uniform(1 / 60);
  readonly #visBuffer = new StorageBufferAttribute(new Float32Array(1), 1);
  readonly #vis = storage(this.#visBuffer, 'float', 1);
  readonly #visibilityKernel: N;
  readonly #apply = wgslFn(FLARE_WGSL);
  constructor(
    readonly depth: Texture,
    readonly camera: PerspectiveCamera,
    cloudTransmittance?: (direction: N) => N,
  ) {
    this.#visibilityKernel = Fn(() => {
      const size = vec2(textureSize(texture(depth), 0)),
        center = this.sunUV.mul(size);
      const sky = float(0).toVar();
      for (let i = 0; i < 24; i++) {
        const r = Math.sqrt((i + 0.5) / 24),
          a = i * 2.39996323;
        const p = ivec2(
          clamp(center.add(vec2(Math.cos(a) * r, Math.sin(a) * r).mul(this.#disc)), vec2(0), size.sub(1)),
        );
        sky.addAssign(
          textureLoad(depth, p)
            .r.greaterThan(1 - 1e-7)
            .select(1, 0),
        );
      }
      const cloudT = cloudTransmittance ? cloudTransmittance(this.#sun) : float(1);
      const tgt = sky
        .div(24)
        .mul(cloudT)
        .mul(smoothstep(-0.02, 0.04, this.#sun.y))
        .mul(this.#inView)
        .mul(this.#above);
      const v = this.#vis.element(0);
      v.assign(mix(v, tgt, float(1).sub(this.#dt.mul(-14).exp())));
    })().compute(1);
  }
  resize(w: number, h: number): void {
    if (this.#disposed) return;
    this.#aspect.value = w / h;
    this.#height.value = h;
  }
  update(renderer: WebGPURenderer, dt: number, sun: Vector3, aboveWater = true, sunColor?: Vector3): void {
    if (this.#disposed) return;
    this.camera.updateMatrixWorld();
    this.#sun.value.copy(sun);
    if (sunColor) this.#color.value.copy(sunColor);
    const c = this.camera;
    const p = c.position.clone().addScaledVector(sun, 1000).project(c);
    this.sunUV.value.set(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    const ahead = new Vector3(0, 0, -1).applyQuaternion(c.quaternion).dot(sun) > 0.05;
    this.#inView.value = ahead
      ? Math.min(1, Math.max(0, (1 - Math.max(Math.abs(p.x), Math.abs(p.y))) / 0.1))
      : 0;
    this.#above.value = aboveWater ? 1 : 0;
    this.#dt.value = Math.min(dt, 0.1);
    const im = this.depth.image as { height: number };
    this.#disc.value = Math.max(1.5, (0.004625 / Math.tan((c.fov * Math.PI) / 360)) * im.height * 0.5);
    renderer.compute(this.#visibilityKernel);
  }
  node(uv: N): N {
    return this.#apply({
      uv,
      aspect: this.#aspect,
      sunUV: this.sunUV,
      strength: this.strength,
      visibility: this.#vis.element(0),
      sunColor: this.#color,
      outputHeight: this.#height,
    });
  }
  reset(): void {
    if (this.#disposed) return;
    this.#visBuffer.array[0] = 0;
    this.#visBuffer.needsUpdate = true;
  }
  #disposed = false;
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#visibilityKernel.dispose();
    this.#visBuffer.dispose();
  }
}
