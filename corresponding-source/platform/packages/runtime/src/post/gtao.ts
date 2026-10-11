/** Tidewater GTAO/PostFX, MIT DRG Software Solutions LLC, 4811ba48.
 * The source itself ports Three r186 GTAONode. Use that same kernel with standard Three depth,
 * source half-resolution copy, separable bilateral filter and multibounce composite.
 * distanceExponent=1.4 is retained for parity; both source and Three leave it unused. */
import { StorageTexture, RenderTarget, FloatType, HalfFloatType, RGBAFormat, NearestFilter,
  LinearFilter, Matrix4, NodeMaterial, QuadMesh, RendererUtils, TSL, type Texture, type Camera, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph */
type Node = any;
const {Fn, If, globalId, uvec2, vec4, uniform, texture, textureLoad, textureStore, wgslFn} = TSL as Node;
// ComputeNode array counts are workgroups, not pixel counts. Guard padded odd-size edges.
function computePixels(width: number, height: number, body: () => Node | void): Node {
  return Fn(() => {
    If(globalId.x.lessThan(width).and(globalId.y.lessThan(height)), () => { body(); });
  })().compute([Math.ceil(width / 8), Math.ceil(height / 8)], [8, 8, 1]);
}
export interface GTAOOptions { inputTexture?: Texture; finalDepthTexture?: Texture; }
export class GTAO {
  readonly depth: StorageTexture;
  readonly normals: StorageTexture;
  readonly raw: RenderTarget;
  readonly blurX: StorageTexture;
  readonly texture: StorageTexture;
  readonly colorTexture: StorageTexture;
  readonly strength = uniform(1).setGroup(TSL.renderGroup);
  readonly node: ReturnType<typeof ao>;
  #quad: QuadMesh;
  #inverseProjection = uniform(new Matrix4()).setGroup(TSL.renderGroup);
  #kernels: Node[] = [];
  #width = 1; #height = 1; #disposed = false;
  constructor(readonly depthTexture: Texture, readonly camera: Camera, readonly options: GTAOOptions = {}) {
    const make = (type: typeof FloatType | typeof HalfFloatType) => { const t = new StorageTexture(1, 1); t.type = type; t.format = RGBAFormat;
      t.minFilter = t.magFilter = NearestFilter; return t; };
    // Standard-Z needs float32 near the far plane; reversed-Z source can safely use half float.
    this.depth = make(FloatType); this.normals = make(HalfFloatType); this.blurX = make(HalfFloatType); this.texture = make(HalfFloatType);
    this.colorTexture = make(HalfFloatType); this.colorTexture.minFilter = this.colorTexture.magFilter = LinearFilter;
    this.raw = new RenderTarget(1, 1, {type: HalfFloatType, depthBuffer: false});
    // Native getNormalFromDepth assumes a depth texture's scalar load. Our colour depth copy needs
    // explicit .r loads; supply source-identical reconstructed normals instead of passing vec4 depth.
    this.node = (ao as Node)(texture(this.depth), texture(this.normals), camera);
    this.node.radius.value = 2.2; this.node.thickness.value = 2; this.node.distanceExponent.value = 1.4;
    this.node.scale.value = 1.6; this.node.samples.value = 12; this.node.resolutionScale = 0.5;
    this.node.useTemporalFiltering = true;
    const setSize = this.node.setSize.bind(this.node);
    this.node.setSize = () => setSize(this.#width, this.#height);
    const material = new NodeMaterial(); material.fragmentNode = vec4(this.node.getTextureNode().r, 0, 0, 1);
    this.#quad = new QuadMesh(material);
  }
  resize(width: number, height: number): void {
    if (width === this.#width && height === this.#height && this.#kernels.length) return;
    this.#width = Math.max(1, Math.round(width)); this.#height = Math.max(1, Math.round(height));
    const w = Math.max(1, Math.round(this.#width * 0.5)), h = Math.max(1, Math.round(this.#height * 0.5));
    for (const t of [this.depth, this.normals, this.blurX, this.texture]) t.setSize(w, h, 1);
    this.raw.setSize(w, h); this.colorTexture.setSize(this.#width, this.#height, 1);
    this.node.setSize(this.#width, this.#height);
    this.#kernels.forEach(k => k.dispose()); this.#kernels = [];
    this.#kernels.push(computePixels(w,h,() => textureStore(this.depth, uvec2(globalId.xy),
      vec4(textureLoad(this.depthTexture, globalId.xy.mul(2)).r,
        textureLoad(this.options.finalDepthTexture ?? this.depthTexture,globalId.xy.mul(2)).r,0,1))));
    const position = wgslFn(`fn aoView(uv:vec2f,d:f32,inv:mat4x4f)->vec3f {
      let v=inv*vec4f(uv*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),min(d,.999999),1.0);return v.xyz/v.w;}`);
    const normal = wgslFn(`fn aoNormal(dep:texture_2d<f32>,p:vec2u,inv:mat4x4f)->vec4f {
      let size=vec2i(textureDimensions(dep));let uv=(vec2f(p)+.5)/vec2f(size);let q=vec2i(p);
      let c=textureLoad(dep,q,0).r;
      let l2=textureLoad(dep,clamp(q-vec2i(2,0),vec2i(0),size-1),0).r;let l1=textureLoad(dep,clamp(q-vec2i(1,0),vec2i(0),size-1),0).r;
      let r1=textureLoad(dep,clamp(q+vec2i(1,0),vec2i(0),size-1),0).r;let r2=textureLoad(dep,clamp(q+vec2i(2,0),vec2i(0),size-1),0).r;
      let b2=textureLoad(dep,clamp(q+vec2i(0,2),vec2i(0),size-1),0).r;let b1=textureLoad(dep,clamp(q+vec2i(0,1),vec2i(0),size-1),0).r;
      let t1=textureLoad(dep,clamp(q-vec2i(0,1),vec2i(0),size-1),0).r;let t2=textureLoad(dep,clamp(q-vec2i(0,2),vec2i(0),size-1),0).r;
      let ce=aoView(uv,c,inv);let step=1.0/vec2f(size);
      let dx=select(aoView(uv+vec2f(step.x,0.0),r1,inv)-ce,ce-aoView(uv-vec2f(step.x,0.0),l1,inv),abs(2.0*l1-l2-c)<abs(2.0*r1-r2-c));
      let dy=select(aoView(uv-vec2f(0.0,step.y),t1,inv)-ce,ce-aoView(uv+vec2f(0.0,step.y),b1,inv),abs(2.0*b1-b2-c)<abs(2.0*t1-t2-c));
      let n=cross(dx,dy);return vec4f(n/max(length(n),1e-12),1.0);}`, [position]);
    this.#kernels.push(computePixels(w,h,()=>textureStore(this.normals,uvec2(globalId.xy),normal(texture(this.depth),uvec2(globalId.xy),this.#inverseProjection))));
    const blur = wgslFn(`fn aoBlur(src:texture_2d<f32>,dep:texture_2d<f32>,p:vec2u,axis:vec2i,first:f32)->vec4f {
      let size=vec2i(textureDimensions(src));let center=textureLoad(dep,vec2i(p),0).r;
      var sum=0.0;var weights=0.0;
      for(var i=-2;i<=2;i++){let q=clamp(vec2i(p)+axis*i,vec2i(0),size-1);
        // Use reversed depth magnitude for the source bilateral relative-depth metric.
        let rel=abs(textureLoad(dep,q,0).r-center)/max(1.0-center,1e-7);
        let weight=1.0/pow(rel*40.0+1.0,2.0);let ds=textureLoad(dep,q,0);
        let a=select(textureLoad(src,q,0).r,1.0,first>0.5&&ds.g<ds.r-1e-7);
        sum+=a*weight;weights+=weight;}
      return vec4f(sum/weights,0.0,0.0,1.0);}`);
    for (const [src,dst,axis,first] of [[this.raw.texture,this.blurX,TSL.ivec2(1,0),1], [this.blurX,this.texture,TSL.ivec2(0,1),0]])
      this.#kernels.push(computePixels(w,h,() => textureStore(dst,uvec2(globalId.xy),blur(texture(src),texture(this.depth),uvec2(globalId.xy),axis,first))));
    if (this.options.inputTexture) {
      const composite = wgslFn(`fn aoComposite(color:texture_2d<f32>,d:f32,lastDepth:f32,aot:texture_2d<f32>,dep:texture_2d<f32>,p:vec2u,strength:f32)->vec4f {
        let c=textureLoad(color,vec2i(p),0);
        if(d>=0.9999999||lastDepth<d-1e-7){return c;}
        let uv=(vec2f(p)+0.5)/vec2f(textureDimensions(color));let size=vec2i(textureDimensions(aot));
        let pa=uv*vec2f(size)-0.5;let base=vec2i(floor(pa));let fr=fract(pa);var sum=0.0;var weights=1e-4;
        for(var k=0;k<4;k++){let o=vec2i(k&1,k>>1);let q=clamp(base+o,vec2i(0),size-1);
          let bil=mix(1.0-fr.x,fr.x,f32(o.x))*mix(1.0-fr.y,fr.y,f32(o.y));
          let rel=abs(textureLoad(dep,q,0).r-d)/max(1.0-d,1e-7);let wt=bil/pow(rel*40.0+1.0,2.0)+1e-5;
          sum+=textureLoad(aot,q,0).r*wt;weights+=wt;}
        let a=sum/weights;let mb=max(a,((a*0.382-1.036)*a+1.654)*a);
        let ambient=1.0-smoothstep(0.12,0.9,dot(c.rgb,vec3f(0.2126,0.7152,0.0722)));
        return vec4f(c.rgb*mix(1.0,mb,strength*mix(0.35,1.0,ambient)),c.a);}`);
      this.#kernels.push(computePixels(this.#width,this.#height,() => textureStore(this.colorTexture,uvec2(globalId.xy),composite(
        texture(this.options.inputTexture!),textureLoad(this.depthTexture,globalId.xy).r,textureLoad(this.options.finalDepthTexture ?? this.depthTexture,globalId.xy).r,
        texture(this.texture),texture(this.depth),uvec2(globalId.xy),this.strength))));
    }
  }
  update(renderer: WebGPURenderer, _dt = 0, _camera = this.camera): void {
    void _dt;void _camera;
    if (this.#disposed) return;
    if (!this.#kernels.length) this.resize(this.#width, this.#height);
    this.#inverseProjection.value.copy(this.camera.projectionMatrixInverse);
    renderer.compute(this.#kernels[0]);renderer.compute(this.#kernels[1]);
    const state = RendererUtils.resetRendererState(renderer,{} as Node);
    try { renderer.setRenderTarget(this.raw); this.#quad.render(renderer); }
    finally { RendererUtils.restoreRendererState(renderer,state); }
    for (const kernel of this.#kernels.slice(2)) renderer.compute(kernel);
  }
  dispose(): void { if(this.#disposed)return;this.#disposed=true;
    this.#kernels.forEach(k=>k.dispose());this.node.dispose();this.raw.dispose();(this.#quad.material as NodeMaterial).dispose();
    [this.depth,this.normals,this.blurX,this.texture,this.colorTexture].forEach(t=>t.dispose()); }
}
