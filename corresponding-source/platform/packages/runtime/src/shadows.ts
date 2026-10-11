import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import type { DirectionalLight, Scene } from 'three/webgpu';
import { TidewaterShadowNode } from './tidewater-sky/shadows.js';
import type { RealisticQuality } from './realistic-quality.js';

/** The single shadow map of styles lit by a hemisphere light: 40 m around the player. */
const PLAIN = { cascades: 1, mapSize: 2048, far: 40 } as const;

/** Shadow layout for a quality (null: the plain single map). */
export function shadowSetup(quality: RealisticQuality | null): {
  cascades: number;
  mapSize: number;
  far: number;
} {
  if (!quality) return { ...PLAIN };
  if (quality.worldLook === 'tidewater') return { cascades: 3, mapSize: 2048, far: 400 };
  return { cascades: quality.cascades, mapSize: quality.shadowMapSize, far: quality.shadowFar };
}

/**
 * The sun's shadows (P2-36): one map around the player, or cascaded shadows for the realistic
 * sky: sharp near the camera, reaching hundreds of meters (far hills and trees cast shadows).
 */
export class SunShadows {
  #csm: CSMShadowNode | null = null;
  #key = '';

  constructor(
    private readonly sun: DirectionalLight,
    private readonly scene?: Scene,
  ) {}

  apply(quality: RealisticQuality | null): void {
    const setup = shadowSetup(quality);
    const key = `${quality?.worldLook}/${setup.cascades}/${setup.mapSize}/${setup.far}`;
    if (key === this.#key) return;
    this.#key = key;
    // AnalyticLightNode listens to light disposal to release its cached shadow graph.
    // Keep the light identity, then rebuild receiver pipelines against the new configuration.
    this.sun.dispose();
    this.scene?.traverse((object) => {
      const material = (
        object as unknown as {
          material?: import('three/webgpu').Material | import('three/webgpu').Material[];
        }
      ).material;
      for (const entry of material ? (Array.isArray(material) ? material : [material]) : []) {
        entry.dispose();
        entry.needsUpdate = true;
      }
    });
    const shadow = this.sun.shadow;
    this.#csm?.dispose();
    this.#csm = null;
    shadow.mapSize.set(setup.mapSize, setup.mapSize);
    shadow.map?.dispose();
    shadow.map = null;
    if (setup.cascades > 1) {
      this.#csm =
        quality?.worldLook === 'tidewater'
          ? new TidewaterShadowNode(this.sun)
          : new CSMShadowNode(this.sun, {
              cascades: setup.cascades,
              maxFar: setup.far,
              mode: 'practical',
              lightMargin: 100,
            });
      this.#csm.fade = true;
      shadow.shadowNode = this.#csm;
    } else {
      // No custom node: the plain shadow map. It must be undefined, not null: three.js multiplies
      // the light colour by any other value, and a null one compiled to the WGSL "nodeUniform *
      // null", so no lit material could be drawn (P11).
      delete (shadow as { shadowNode?: unknown }).shadowNode;
      Object.assign(shadow.camera, {
        left: -setup.far,
        right: setup.far,
        top: setup.far,
        bottom: -setup.far,
        near: 1,
        far: 300,
      });
      shadow.camera.updateProjectionMatrix();
    }
    shadow.needsUpdate = true;
  }

  dispose(): void {
    this.#csm?.dispose();
    this.#csm = null;
  }
}
