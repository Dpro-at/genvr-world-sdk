/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import { BoatMaterialSpecs, type BoatBucket, type HullShape } from './boat-materials.js';
type N = any;
/** Verbatim lines of the engine's common WGSL module that the boat snippets use (sat, TWO_PI, MaterialX noise). */
export declare const BOAT_COMMON_WGSL = "\nconst TWO_PI: f32 = 6.283185307179586;\nfn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }\nfn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }\nfn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {\n\tvar a = a0; var b = b0; var c = c0;\n\tc ^= b; c -= _mxRotl( b, 14u );\n\ta ^= c; a -= _mxRotl( c, 11u );\n\tb ^= a; b -= _mxRotl( a, 25u );\n\tc ^= b; c -= _mxRotl( b, 16u );\n\ta ^= c; a -= _mxRotl( c, 4u );\n\tb ^= a; b -= _mxRotl( a, 14u );\n\tc ^= b; c -= _mxRotl( b, 24u );\n\treturn c;\n}\nfn mxHash3( x: i32, y: i32, z: i32 ) -> u32 { let s = 0xdeadbeefu + ( 3u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s + u32( z ) ); }\nfn _gradDot3( h: u32, p: vec3f ) -> f32 {\n\tlet hh = h & 15u;\n\tlet u = select( p.y, p.x, hh < 8u );\n\tlet v = select( select( p.z, p.x, hh == 12u || hh == 14u ), p.y, hh < 4u );\n\treturn select( u, - u, ( hh & 1u ) != 0u ) + select( v, - v, ( hh & 2u ) != 0u );\n}\nfn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }\nfn _h3( i: vec3i ) -> u32 { return mxHash3( i.x, i.y, i.z ); }\nfn perlin3( p: vec3f ) -> f32 {\n\tlet fl = floor( p );\n\tlet i = vec3i( fl );\n\tlet f = p - fl;\n\tlet u = _fade3( f );\n\tlet n000 = _gradDot3( _h3( i ), f );\n\tlet n100 = _gradDot3( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );\n\tlet n010 = _gradDot3( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );\n\tlet n110 = _gradDot3( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );\n\tlet n001 = _gradDot3( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );\n\tlet n101 = _gradDot3( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );\n\tlet n011 = _gradDot3( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );\n\tlet n111 = _gradDot3( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );\n\tlet x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );\n\tlet x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );\n\treturn mix( x0, x1, u.z ) * 0.982;\n}\nfn mx_noise_float3( p: vec3f ) -> f32 { return perlin3( p ); }\nfn mx_fractal_noise_float3( p: vec3f, octaves: i32, lacunarity: f32, diminish: f32 ) -> f32 {\n\tvar r = 0.0; var amp = 1.0; var q = p;\n\tfor ( var i = 0; i < octaves; i++ ) { r += amp * perlin3( q ); amp *= diminish; q *= lacunarity; }\n\treturn r;\n}\n";
/** The inputs every surface entry takes, in order (one signature for all seven buckets). */
export declare const BOAT_SURFACE_INPUTS: readonly ["twUv", "twColor", "twAux", "twLocal", "twP", "twN", "twTime", "twNight", "twSunDir", "twSunColor", "twSky", "twNavOn"];
/** Inputs of the fittings vertex entry, in order. */
export declare const BOAT_VERTEX_INPUTS: readonly ["twPosition", "twAux", "twTime", "twWindSpeed", "twFlagPivot", "twFlagDir", "twFlagWind"];
export interface BoatShadingWgsl {
    /** One wgslFn source per bucket; its first function is the entry (wgslFn calls the first declaration). */
    surfaces: Record<BoatBucket, string>;
    /** The fittings vertex animation (ensign, whip antenna), entry first. */
    fittingsVertex: string;
}
/** The generated WGSL of every boat material (entry first, then structs, the source boat module and noise). */
export declare function boatShadingWgsl(specs: BoatMaterialSpecs): BoatShadingWgsl;
/** Uniform handles shared with BoatModel.update / setNavLights (BoatMaterials keeps them as `{ value }`). */
export interface BoatShadingHandles {
    navOn: {
        value: number;
    };
    flagPivot: {
        value: Vector3;
    };
    flagDir: {
        value: Vector3;
    };
    flagWind: {
        value: number;
    };
}
/** Frame inputs (the source engine's frame uniforms). Missing ones are owned by BoatShading. */
export interface BoatShadingBindings {
    /** Simulation time in seconds (frame.time): radar sweep, gauges, ensign and whip motion. */
    time?: N;
    /** 0 day .. 1 night (frame.night): screen and light brightness. */
    night?: N;
    /** Wind speed in m/s at 10 m (frame.windSpeed): whip antenna sway. */
    windSpeed?: N;
    /** Direction toward the sun or moon (frame.sunDir), world space. */
    sunDirection?: N;
    /** Sun colour times intensity (frame.sunColor). */
    sunColor?: N;
    /** Sky irradiance (frame.skyIrradiance): the wheelhouse headliner fill. */
    skyIrradiance?: N;
}
export type BoatShadedMaterial = MeshStandardNodeMaterial | MeshPhysicalNodeMaterial;
/** Animated mesh names of BoatModel and their bucket (static meshes are named `boat-<bucket>`). */
export declare const BOAT_PART_BUCKETS: Readonly<Record<string, BoatBucket>>;
/**
 * The source BoatMaterials as native three.js WebGPU node materials: the same buckets, uniform handles,
 * setNavLights and dispose as `BoatMaterials`, plus the frame uniforms it reads.
 */
export declare class BoatShading {
    #private;
    readonly specs: BoatMaterialSpecs;
    readonly wgsl: BoatShadingWgsl;
    readonly time: N;
    readonly night: N;
    readonly windSpeed: N;
    readonly sunDirection: N;
    readonly sunColor: N;
    readonly skyIrradiance: N;
    readonly navOn: {
        value: number;
    };
    readonly flagPivot: {
        value: Vector3;
    };
    readonly flagDir: {
        value: Vector3;
    };
    readonly flagWind: {
        value: number;
    };
    readonly hull: MeshPhysicalNodeMaterial;
    readonly gelcoat: MeshStandardNodeMaterial;
    readonly wood: MeshStandardNodeMaterial;
    readonly fittings: MeshStandardNodeMaterial;
    readonly glass: MeshPhysicalNodeMaterial;
    readonly glow: MeshStandardNodeMaterial;
    readonly trap: MeshStandardNodeMaterial;
    constructor(hullShape: HullShape, bindings?: BoatShadingBindings, handles?: BoatShadingHandles);
    /** Advances the owned clock (when no `time` binding was given) and takes the wind speed. */
    update(dt: number, wind?: {
        speed: number;
    }): void;
    setNavLights(on: boolean): void;
    /** Puts these materials on a BoatModel's meshes (by bucket), keeping its uniform handles. */
    apply(model: {
        meshes: Record<string, {
            name: string;
            material: unknown;
        }>;
    }): void;
    dispose(): void;
}
/**
 * Shades a BoatModel with native materials: shares its uniform handles (BoatModel.update writes the
 * ensign wind, setNavLights the nav lights) and replaces the stand-ins on its meshes.
 */
export declare function shadeBoatModel(model: {
    lines: HullShape;
    materials: BoatShadingHandles;
    meshes: Record<string, {
        name: string;
        material: unknown;
    }>;
}, bindings?: BoatShadingBindings): BoatShading;
export {};
