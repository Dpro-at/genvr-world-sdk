/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/GrassField.js 627-879 (meadow tone constants, `grassModule` WGSL,
// `createGrassMaterial` vertex / surface WGSL) and the WGSL number / colour formatters `f` and `C` of
// src/world/vegetation/VegNodes.js 58-63 and 271-278.
//
// The source material runs on its own WebGPU engine (`Material` with WGSL snippets, `ShaderModule`).
// Genvr renders with three.js / TSL, so the WGSL is kept here 1:1 as text (the test compares it with
// the source's strings); it is NOT run on any GPU yet. `grassMaterialOptions` returns the exact source
// material options; a `GrassMaterialFactory` (default: a three.js stand-in carrying the options in
// `userData.wgsl`) turns them into a material. The wind helpers the WGSL calls (`vegWindStrength`,
// `vegGustAt`, `vegWindDir3`, `vegWindPerp3`, `vegHash12`, `vegNoise`, `vegDetail`, `vegParams`) live in
// the source's `vegModule` (VegNodes.js); Genvr's TSL equivalent of the wind is vegetation/wind.ts
// (`vegetationWind`), to be bound when the material is ported to TSL.
import { DoubleSide, MeshStandardMaterial, type Material } from 'three';
import { FADE_T0, FADE_T1, FADE_T2, TIER_N } from './grass-patch.js';

/** VegNodes.js 58: a JS number as a WGSL float literal. */
export const f = ( x:number ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// WGSL expression of the linear colour of an sRGB hex (three's `new Color( hex )` -> vec3)
// (VegNodes.js 271-278; the same `_lin` as GrassField.js 630)
const _lin = ( c:number ) => ( c < 0.04045 ? c * 0.0773993808 : Math.pow( c * 0.9478672986 + 0.0521327014, 2.4 ) );
export const C = ( hex:number ) => {

	const r = _lin( ( ( hex >> 16 ) & 255 ) / 255 ), g = _lin( ( ( hex >> 8 ) & 255 ) / 255 ), b = _lin( ( hex & 255 ) / 255 );
	return `vec3f( ${ r.toFixed( 6 ) }, ${ g.toFixed( 6 ) }, ${ b.toFixed( 6 ) } )`;

};

/** A WGSL module of the source engine (ShaderModule options), kept as data. */
export interface GrassWgslModule { name:string; code:string; deps?:readonly GrassWgslModule[] }

/**
 * Stand-in for the source's `vegModule` (VegNodes.js 65, name 'veg'): wind, hashes, detail texture,
 * camera uniform. Not ported as WGSL; pass the real module when one exists.
 */
export const VEG_MODULE_REF:GrassWgslModule = { name: 'veg', code: '' };

// sRGB float triple -> linear WGSL vec3 (TerrainShading.srgb)
const srgb = ( r:number, g:number, b:number ) => `vec3f( ${ _lin( r ).toFixed( 6 ) }, ${ _lin( g ).toFixed( 6 ) }, ${ _lin( b ).toFixed( 6 ) } )`;

// ---- tropical meadow (tall guinea / elephant grass)
// Local copy of TerrainShading.js's MEADOW / meadowTone (the terrain stream has not ported it yet):
// switch to the terrain module's function once it exists. The tone is shared by the terrain and
// the grass field (blade base colour): both evaluate it from the same inputs, so the geometric
// grass fades into the ground without a visible boundary.
export const MEADOW = {
	lush: srgb( 0.13, 0.2, 0.05 ),
	green: srgb( 0.25, 0.32, 0.1 ),
	olive: srgb( 0.36, 0.37, 0.14 ),
	yellow: srgb( 0.5, 0.46, 0.2 ),
	straw: srgb( 0.62, 0.54, 0.33 ),
	soil: srgb( 0.17, 0.13, 0.08 ),
};

// the rotation of an xz vector by a constant angle (matches TerrainShading.rot2)
const rotXZ = ( v:string, a:number ) => {

	const c = Math.cos( a ), s = Math.sin( a );
	return `vec2f( ${ v }.x * ${ f( c ) } - ${ v }.y * ${ f( s ) }, ${ v }.x * ${ f( s ) } + ${ v }.y * ${ f( c ) } )`;

};

export const grassModule:GrassWgslModule = {
	name: 'vegGrass',
	deps: [ VEG_MODULE_REF ],
	code: /* wgsl */`
const VEG_MEADOW_LUSH = ${ MEADOW.lush };
const VEG_MEADOW_GREEN = ${ MEADOW.green };
const VEG_MEADOW_OLIVE = ${ MEADOW.olive };
const VEG_MEADOW_YELLOW = ${ MEADOW.yellow };
const VEG_MEADOW_STRAW = ${ MEADOW.straw };
const VEG_MEADOW_SOIL = ${ MEADOW.soil };

struct VegMeadow { tone: vec3f, dry: f32, lush: f32 };

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1): the samples at
//   rot2( xz, 0.7 ) / 173 and rot2( xz, 2.1 ) / 47 that the terrain takes anyway; slope: 1 - N.y;
//   south: N.z (the sun side). Mostly fresh green grass with olive, sun-bleached yellow and a few
// straw-dry patches (more on exposed slopes), darker lush grass in the damp patches.
// (TerrainShading's optional finer 'detail' input is not used by the grass.)
fn vegMeadowTone( mA: f32, mB: f32, slope: f32, south: f32 ) -> VegMeadow {
	let m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	let olive = smoothstep( 0.52, 0.6, m );
	let yellow = smoothstep( 0.6, 0.67, m );
	let straw = smoothstep( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	let lush = smoothstep( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 );
	var c = mix( VEG_MEADOW_GREEN, VEG_MEADOW_OLIVE, olive );
	c = mix( c, VEG_MEADOW_YELLOW, yellow * 0.8 );
	c = mix( c, VEG_MEADOW_STRAW, straw * 0.55 );
	c = mix( c, VEG_MEADOW_LUSH, lush * 0.75 );
	return VegMeadow( c, olive * 0.4 + yellow * 0.6, lush );
}

// per-tier visibility at camera distance d (1 = full width, 0 = gone); tier 0 thins out per blade
fn vegGrassTierFade( tier: f32, d: f32, cut: f32 ) -> f32 {
	let f2 = 1.0 - smoothstep( ${ f( FADE_T2[ 0 ] ) }, ${ f( FADE_T2[ 1 ] ) }, d );
	let f1 = 1.0 - smoothstep( ${ f( FADE_T1[ 0 ] ) }, ${ f( FADE_T1[ 1 ] ) }, d );
	let f0 = 1.0 - smoothstep( cut - 5.0, cut, d );
	return select( select( f0, f1, tier > 0.5 ), f2, tier > 1.5 );
}
`,
};

export function grassMaterialOptions( field:GrassMaterialSource, vegModule:GrassWgslModule = VEG_MODULE_REF ):GrassMaterialOptions {

	const t = field.terrain;
	const res = t.res;

	return {
		name: 'veg-grass',
		side: 'double',
		roughness: 0.8,
		metalness: 0,
		modules: [ vegModule, grassModule ],
		textures: {
			grassHeights: field.heightTex,
			grassMask: field.maskTex,
		},
		attributes: { iCell: 'vec4f', aSlot: 'vec4f', aBlade: 'vec4f', aSide: 'vec4f' },
		varyings: {
			vVegGrass: 'vec4f', // hf, kind, dune fraction, rand
			vVegGrassTone: 'vec4f', // meadow tone (shared with the terrain), dryness
			vVegGrass2: 'vec4f', // density, leaf / flower centre flag, across, dry blade
			vVegGust: 'f32', // current gust bend (wind sheen)
		},
		vertex: /* wgsl */`
	let cell = v.iCell.xy;
	let slot = v.aSlot;
	let blade = v.aBlade;
	let side4 = v.aSide;
	let side = side4.xyz;
	let P = v.position;
	let N = v.normal;

	let xz = cell + slot.xy;
	let hf = blade.x;
	let kind = blade.y;
	let bRnd = blade.z;

	let m = textureSampleLevel( grassMask, smpLinearClamp, ( xz - ${ f( t.origin ) } ) / ${ f( t.size ) }, 0.0 );
	let isGrass = kind < 0.5;
	let isOat = kind > 0.5 && kind < 2.5;
	let lush = m.g;
	let dune = m.r;
	// the backshore grass is dense in its clumps (the mask carries the clumping and the edge)
	let duneF = dune / ( dune + lush + 1e-3 );
	let grassP = mix( lush, min( dune * 1.1, 1.0 ), duneF );
	let density = select( select( m.a, m.b, isOat ), grassP, isGrass );
	let r = vegHash12( xz * 1.37 + 0.51 );
	let r2 = vegHash12( xz * 2.11 + 7.3 );
	let flowerOk = select( 1.0, select( 0.0, 1.0, r2 < 0.35 ), kind > 3.5 );
	let present = select( 0.0, 1.0, r < density ) * flowerOk;

	// meadow tone at the clump: the same function and inputs as the terrain's meadow shading
	let mA = textureSampleLevel( vegDetail, smpLinearRepeat, ${ rotXZ( 'xz', 0.7 ) } / 173.0, 0.0 ).w;
	let mB = textureSampleLevel( vegDetail, smpLinearRepeat, ${ rotXZ( 'xz', 2.1 ) } / 47.0, 0.0 ).w;
	let mt = vegMeadowTone( mA, mB, 0.0, 0.0 );
	// size: tall meadow grass, knee to waist high: swathes of taller grass in the lush patches,
	// lower where it is dry; wiry dune tufts
	let patchN = vegNoise( xz * ${ f( 1 / 6.5 ) } + 17.3 ) * 0.7 + vegNoise( xz * ${ f( 1 / 2.3 ) } ) * 0.3;
	let lushH = mix( 0.7, 1.3, patchN ) * ( mt.lush * 0.25 + 1.0 ) * ( 1.0 - mt.dry * 0.25 );
	// dune tufts vary a lot in size (young shoots to big old clumps)
	let grassH = mix( lushH, 0.62, duneF ) * mix( r2 * 0.35 + 0.83, r2 * r2 * 0.9 + 0.5, duneF ) * ( density * 0.35 + 0.65 );
	let oatH = r2 * 0.55 + 1.0;
	let vineS = r2 * 0.4 + 0.8;
	let hScale = select( select( vineS, oatH, isOat ), grassH, isGrass );
	// meadow clumps fan out wider than the wiry dune tufts
	let spread = select( 1.0, mix( 1.35, 1.3, duneF ), isGrass );

	// distance LOD: tiers fade out (narrow to nothing), the remaining blades widen so the
	// coverage (blade density x width) stays constant; tier 0 thins out per blade near R_FAR
	let dist = length( xz - vegParams.camPos.xz );
	// tier: grass blades and oats carry their own (aBlade.w), otherwise the slot's
	let tier = max( select( 0.0, blade.w, kind < 2.5 ), slot.w );
	let cutK = bRnd * 7.13 + r2;
	let cut = mix( ${ f( FADE_T0[ 0 ] + 5 ) }, ${ f( FADE_T0[ 1 ] ) }, cutK - floor( cutK ) );
	let own = vegGrassTierFade( tier, dist, cut );
	let f2 = 1.0 - smoothstep( ${ f( FADE_T2[ 0 ] ) }, ${ f( FADE_T2[ 1 ] ) }, dist );
	let f1 = 1.0 - smoothstep( ${ f( FADE_T1[ 0 ] ) }, ${ f( FADE_T1[ 1 ] ) }, dist );
	let comp = ${ f( TIER_N[ 0 ] + TIER_N[ 1 ] + TIER_N[ 2 ] ) } / ( f2 * ${ f( TIER_N[ 2 ] ) } + f1 * ${ f( TIER_N[ 1 ] ) } + ${ f( TIER_N[ 0 ] ) } );
	// oats and creeper simply shrink out
	let widthK = select( 1.0, comp * own, isGrass );
	let sizeK = select( own, 1.0, isGrass );
	let scale = hScale * present * sizeK;

	// per-slot random yaw
	let yaw = vegHash12( xz * 0.73 + 3.3 ) * 6.2832;
	let cy = cos( yaw ); let sy = sin( yaw );

	// terrain height (float texels loaded and bilinearly filtered manually)
	let hfp = ( xz - ${ f( t.origin ) } ) / ${ f( t.texel ) } - 0.5;
	let hfi = floor( hfp );
	let hfr = hfp - hfi;
	let ij = vec2i( clamp( hfi, vec2f( 0.0 ), vec2f( ${ f( res - 2 ) } ) ) );
	let ha = textureLoad( grassHeights, ij, 0 ).x;
	let hb = textureLoad( grassHeights, ij + vec2i( 1, 0 ), 0 ).x;
	let hc = textureLoad( grassHeights, ij + vec2i( 0, 1 ), 0 ).x;
	let hd = textureLoad( grassHeights, ij + vec2i( 1, 1 ), 0 ).x;
	let ground = mix( mix( ha, hb, hfr.x ), mix( hc, hd, hfr.x ), hfr.y );
	let base = vec3f( xz.x, ground - 0.03, xz.y );
	let pl = vec3f( P.x * spread, P.y, P.z * spread );
	let o0 = vec3f( pl.x * cy - pl.z * sy, pl.y, pl.x * sy + pl.z * cy ) * scale;

	// wind: travelling gusts bend blades downwind (length preserving), plus flutter
	let w = vegWindStrength();
	let g = vegGustAt( xz );
	let tm = frame.time;
	let ph = r * 6.2832;
	let bendAmt = w * ( g * 0.55 + 0.22 ) + sin( tm * 1.9 + ph + xz.x * 0.2 ) * w * 0.1;
	let flut = sin( tm * 7.3 + ph * 3.0 + bRnd * 20.0 ) * ( w * 0.06 + 0.015 );
	let stiff = select( select( 0.08, 0.8, isOat ), 1.0, isGrass );
	let hf2 = hf * hf;
	let disp = ( vegWindDir3() * ( bendAmt * hf2 * stiff ) + vegWindPerp3() * ( flut * hf2 * stiff ) ) * ( length( o0 ) + 1e-4 );
	let oL = length( o0 );
	let ob = normalize( o0 + disp + vec3f( 0.0, 1e-5, 0.0 ) ) * oL;

	let wScale = select( 1.0, mix( 1.5, 1.55, duneF ), isGrass );
	let wide = wScale * widthK * min( scale * 2.0, max( scale, 0.5 ) );
	let sideR = vec3f( side.x * cy - side.z * sy, side.y, side.x * sy + side.z * cy );
	let pos = base + ob + sideR * wide;

	// lighting normal: blade normal bent towards up (soft, grass-like shading), rounded across
	// the blade (a folded leaf is lit differently on its two halves)
	let across = side4.w;
	let sideDir = normalize( sideR + vec3f( 1e-5, 0.0, 0.0 ) );
	let nR = vec3f( N.x * cy - N.z * sy, N.y, N.x * sy + N.z * cy );

	// a share of the blades is dead / straw coloured (more in the dry patches)
	let dk = bRnd * 13.7 + r * 3.1;
	let dryBlade = select( 0.0, 1.0, dk - floor( dk ) < mt.dry * 0.3 + 0.07 );
	o.vVegGrass = vec4f( hf, kind, duneF, bRnd );
	o.vVegGrassTone = vec4f( mt.tone, mt.dry );
	o.vVegGrass2 = vec4f( density, select( blade.w, 0.0, kind < 2.5 ), across, dryBlade );
	o.vVegGust = sat( g * w * 0.6 ) * stiff;

	v.useWorld = true;
	v.worldPos = pos;
	v.worldNormal = normalize( nR * 0.5 + VEG_UP + sideDir * ( across * 0.35 ) );
`,
		surface: /* wgsl */`
	let hf = in.vs.vVegGrass.x;
	let kind = in.vs.vVegGrass.y;
	let duneF = in.vs.vVegGrass.z;
	let rnd = in.vs.vVegGrass.w;
	let across = in.vs.vVegGrass2.z;
	let dryBlade = in.vs.vVegGrass2.w;
	// self-shadowing of the sward: dark at the base of the clump
	let ao = mix( 0.32, 1.0, smoothstep( 0.0, 0.75, hf ) );
	// dune grass: olive base, straw tips; meadow: the terrain's meadow tone, dark and brownish
	// (dead leaf sheaths) at the base, lighter / sun-bleached towards the tips
	let duneBase = mix( ${ C( 0x5d6232 ) }, ${ C( 0x7f8a40 ) }, rnd );
	let duneTip = mix( ${ C( 0xb8ab6c ) }, ${ C( 0x9aa452 ) }, rnd );
	let tone = in.vs.vVegGrassTone.xyz * ( rnd * 0.34 + 0.83 );
	let lushBase = mix( tone * 0.5, VEG_MEADOW_SOIL, 0.3 );
	let tipDry = in.vs.vVegGrassTone.w * 0.4 + smoothstep( 0.8, 1.0, rnd ) * 0.35;
	let lushTip = mix( tone * vec3f( 1.25, 1.25, 1.05 ), VEG_MEADOW_STRAW, tipDry * smoothstep( 0.55, 1.0, hf ) );
	let gBase = mix( lushBase, duneBase, duneF );
	let gTip = mix( lushTip, duneTip, duneF );
	var grass0 = mix( gBase, gTip, smoothstep( 0.05, 0.95, hf ) );
	// dead blades: straw to brown
	grass0 = mix( grass0, mix( VEG_MEADOW_STRAW, VEG_MEADOW_SOIL * 1.8, rnd * 0.6 ) * ( smoothstep( 0.0, 0.5, hf ) * 0.4 + 0.6 ), dryBlade * ( 1.0 - duneF ) );
	// pale midrib
	grass0 = grass0 * ( pow( 1.0 - abs( across ), 6.0 ) * smoothstep( 0.05, 0.4, hf ) * 0.18 + 1.0 );
	// wind sheen: blades flattened by a gust show their paler undersides, so gusts read
	// as bright waves rolling across the grass
	let grass = mix( grass0, grass0 * vec3f( 1.3, 1.28, 1.1 ) + vec3f( 0.03, 0.03, 0.015 ), in.vs.vVegGust * smoothstep( 0.15, 0.9, hf ) * 0.6 );
	let oatStalk = mix( ${ C( 0x9c9a62 ) }, ${ C( 0xc2b27a ) }, hf );
	let oatHead = mix( ${ C( 0xc9b27a ) }, ${ C( 0xa8905a ) }, rnd );
	let centre = in.vs.vVegGrass2.y; // 1 at leaf / flower centre
	let vine = mix( mix( ${ C( 0x2e5219 ) }, ${ C( 0x4a7328 ) }, rnd ), ${ C( 0x7a8f4a ) }, centre * 0.3 ) * select( vec3f( 1.0 ), vec3f( 1.25, 1.05, 0.8 ), hf < 0.075 );
	let flower = mix( ${ C( 0xb8479c ) }, ${ C( 0xf2e8ee ) }, smoothstep( 0.35, 0.9, centre ) );
	let c = select( select( select( select( flower, vine, kind < 3.5 ), oatHead, kind < 2.5 ), oatStalk, kind < 1.5 ), grass, kind < 0.5 );
	let albedo = c * select( 1.0, ao, kind < 2.5 );
	s.albedo = albedo;
	s.roughness = select( 0.8, 0.45, kind > 2.5 && kind < 3.5 );
	s.metalness = 0.0;
	s.specularIntensity = 0.4;
	s.normal = normalize( normalize( in.vs.normal ) + in.V * 0.4 );
	// back-lit thin blades glow (evaluated in the lighting model with the shadowed light, so
	// grass in shadow does not)
	let back = pow( sat( dot( - in.V, frame.sunDir ) ), 4.0 );
	s.translucency = albedo * vec3f( 1.1, 1.3, 0.6 ) * ( back * 0.3 * smoothstep( 0.2, 1.0, hf ) ) * ( 1.0 - frame.night );
`,
	};

}

/** What the material reads from the field (GrassField.js 698-709). */
export interface GrassMaterialSource {
	terrain:{ res:number; origin:number; size:number; texel:number };
	heightTex:unknown;
	maskTex:unknown;
}

/** The source engine's `Material` options for the grass (WGSL as text). */
export interface GrassMaterialOptions {
	name:string;
	side:'double';
	roughness:number;
	metalness:number;
	modules:GrassWgslModule[];
	textures:{ grassHeights:unknown; grassMask:unknown };
	attributes:Record<string, string>;
	varyings:Record<string, string>;
	vertex:string;
	surface:string;
}

/** Turns the source material options into a renderer material (the TSL port plugs in here). */
export type GrassMaterialFactory = ( options:GrassMaterialOptions ) => Material;

/**
 * Default factory: a three.js stand-in that carries the source options in `userData.wgsl`. It does
 * NOT place, size or bend anything (that is the WGSL vertex stage): never add it to a scene before the
 * TSL port.
 */
export const standInGrassMaterial:GrassMaterialFactory = ( options ) => {

	const m = new MeshStandardMaterial( { name: options.name, side: DoubleSide, roughness: options.roughness, metalness: options.metalness } );
	m.userData.wgsl = options;
	return m;

};

// ---- CPU mirrors of the WGSL distance LOD (NOT source code that runs on the CPU: written from the
// WGSL above for tests and CPU budgeting; see the README).

const ss = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

/** WGSL `vegGrassTierFade`: per-tier visibility at camera distance d; `cut` is the blade's tier-0 cut-off. */
export function grassTierFade( tier:number, d:number, cut:number ):number {

	const f2 = 1 - ss( FADE_T2[ 0 ], FADE_T2[ 1 ], d );
	const f1 = 1 - ss( FADE_T1[ 0 ], FADE_T1[ 1 ], d );
	const f0 = 1 - ss( cut - 5, cut, d );
	return tier > 1.5 ? f2 : tier > 0.5 ? f1 : f0;

}

/** WGSL `comp`: width compensation of the remaining blades (coverage constant while tiers fade). */
export function grassWidthCompensation( d:number ):number {

	const f2 = 1 - ss( FADE_T2[ 0 ], FADE_T2[ 1 ], d );
	const f1 = 1 - ss( FADE_T1[ 0 ], FADE_T1[ 1 ], d );
	return ( TIER_N[ 0 ] + TIER_N[ 1 ] + TIER_N[ 2 ] ) / ( f2 * TIER_N[ 2 ] + f1 * TIER_N[ 1 ] + TIER_N[ 0 ] );

}

/** WGSL `cut`: the tier-0 cut-off distance of a blade from its random and the slot hash `r2`. */
export function grassTierZeroCut( bRnd:number, r2:number ):number {

	const cutK = bRnd * 7.13 + r2;
	const k = cutK - Math.floor( cutK );
	return ( FADE_T0[ 0 ] + 5 ) + ( FADE_T0[ 1 ] - ( FADE_T0[ 0 ] + 5 ) ) * k;

}
