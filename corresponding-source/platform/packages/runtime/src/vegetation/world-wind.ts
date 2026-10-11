import { TSL, Vector2 } from 'three/webgpu';
import { createDetailTexture } from '../tidewater-ground/detail-texture.js';
import type { VegetationWindProvider } from './wind.js';

/** One source detail texture and gust phase per world, independent of ground material lifetime.
 * Consumers borrow all resources; only this owner advances the phase and disposes the texture. */
export class TidewaterWorldWind implements VegetationWindProvider {
  readonly detail = createDetailTexture();
  readonly gustOffset = TSL.uniform(new Vector2()).setGroup(TSL.renderGroup);
  readonly windDirection;
  readonly windSpeed;
  #disposed = false;

  constructor(nodes?: Pick<VegetationWindProvider, 'windDirection' | 'windSpeed'>) {
    this.windDirection = nodes?.windDirection ?? TSL.uniform(new Vector2(.35, .94).normalize()).setGroup(TSL.renderGroup);
    this.windSpeed = nodes?.windSpeed ?? TSL.uniform(7).setGroup(TSL.renderGroup);
  }

  update(dt: number): void {
    if (this.#disposed) return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid wind time step');
    this.gustOffset.value.addScaledVector(this.windDirection.value, (.7 * this.windSpeed.value + 1.5) * dt);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.detail.dispose();
  }
}
