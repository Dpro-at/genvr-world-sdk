/** Fullscreen adapter: the source shaders own output transfer and tone mapping. */
import {
  RenderPipeline,
  RenderTarget,
  HalfFloatType,
  LinearFilter,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL shader graph */
export class PostPass {
  readonly target: RenderTarget;
  readonly pipeline: RenderPipeline;
  constructor(
    readonly renderer: WebGPURenderer,
    node: any,
    name: string,
    width = 1,
    height = 1,
  ) {
    this.target = new RenderTarget(width, height, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    this.target.texture.name = name;
    this.pipeline = new RenderPipeline(renderer, node);
    this.pipeline.outputColorTransform = false;
  }
  get texture(): Texture {
    return this.target.texture;
  }
  resize(width: number, height: number): void {
    this.target.setSize(Math.max(1, width), Math.max(1, height));
  }
  update(): void {
    const target = this.renderer.getRenderTarget(),
      mrt = this.renderer.getMRT();
    try {
      this.renderer.setMRT(null);
      this.renderer.setRenderTarget(this.target);
      this.pipeline.render();
    } finally {
      this.renderer.setRenderTarget(target);
      this.renderer.setMRT(mrt);
    }
  }
  dispose(): void {
    this.pipeline.dispose();
    this.target.dispose();
  }
}
