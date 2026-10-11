/** Source: Tidewater TerrainBake.js, MIT, pinned 4811ba48d795197de5621985f404e765c0b7c0ef.
 * Normal RGBA8 = nx,nz,rock,AO; splat RGBA8 = sand,path,gully/seagrass,rubble/scarp.
 * Heights must use sea-relative coordinates; source AO skips heights below -25m.
 */
export interface TerrainBakeFields {
  res: number;
  texel: number;
  origin: number;
  heights: Float32Array;
  rock: Float32Array;
  sand: Uint8Array;
  path: Uint8Array;
  gully: Uint8Array;
  seagrass?: Uint8Array;
  rubble?: Uint8Array;
  scarp?: Uint8Array;
  pads?: readonly { x: number; z: number; radius: number }[];
}
export interface TerrainFieldSampler {
  res: number;
  texel: number;
  origin: number;
  heightAt: (x: number, z: number) => number;
  rockAt?: (x: number, z: number) => number;
  /** Mask callbacks use source byte units 0..255 (rock uses 0..1). */
  sandAt?: (x: number, z: number) => number;
  pathAt?: (x: number, z: number) => number;
  gullyAt?: (x: number, z: number) => number;
  seagrassAt?: (x: number, z: number) => number;
  rubbleAt?: (x: number, z: number) => number;
  scarpAt?: (x: number, z: number) => number;
  pads?: TerrainBakeFields['pads'];
}
function validateGrid(res: number, texel: number): void {
  if (!Number.isInteger(res) || res < 8 || res % 4 !== 0 || !Number.isFinite(texel) || texel <= 0)
    throw new RangeError('Terrain bake requires res >=8 divisible by4 and positive finite texel.');
}
/** Sample cell centres exactly as source TerrainData; no source island layout is embedded. */
export function sampleTerrainFields(input: TerrainFieldSampler): TerrainBakeFields {
  validateGrid(input.res, input.texel);
  const n = input.res * input.res;
  const out: TerrainBakeFields = { res: input.res, texel: input.texel, origin: input.origin,
    heights: new Float32Array(n), rock: new Float32Array(n), sand: new Uint8Array(n),
    path: new Uint8Array(n), gully: new Uint8Array(n) };
  if (input.pads) out.pads = input.pads;
  const masks = ['sand', 'path', 'gully', 'seagrass', 'rubble', 'scarp'] as const;
  for (const name of masks) if (input[`${name}At`] && !out[name]) out[name] = new Uint8Array(n);
  for (let j = 0; j < input.res; j++) for (let i = 0; i < input.res; i++) {
    const x = input.origin + (i + .5) * input.texel, z = input.origin + (j + .5) * input.texel;
    const k = j * input.res + i;
    const h = input.heightAt(x, z);
    if (!Number.isFinite(h)) throw new RangeError('Terrain height must be finite.');
    out.heights[k] = h;
    out.rock[k] = Math.max(0, Math.min(1, input.rockAt?.(x, z) ?? 0));
    for (const name of masks) {
      const fn = input[`${name}At`], data = out[name];
      if (fn && data) data[k] = Math.round(Math.max(0, Math.min(255, fn(x, z))));
    }
  }
  return out;
}
const AO_STEPS = [ 4, 8, 13, 19, 27, 38, 52, 72, 100 ];
const AO_DIRS = 8;

