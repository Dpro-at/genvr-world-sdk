/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type Side } from 'three';
/** What createHull reads from the hull lines. */
export interface HullShape {
    zAft: number;
    length: number;
}
export interface WgslMaterialOptions {
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    color?: number;
    ior?: number;
    transparent?: boolean;
    opacity?: number;
    side?: Side;
    depthWrite?: boolean;
    alphaTest?: number;
    velocityWeight?: number;
    vertexColors: boolean;
    modules: {
        name: string;
        deps: string[];
        code: string;
    }[];
    attributes: Record<string, string>;
    varyings: Record<string, string>;
    vertex: string;
    uniforms?: Record<string, [string, unknown]>;
}
/** One engine material record of the source: factory, options, uniform handles and WGSL snippets. */
export interface WgslMaterialSpec {
    kind: 'standard' | 'physical';
    options: WgslMaterialOptions;
    uniforms: Record<string, {
        value: unknown;
    }>;
    name: string;
    surface: string;
    vertex?: string;
    output?: string;
}
export declare const BOAT_WGSL_MODULE = "\nfn boatIsPattern( auxZ: f32, id: f32 ) -> f32 { return step( abs( auxZ - id ), 0.5 ); }\nfn boatHash21( p: vec2f ) -> f32 { return fract( sin( dot( p, vec2f( 127.1, 311.7 ) ) ) * 43758.5453 ); }\n// a < b always (WGSL requires ordered edges)\nfn boatLstep( a: f32, b: f32, x: f32 ) -> f32 { return smoothstep( a, b, x ); }\nfn boatInvstep( a: f32, b: f32, x: f32 ) -> f32 { return 1.0 - smoothstep( a, b, x ); }\n\n// Mikkelsen surface-gradient bump mapping from a procedural height in meters.\n// (TSL worked in view space with faceDirection; here P / N are world space and N already faces\n// the viewer on double-sided materials, so faceDirection is folded into N.)\nfn boatBumpNormal( P: vec3f, N: vec3f, height: f32 ) -> vec3f {\n\tlet dPdx = dpdx( P );\n\tlet dPdy = dpdy( P );\n\tlet n = N;\n\tlet r1 = cross( dPdy, n );\n\tlet r2 = cross( n, dPdx );\n\tlet det = dot( dPdx, r1 );\n\tlet grad = sign( det ) * ( dpdx( height ) * r1 + dpdy( height ) * r2 );\n\treturn normalize( abs( det ) * n - grad + n * 1e-12 );\n}\n\n// Molded non-skid: jittered pebbles on a ~1.8 cm lattice (uv in meters), faded when sub-pixel.\nfn boatNonSkidHeight( uv: vec2f ) -> f32 {\n\tlet q = uv * 55.0;\n\tlet c = floor( q );\n\tlet f = fract( q ) - 0.5;\n\tlet j = ( vec2f( boatHash21( c ), boatHash21( c + 17.31 ) ) - 0.5 ) * 0.3;\n\tlet d = length( f - j );\n\tlet pebble = boatInvstep( 0.16, 0.36, d );\n\tlet fade = boatInvstep( 0.3, 0.8, fwidth( q.x ) );\n\treturn pebble * fade;\n}\n";
export declare const AUX_VERTEX = "\n\to.vAux = v.aux;\n\to.vLocal = v.position;\n";
export declare function wgslColor(hex: number): string;
export declare function wgslFloat(x: number): string;
export declare class BoatMaterialSpecs {
    hull: WgslMaterialSpec;
    gelcoat: WgslMaterialSpec;
    wood: WgslMaterialSpec;
    fittings: WgslMaterialSpec;
    glass: WgslMaterialSpec;
    glow: WgslMaterialSpec;
    trap: WgslMaterialSpec;
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
    constructor(hullShape: HullShape);
    createHull(shape: HullShape): WgslMaterialSpec;
    createGelcoat(): WgslMaterialSpec;
    createWood(): WgslMaterialSpec;
    createFittings(): WgslMaterialSpec;
    createGlass(): WgslMaterialSpec;
    createGlow(): WgslMaterialSpec;
    createTrap(): WgslMaterialSpec;
    setNavLights(on: boolean): void;
}
export declare const BOAT_BUCKETS: readonly ["hull", "gelcoat", "wood", "fittings", "glass", "glow", "trap"];
export type BoatBucket = typeof BOAT_BUCKETS[number];
export declare function boatMaterialSpecs(hullShape: HullShape): BoatMaterialSpecs;
type StandIn = MeshStandardMaterial | MeshPhysicalMaterial;
/** The source BoatMaterials surface (buckets, uniform handles, setNavLights, dispose) over three.js stand-ins. */
export declare class BoatMaterials {
    specs: BoatMaterialSpecs;
    hull: StandIn;
    gelcoat: StandIn;
    wood: StandIn;
    fittings: StandIn;
    glass: StandIn;
    glow: StandIn;
    trap: StandIn;
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
    constructor(hullShape: HullShape);
    setNavLights(on: boolean): void;
    dispose(): void;
}
export {};
