/** Tidewater 4811ba48, MIT: MotionBlur.js reconstruction filter with exact tile and neighbour reductions. */
import {
  StorageTexture,
  FloatType,
  NearestFilter,
  Matrix4,
  Vector2,
  TSL,
  type Texture,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL filter types */
type N = any;
const {
  Fn,
  If,
  Loop,
  int,
  float,
  vec2,
  vec4,
  ivec2,
  uniform: rawUniform,
  globalId,
  textureLoad,
  textureStore,
  texture,
  sampler,
  wgslFn,
  max,
  min,
  clamp,
} = TSL as N;
const uniform = (value: unknown): N => rawUniform(value).setGroup(TSL.renderGroup);
const MOTION_WGSL = `fn mbApply( sharpColor: vec3f, uvIn: vec2f, mbColor:texture_2d<f32>, smpLinearClamp:sampler, mbVelocity:texture_2d<f32>, mbDepth:texture_depth_2d, mbNeighbor:texture_2d<f32>, p_shutter:f32, p_outSize:vec2f, p_tileCount:vec2f, p_frameIndex:f32, skyReproj:mat4x4f ) -> vec3f {
	var out = sharpColor;
	if ( p_shutter > 0.0 ) {
		let pix = uvIn * p_outSize;
		let tile = clamp( vec2i( floor( pix / MB_TILE ) ), vec2i( 0 ), vec2i( p_tileCount ) - 1 );
		let nm = textureLoad(mbNeighbor,tile,0);
		let nmLen = nm.z;
		if ( nmLen >= 0.5 ) {
			let inSize = vec2f( textureDimensions( mbVelocity ) );
			let cX = mbTexel( uvIn, inSize );
			let dX = (1.0-textureLoad( mbDepth, cX, 0 ));
			let vX = mbToPx( mbUvVelocity( textureLoad( mbVelocity, cX, 0 ), uvIn, dX , skyReproj) , p_outSize,p_shutter);
			let lenX = length( vX );
			// interleaved gradient noise, shifted every frame
			let pn = floor( pix ) + p_frameIndex * 5.588238;
			let jitter = fract( fract( dot( pn, vec2f( 0.06711056, 0.00583715 ) ) ) * 52.9829189 ) - 0.5;
			// sample pairs: ~3 px apart along the streak, 2..6 pairs
			let pairs = i32( clamp( ceil( nmLen / 3.0 ), 2.0, 6.0 ) );
			let invSize = 1.0 / p_outSize;
			var acc = vec3f( 0.0 );
			let fade = sat( nmLen - 0.5 ); // continuous with the early-out below 0.5 px

			if ( nm.w > nmLen * 0.75 ) {
				// fast path: all streaks in the neighbourhood alike (camera rotation, distant scenery):
				// a plain directional average along the pixel's own motion
				for ( var i = 0; i < pairs; i++ ) {
					let tt = ( f32( i ) + 0.5 + jitter ) / f32( pairs );
					let o = vX * tt * invSize;
					acc += mbSample( uvIn + o , mbColor,smpLinearClamp);
					acc += mbSample( uvIn - o , mbColor,smpLinearClamp);
				}
				out = mix( sharpColor, acc / ( f32( pairs ) * 2.0 ), fade );
			} else {
				// full reconstruction: soft depth classification of each sample against the centre
				var wSum = 0.0;
				let dirX = select( nm.xy, vX, lenX > 0.5 );
				for ( var i = 0; i < pairs; i++ ) {
					let tt = ( f32( i ) + 0.5 + jitter ) / f32( pairs );
					// alternate between the neighbourhood's dominant direction and the pixel's own (Jimenez 2014)
					let dir = select( nm.xy, dirX, ( i & 1 ) == 1 );
					let off = dir * tt;
					let offLen = length( off );
					for ( var k = 0; k < 2; k++ ) {
						let sgn = select( -1.0, 1.0, k == 0 );
						let uvY = uvIn + off * invSize * sgn;
						let tY = mbTexel( uvY, inSize );
						let dY = (1.0-textureLoad( mbDepth, tY, 0 ));
						let lenY = length( mbToPx( mbUvVelocity( textureLoad( mbVelocity, tY, 0 ), uvY, dY , skyReproj) , p_outSize,p_shutter) );
						// reversed-Z depth ~ 1/distance: q > 0 when the sample is farther than the centre
						let q = ( dX - dY ) / max( max( dX, dY ), 1e-12 );
						let behind = sat( q * 40.0 + 0.5 );
						// a sample behind the centre shows through the centre's own streak; one in front
						// covers the centre when its streak reaches it (1 px soft cylinders)
						let spreadX = sat( lenX - max( offLen - 1.0, 0.0 ) );
						let spreadY = sat( lenY - max( offLen - 1.0, 0.0 ) );
						let w = behind * spreadX + ( 1.0 - behind ) * spreadY;
						acc += mbSample( uvY , mbColor,smpLinearClamp) * w;
						wSum += w;
					}
				}
				// whatever the samples don't cover is this pixel's own (sharpened) colour
				let n = f32( pairs ) * 2.0;
				let res = acc / n + sharpColor * max( 1.0 - wSum / n, 0.0 );
				out = mix( sharpColor, res, fade );
			}
		}
	}
	return out;
}


const MB_TILE: f32 = 20.0;
const MB_MAX_TILES_X: i32 = 400;

// uv motion (current - previous) of the pixel at uv with reversed-Z depth d (sky = 0): sky pixels
// reproject their far-plane points with last frame's unjittered camera
fn mbUvVelocity( vel: vec4f, uv: vec2f, d: f32, skyReproj: mat4x4f ) -> vec2f {
	let ndc = ( uv * 2.0 - 1.0 ) * vec2f( 1.0, -1.0 );
	let prev = skyReproj * vec4f( ndc, 1.0, 1.0 );
	return select( ( ndc - prev.xy / prev.w ) * vec2f( 0.5, -0.5 ), vel.xy, d > 1e-7 );
}

// uv velocity -> half streak vector in output pixels (shutter applied, capped at one tile)
fn mbToPx( vel: vec2f, outSize: vec2f, shutter: f32 ) -> vec2f {
	let v = vel * outSize * ( shutter * 0.5 );
	let l = length( v );
	return v * min( 1.0, MB_TILE / max( l, 1e-6 ) );
}


fn mbTexel( uv: vec2f, inSize: vec2f ) -> vec2i { return clamp( vec2i( uv * inSize ), vec2i( 0 ), vec2i( inSize ) - 1 ); }
fn mbSample( uv: vec2f, mbColor:texture_2d<f32>, smpLinearClamp:sampler ) -> vec3f { return textureSampleLevel( mbColor, smpLinearClamp, uv, 0.0 ).rgb; }

// Motion-blurred colour at uv. sharpColor = the (sharpened) unblurred colour at uv, returned
// unchanged where nothing moves; the blur itself reads the unsharpened resolved image, so
// sharpening never acts on blurred pixels.

fn sat(x:f32)->f32{return clamp(x,0.0,1.0);}`;

export class MotionBlur {
  readonly tileMax = new StorageTexture(1, 1);
  readonly neighborMax = new StorageTexture(1, 1);
  readonly shutter = uniform(0.5);
  readonly #size = uniform(new Vector2(1, 1));
  readonly #tiles = uniform(new Vector2(1, 1));
  readonly #frame = uniform(0);
  readonly #skyReproj = uniform(new Matrix4());
  readonly #previousVP = new Matrix4();
  #hasPrevious = false;
  #frameIndex = 0;
  readonly #tileKernel: N;
  readonly #neighborKernel: N;
  readonly #apply = wgslFn(MOTION_WGSL);
  constructor(
    readonly color: Texture,
    readonly depth: Texture,
    readonly velocity: Texture,
    readonly camera: PerspectiveCamera,
  ) {
    for (const t of [this.tileMax, this.neighborMax]) {
      t.type = FloatType;
      t.minFilter = t.magFilter = NearestFilter;
    }
    const toPixels = (v: N): N => {
      const p = v.mul(this.#size).mul(this.shutter).mul(0.5);
      return p.mul(min(1, float(20).div(max(p.length(), 1e-6))));
    };
    this.#tileKernel = Fn(() => {
      const tile = ivec2(globalId.xy);
      If(tile.x.lessThan(this.#tiles.x).and(tile.y.lessThan(this.#tiles.y)), () => {
        const best = vec2(0).toVar(),
          longest = float(0).toVar(),
          shortest = float(1e8).toVar();
        const inSize = vec2((TSL as N).textureSize(texture(velocity), 0));
        Loop(
          { start: int(0), end: int(400), type: 'int', condition: '<', name: 'motionTap' },
          ({ motionTap }: N) => {
            // Same tie order as source's 100 workgroup lanes, each reducing its 2x2 block.
            const lane = motionTap.div(4),
              k = motionTap.mod(4);
            const p = vec2(tile)
              .mul(20)
              .add(vec2(lane.mod(10).mul(2).add(k.mod(2)), lane.div(10).mul(2).add(k.div(2))))
              .add(0.5);
            const q = ivec2(min(p.div(this.#size).mul(inSize), inSize.sub(1)));
            const uv = p.div(this.#size);
            const ndc = uv.mul(2).sub(1).mul(vec2(1, -1));
            const prev = this.#skyReproj.mul(vec4(ndc, 1, 1));
            const skyVelocity = ndc.sub(prev.xy.div(prev.w)).mul(vec2(0.5, -0.5));
            const isGeometry = textureLoad(depth, q).r.lessThan(1 - 1e-7);
            const v = toPixels(isGeometry.select(textureLoad(velocity, q).xy, skyVelocity));
            const l = v.dot(v);
            If(l.greaterThan(longest), () => {
              longest.assign(l);
              best.assign(v);
            });
            shortest.assign(min(shortest, l));
          },
        );
        textureStore(this.tileMax, tile, vec4(best, longest.sqrt(), shortest.sqrt()));
      });
    })().computeKernel([8, 8, 1]);
    this.#neighborKernel = Fn(() => {
      const tile = ivec2(globalId.xy);
      If(tile.x.lessThan(this.#tiles.x).and(tile.y.lessThan(this.#tiles.y)), () => {
        const best = vec4(0).toVar(),
          shortest = float(1e8).toVar();
        for (let y = -1; y <= 1; y++)
          for (let x = -1; x <= 1; x++) {
            const q = ivec2(clamp(tile.add(ivec2(x, y)), ivec2(0), this.#tiles.sub(1)));
            const m = textureLoad(this.tileMax, q).toVar();
            let take = m.z.greaterThan(best.z);
            if (x !== 0 && y !== 0)
              take = take.and(
                m.xy
                  .dot(vec2(-x * Math.SQRT1_2, -y * Math.SQRT1_2))
                  .abs()
                  .greaterThan(m.z.mul(0.7)),
              );
            If(take, () => best.assign(m));
            shortest.assign(min(shortest, m.w));
          }
        textureStore(this.neighborMax, tile, vec4(best.xyz, shortest));
      });
    })().computeKernel([8, 8, 1]);
  }
  resize(w: number, h: number): void {
    if (this.#disposed) return;
    this.#size.value.set(w, h);
    const tx = Math.min(400, Math.ceil(w / 20)),
      ty = Math.min(224, Math.ceil(h / 20));
    this.#tiles.value.set(tx, ty);
    for (const t of [this.tileMax, this.neighborMax]) {
      const im = t.image as { width: number; height: number };
      if (im.width !== tx || im.height !== ty) {
        t.dispose();
        im.width = tx;
        im.height = ty;
        t.needsUpdate = true;
      }
    }
  }
  beginFrame(): void {
    if (this.#disposed) return;
    this.camera.updateMatrixWorld();
    const vp = new Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    if (!this.#hasPrevious) this.#previousVP.copy(vp);
    this.#skyReproj.value.copy(vp).invert().premultiply(this.#previousVP);
    this.#previousVP.copy(vp);
    this.#hasPrevious = true;
  }
  update(renderer: WebGPURenderer, dt: number): void {
    if (this.#disposed) return;
    void dt;
    this.#frame.value = ++this.#frameIndex % 64;
    if (this.shutter.value <= 0) return;
    renderer.compute(this.#tileKernel, [
      Math.ceil(this.#tiles.value.x / 8),
      Math.ceil(this.#tiles.value.y / 8),
      1,
    ]);
    renderer.compute(this.#neighborKernel, [
      Math.ceil(this.#tiles.value.x / 8),
      Math.ceil(this.#tiles.value.y / 8),
      1,
    ]);
  }
  node(sharp: N, uv: N): N {
    return this.#apply({
      sharpColor: sharp,
      uvIn: uv,
      mbColor: texture(this.color),
      smpLinearClamp: sampler(texture(this.color)),
      mbVelocity: texture(this.velocity),
      mbDepth: texture(this.depth),
      mbNeighbor: texture(this.neighborMax),
      p_shutter: this.shutter,
      p_outSize: this.#size,
      p_tileCount: this.#tiles,
      p_frameIndex: this.#frame,
      skyReproj: this.#skyReproj,
    });
  }
  reset(): void {
    this.#hasPrevious = false;
  }
  #disposed = false;
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#tileKernel.dispose();
    this.#neighborKernel.dispose();
    this.tileMax.dispose();
    this.neighborMax.dispose();
  }
}