export function bakeTerrainMaps( terrain: TerrainBakeFields ) {

	validateGrid(terrain.res, terrain.texel);
  for (const field of ['heights', 'rock', 'sand', 'path', 'gully', 'seagrass', 'rubble', 'scarp'] as const) {
    if (terrain[field] && terrain[field]!.length !== terrain.res * terrain.res)
      throw new RangeError(`Terrain ${field} length does not match resolution.`);
  }
  const t0 = performance.now();
	const { res, heights: H, rock, texel, origin } = terrain;

	// ---- horizon AO on a coarse grid
	const F = 4; // texels per AO cell
	const N = res / F;
	const cell = texel * F;
	const hc = new Float32Array( N * N );
	for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {

		let s = 0;
		for ( let b = 0; b < F; b ++ ) {

			const row = ( j * F + b ) * res + i * F;
			for ( let a = 0; a < F; a ++ ) s += H[ row + a ]!;

		}

		hc[ j * N + i ] = s / ( F * F );

	}

	const ao = new Float32Array( N * N ).fill( 1 );
	const dirs: [number, number][] = [];
	for ( let d = 0; d < AO_DIRS; d ++ ) {

		const a = ( d + 0.5 ) / AO_DIRS * Math.PI * 2;
		dirs.push( [ Math.cos( a ), Math.sin( a ) ] );

	}

	for ( let j = 1; j < N - 1; j ++ ) for ( let i = 1; i < N - 1; i ++ ) {

		const h0 = hc[ j * N + i ]!;
		if ( h0 < - 25 ) continue;
		let vis = 0;
		for ( let d = 0; d < AO_DIRS; d ++ ) {

			const [ dx, dz ] = dirs[ d ]!;
			let maxT = 0;
			for ( let s = 0; s < AO_STEPS.length; s ++ ) {

				const dist = AO_STEPS[ s ]!;
				const x = Math.round( i + dx * dist / cell ), z = Math.round( j + dz * dist / cell );
				if ( x < 0 || z < 0 || x >= N || z >= N ) break;
				const t = ( hc[ z * N + x ]! - h0 - 0.3 ) / dist;
				if ( t > maxT ) maxT = t;

			}

			vis += 1 / ( 1 + maxT * maxT ); // cos^2 of the horizon elevation

		}

		ao[ j * N + i ] = vis / AO_DIRS;

	}

	const t1 = performance.now();

	// ---- per texel maps
	const normal = new Uint8Array( res * res * 4 );
	const splat = new Uint8Array( res * res * 4 );
	const sand = terrain.sand, path = terrain.path, gully = terrain.gully;
	const seagrass = terrain.seagrass, rubble = terrain.rubble, scarp = terrain.scarp;
	const inv2t = 1 / ( 2 * texel );
	for ( let j = 0; j < res; j ++ ) {

		const jm = j > 0 ? j - 1 : 0, jp = j < res - 1 ? j + 1 : res - 1;
		const j2m = j > 1 ? j - 2 : 0, j2p = j < res - 2 ? j + 2 : res - 1;
		// AO grid coordinate (cell centres at (i + 0.5) * F texels)
		let fz = ( j + 0.5 ) / F - 0.5;
		fz = fz < 0 ? 0 : fz > N - 1.001 ? N - 1.001 : fz;
		const az = fz | 0, tz = fz - az;
		for ( let i = 0; i < res; i ++ ) {

			const k = j * res + i;
			const im = i > 0 ? i - 1 : 0, ip = i < res - 1 ? i + 1 : res - 1;
			const hx = ( H[ j * res + ip ]! - H[ j * res + im ]! ) * inv2t;
			const hz = ( H[ jp * res + i ]! - H[ jm * res + i ]! ) * inv2t;
			const il = 1 / Math.sqrt( hx * hx + 1 + hz * hz );
			const nx = - hx * il, nz = - hz * il;

			// cavity from the Laplacian over a 2 m baseline (negative = convex)
			const i2m = i > 1 ? i - 2 : 0, i2p = i < res - 2 ? i + 2 : res - 1;
			const h = H[ k ]!;
			const lap = ( H[ j * res + i2m ]! + H[ j * res + i2p ]! + H[ j2m * res + i ]! + H[ j2p * res + i ]! - 4 * h ) * 0.25;
			let cav = 0.5 + lap * 0.9;
			cav = cav < 0 ? 0 : cav > 1 ? 1 : cav;

			let fx = ( i + 0.5 ) / F - 0.5;
			fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
			const ax = fx | 0, tx = fx - ax;
			const q = az * N + ax;
			const aoL = ( ao[ q ]! * ( 1 - tx ) + ao[ q + 1 ]! * tx ) * ( 1 - tz ) + ( ao[ q + N ]! * ( 1 - tx ) + ao[ q + N + 1 ]! * tx ) * tz;
			let aoT = aoL * ( 1 - Math.max( 0, cav - 0.5 ) * 0.7 );
			aoT = aoT < 0 ? 0 : aoT;

			const o = k * 4;
			normal[ o ] = ( nx * 0.5 + 0.5 ) * 255 + 0.5;
			normal[ o + 1 ] = ( nz * 0.5 + 0.5 ) * 255 + 0.5;
			normal[ o + 2 ] = rock[ k ]! * 255 + 0.5;
			normal[ o + 3 ] = aoT * 255 + 0.5;
			splat[ o ] = sand[ k ]!;
			splat[ o + 1 ] = path[ k ]!;
			splat[ o + 2 ] = seagrass ? Math.max( gully[ k ]!, seagrass[ k ]! ) : gully[ k ]!;
			// alpha: seabed rubble below the sea, the eroded beach scarp face on land
			splat[ o + 3 ] = Math.max( rubble ? rubble[ k ]! : 0, scarp ? scarp[ k ]! : 0 );

		}

	}

	// trampled ground around the building pads carved by the village
	if ( terrain.pads ) {

		for ( const p of terrain.pads ) {

			const R = p.radius + 3.5;
			const i0 = Math.max( 0, Math.floor( ( p.x - R - origin ) / texel ) ), i1 = Math.min( res - 1, Math.ceil( ( p.x + R - origin ) / texel ) );
			const j0 = Math.max( 0, Math.floor( ( p.z - R - origin ) / texel ) ), j1 = Math.min( res - 1, Math.ceil( ( p.z + R - origin ) / texel ) );
			for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

				const x = origin + ( i + 0.5 ) * texel, z = origin + ( j + 0.5 ) * texel;
				const d = Math.hypot( x - p.x, z - p.z );
				const a = Math.atan2( z - p.z, x - p.x );
				// ragged edge: worn patches reach out unevenly around each building
				const reach = 1.2 + 1.8 * ( 0.5 + 0.5 * Math.sin( a * 3 + p.x ) * Math.sin( a * 5 - p.z ) );
				const t = d < p.radius ? 1 : Math.max( 0, 1 - ( d - p.radius ) / reach );
				const o = ( j * res + i ) * 4 + 1;
				const v = Math.round( t * t * 150 );
				if ( v > splat[ o ]! ) splat[ o ] = v;

			}

		}

	}

	return { normal, splat, ms: { ao: t1 - t0, maps: performance.now() - t1 } };

}

