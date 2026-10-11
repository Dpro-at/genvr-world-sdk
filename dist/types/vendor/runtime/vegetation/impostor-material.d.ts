/** Tidewater4811ba48 Impostors.js createMaterial, MIT; LICENSE-tidewater.md. */
import { MeshPhysicalNodeMaterial, type DirectionalLight } from 'three/webgpu';
import { type VegetationWindProvider } from './wind.js';
import type { ImpostorAtlas } from './impostor-atlas.js';
type N = any;
export declare const IMPOSTOR_VERTEX_WGSL = "fn twImpostorVertex(p:vec3f,iPos:vec4f,iDat:vec4f,group0:vec4f,group1:vec4f,variantCounts:vec2f,nearRange:vec2f,farDistance:f32,mainCamera:vec3f,camera:vec3f,time:f32,strength:f32,gust:f32,windDirection:vec3f)->mat4x4f{\n\t\n\t\n\n\tlet g1Flag = iDat.y < 0.0;\n\tlet R = select( group0.x, group1.x, g1Flag );\n\tlet Rh = select( group0.y, group1.y, g1Flag );\n\tlet Hv = select( group0.z, group1.z, g1Flag );\n\tlet Cy = select( group0.w, group1.w, g1Flag );\n\tlet vBase = select( 0.0, variantCounts.x, g1Flag );\n\tlet base = iPos.xyz;\n\tlet sy = abs( iDat.y );\n\t// LOD window: from the near plant's hand-over distance to the fade-out, else collapsed\n\tlet d = length( mainCamera - base );\n\tlet vis = select( 0.0, 1.0, d >= ( select(nearRange.x,nearRange.y,g1Flag) ) * ( 1.0 - IMP_VERTEX_LOD_BAND / 2.0 ) && d < select( farDistance, 180.0, g1Flag ) );\n\t// far away the forest is thinned out: fewer, proportionally larger crowns (grown about\n\t// the base) keep the canopy closed\n\tlet thin = smoothstep( 140.0, 320.0, d );\n\tlet keep = select( 1.0, 0.0, fract( iDat.w * 91.7 ) < thin * 0.5 );\n\tlet grow = thin * 0.4142135623730949 + 1.0;\n\tlet s = iPos.w * grow;\n\tlet C = base + vec3f( 0.0, Cy * s * sy, 0.0 );\n\t// sway of the whole crown (matches the near plants' trunk sway amplitude)\n\tlet w = strength;\n\tlet g = gust;\n\tlet ph0 = iDat.w * 6.2832;\n\tlet sway = ( w * w * 0.009 * ( g * 0.8 + 0.3 ) + sin( time * 0.9 + ph0 ) * w * 0.0045 * ( g + 0.4 ) ) * iDat.z * 0.45;\n\tlet swayV = windDirection * sway;\n\tlet Cs = C + swayV;\n\tlet imp = vec4f( swayV, s );\n\t\n\t\n\tlet toCam = normalize( camera - Cs );\n\tlet right = normalize( cross( IMP_VERTEX_UP, toCam ) + vec3f( 1e-4, 0.0, 0.0 ) );\n\tlet up = cross( toCam, right );\n\t// quad fitted to the plant's projected extent: its horizontal radius across, from above\n\t// the crown disc, from the side the (stretched) height\n\tlet k = s * vis * keep;\n\tlet ty = abs( toCam.y );\n\tlet halfW = Rh * k;\n\tlet halfH = ( Hv * sy * sqrt( max( 1.0 - ty * ty, 0.0 ) ) + Rh * ty ) * k;\n\t\n\t\n\tlet pos = Cs + right * ( p.x * halfW ) + up * ( p.y * halfH );\n\t// (three: the geometry normal is left as is, +Z of the quad)\n\treturn mat4x4f(vec4f(pos,1),imp,vec4f(0),vec4f(0));}\nconst IMP_VERTEX_UP=vec3f(0,1,0);const IMP_VERTEX_LOD_BAND=0.12;";
export declare const IMPOSTOR_SHADE_WGSL: string;
export interface ImpostorMaterialBindings {
    atlas: Pick<ImpostorAtlas, 'groups' | 'rtA' | 'rtB' | 'variantCount'>;
    wind: VegetationWindProvider;
    time: N;
    mainCamera: N;
    nearRange: N;
    farDistance: N;
    frame: N;
    sun: DirectionalLight;
    sunDirection: N;
    night: N;
    /** Raw quad inputs; never apply ordinary item's instanceMatrix to the source billboard. */
    quad?: {
        position: N;
        normal: N;
    };
}
/** Source world-space iPos/iDat attributes on the source quad. Keep object transform identity.
 * Atlas, wind, camera, sun and clock are borrowed; caller disposes only the returned material. */
export declare function createImpostorMaterial(b: ImpostorMaterialBindings): MeshPhysicalNodeMaterial;
export {};
