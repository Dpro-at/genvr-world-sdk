/** Tidewater ShoreSim.js and App.terrainWetness, MIT DRG Software Solutions LLC,4811ba48.
 * Persistent bridge: the stable read texture survives sea renderer recreation. Unavailable uses
 * exact App static band; history resets on invalidation rather than synthesising recent waves.
 */
import { StorageTexture, type Texture, type WebGPURenderer } from 'three/webgpu';
type Node = any;
export declare const SHORE_SIM_STEP_WGSL = "fn wetStep(stateTex:texture_2d<f32>,uv:vec2f,here:vec4f,sw:mat4x4f,region:vec4f,depth:f32,dt:f32,mott:f32,drops:f32)->vec4f {\n let cov=select(clamp((sw[0].z-sw[0].w)/(region.z/region.w)+0.5,0.0,1.0),1.0,depth>0.03);\n let covered=cov>0.5;let vel=select(vec2f(0.0),sw[1].xy,covered);\n let back=uv-vel*dt/region.z;let prev=wetStateAt(stateTex,back);\n\t// foam: made where the bore roller / plunge point / swash front pass, torn into patches by\n\t// the mottling of the lace texture, then it decays (bubbles rising and popping) and drains\n\t// into the sand once the water has gone\n\t// mott is exact source lace mip2 supplied by caller.\n\tlet patchK = smoothstep( 0.25, 0.75, mott ) * 0.8 + 0.35;\n\tlet swashy = smoothstep( 0.35, 0.05, depth );\n\t// dense foam collapses within a second or two (big bubbles burst first), the lace it leaves lingers\n\tlet lace = mix( 2.6, 4.5, swashy );\n\tlet life = mix( 0.7, mix( lace, 0.8, smoothstep( 0.3, 0.8, prev.x ) ), cov );\n\tlet gen = ( sw[0].x * 2.2 + sw[0].y * 1.4 ) * patchK * cov;\n\t// the foam is diluted where the flow spreads it out (the uprush thinning as it climbs, the\n\t// backwash draining): d(foam)/dt = - foam * du/ds along the flow\n\tlet h = region.z / region.w;\n\tlet dirH = sw[1].zw * ( h / region.z );\n\tlet uAhead = wetStateAt(stateTex,uv+dirH).w;\n\tlet uBehind = wetStateAt(stateTex,uv-dirH).w;\n\tlet spreadRate = max( ( uAhead - uBehind ) / ( 2.0 * h ), 0.0 );\n\tlet splash = drops * 0.02 * cov;\n\tlet foam = min( prev.x * exp( - dt * ( 1.0 / life + spreadRate ) ) + gen * 1.0 * dt + splash, 1.0 );\n\n\t// wetness: saturated while covered, then dries\n\tlet wet = max( here.y * exp( - dt / 28.0 ), cov );\n\n\t// residue: foam stranded on the sand when the water leaves (the draining film gathers its\n\t// bubbles into lines, so it concentrates); washed away by the next uprush\n\tlet stranded = min( here.x * 2.4, 1.0 ) * ( 1.0 - cov );\n\tlet residue = max( here.z * mix( exp( - dt / 5.0 ), 0.85, cov ), stranded );\n\n return vec4f(foam,wet,residue,dot(vel,sw[1].zw));\n}\nfn wetStateAt(tex:texture_2d<f32>,uv:vec2f)->vec4f {\n let res=vec2f(textureDimensions(tex));let fp=clamp(uv*res-0.5,vec2f(0.0),res-1.001);let i=vec2i(floor(fp));let t=fract(fp);\n return mix(mix(textureLoad(tex,i,0),textureLoad(tex,i+vec2i(1,0),0),t.x),mix(textureLoad(tex,i+vec2i(0,1),0),textureLoad(tex,i+vec2i(1,1),0),t.x),t.y);\n}\n";
export declare const GROUND_WETNESS_WGSL = "fn wetSample(tex:texture_2d<f32>,lace:texture_2d<f32>,xz:vec2f,h:f32,region:vec4f,available:f32)->vec2f {\n let uv=(xz-region.xy)/region.z;\n let inside=smoothstep(0.0,0.02,uv.x)*smoothstep(1.0,0.98,uv.x)*smoothstep(0.0,0.02,uv.y)*smoothstep(1.0,0.98,uv.y)*available;\n var s=vec4f(0.0);if(uv.x>0.0&&uv.x<1.0&&uv.y>0.0&&uv.y<1.0){s=wetSampleAt(tex,uv)*inside;}\n let band=smoothstep(0.45,0.0,h);\n let fp=length(fwidth(xz))/3.5*512.0;var foam=0.0;\n if(s.z>0.01){let r=s.z;let q=(xz+11.3)/3.5*512.0-0.5;let i=vec2i(floor(q));let t=fract(q);let m=vec2i(511);\n let a=textureLoad(lace,i&m,0);let b=textureLoad(lace,(i+vec2i(1,0))&m,0);let c=textureLoad(lace,(i+vec2i(0,1))&m,0);let d=textureLoad(lace,(i+vec2i(1,1))&m,0);\n let l=mix(mix(a,b,t.x),mix(c,d,t.x),t.y);let near=smoothstep(3.0,1.2,fp);let keep=smoothstep(l.w*0.55,l.w*0.55+0.08,r);\n let lw=r*0.1+0.06;let strand=(1.0-smoothstep(lw,lw+0.07,l.x))*(l.z*0.5+0.6);\n let lines=max(strand*smoothstep(0.02,0.25,r)*keep,l.y*keep*0.8);foam=mix(smoothstep(0.08,0.6,r)*0.12,lines,near)*0.85;}\n return vec2f(max(s.y,band*(1.0-inside)),foam);\n}\nfn wetSampleAt(tex:texture_2d<f32>,uv:vec2f)->vec4f {\n let res=vec2f(textureDimensions(tex));let fp=clamp(uv*res-0.5,vec2f(0.0),res-1.001);let i=vec2i(floor(fp));let t=fract(fp);\n return mix(mix(textureLoad(tex,i,0),textureLoad(tex,i+vec2i(1,0),0),t.x),mix(textureLoad(tex,i+vec2i(0,1),0),textureLoad(tex,i+vec2i(1,1),0),t.x),t.y);\n}\n";
export interface GroundWetnessInputs {
    fieldTexture: Texture;
    depthTexture: Texture;
    extent: number;
    level: number;
    time: number;
    period: number;
    amplitude: number;
    enabled: number;
    swellDirection: readonly [number, number] | null;
}
export declare class GroundWetness {
    #private;
    readonly resolution: number;
    readonly availableNode: any;
    readonly swellDirectionNode: any;
    readonly region: any;
    readonly state: StorageTexture;
    constructor(resolution?: number);
    wetFoamNode(xz: Node, heightSeaRelative: Node): Node;
    /** Current source simulation has no spray emitter in Genvr: deposit is explicitly zero. */
    update(renderer: WebGPURenderer, dt: number, input: GroundWetnessInputs): void;
    invalidate(): void;
    deactivate(): void;
    dispose(): void;
}
export {};
