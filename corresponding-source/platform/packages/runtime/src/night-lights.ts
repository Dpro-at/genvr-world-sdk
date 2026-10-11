import type { WorldDocument } from '@genvr/contracts';
import { getCoreItem } from '@genvr/core-library';
import {
  Color,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';

/** Lamps that really light the ground: the ones nearest the camera (every light costs every lit surface). */
export const NIGHT_LIGHTS_MAX = 8;
/** Lamps farther than this from the camera only glow. */
const LIGHT_REACH = 140;
/** Night amount (0 day, 1 deep night) from which lamps start to shine. */
const NIGHT_FROM = 0.25;
const GLOW_MAX = 2000;

interface Lamp {
  position: Vector3;
  color: Color;
  range: number;
  size: number;
}

/**
 * Lamp items at night (items whose Core entry has a `light`): every lamp glows, and the nearest
 * `NIGHT_LIGHTS_MAX` light the street around them. By day nothing is shown and the lights are off.
 */
export class NightLights {
  readonly group = new Group();
  readonly #lamps: Lamp[] = [];
  readonly #lights: PointLight[] = [];
  readonly #glow: InstancedMesh;
  readonly #dummy = new Object3D();
  #signature = '';
  #night = 0;

  constructor() {
    this.group.name = 'night-lights';
    this.#glow = new InstancedMesh(
      new SphereGeometry(0.5, 12, 8),
      new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      GLOW_MAX,
    );
    this.#glow.count = 0;
    this.#glow.frustumCulled = false;
    this.#glow.visible = false;
    this.group.add(this.#glow);
  }

  /** Call after the world's items changed. */
  sync(doc: WorldDocument): void {
    const lamps = doc.instances.filter((i) => getCoreItem(i.itemId)?.light);
    const signature = JSON.stringify(lamps.map((i) => [i.itemId, i.transform]));
    if (signature === this.#signature) return;
    this.#signature = signature;
    this.#lamps.length = 0;
    const rotation = new Quaternion();
    for (const instance of lamps.slice(0, GLOW_MAX)) {
      const light = getCoreItem(instance.itemId)!.light!;
      const [sx, sy, sz] = instance.transform.scale;
      rotation.set(...instance.transform.rotation);
      const position = new Vector3(light.at[0] * sx, light.at[1] * sy, light.at[2] * sz)
        .applyQuaternion(rotation)
        .add(new Vector3(...instance.transform.position));
      const size = Math.max(sx, sy, sz);
      this.#lamps.push({ position, color: new Color(light.color), range: light.range * size, size });
    }
    this.#glow.count = this.#lamps.length;
    this.#lamps.forEach((lamp, index) => {
      this.#dummy.position.copy(lamp.position);
      this.#dummy.scale.setScalar(0.7 * lamp.size);
      this.#dummy.updateMatrix();
      this.#glow.setMatrixAt(index, this.#dummy.matrix);
      this.#glow.setColorAt(index, lamp.color);
    });
    this.#glow.instanceMatrix.needsUpdate = true;
    if (this.#glow.instanceColor) this.#glow.instanceColor.needsUpdate = true;
    this.#apply();
  }

  /** Call every frame with the camera position and how much night it is (0 day, 1 deep night). */
  update(eye: Vector3, night: number): void {
    this.#night = night;
    this.#apply(eye);
  }

  #apply(eye?: Vector3): void {
    const strength = Math.min(1, Math.max(0, (this.#night - NIGHT_FROM) / (1 - NIGHT_FROM)));
    const on = strength > 0 && this.#lamps.length > 0;
    this.#glow.visible = on;
    // Lights stay in the scene once made and only dim (a changing light count rebuilds every shader).
    if (!on) {
      for (const light of this.#lights) light.intensity = 0;
      return;
    }
    // The light objects are made once, at the first lit night, so day places never pay for them.
    while (this.#lights.length < Math.min(NIGHT_LIGHTS_MAX, this.#lamps.length)) {
      const light = new PointLight('#ffffff', 0, 1, 2);
      light.castShadow = false;
      this.#lights.push(light);
      this.group.add(light);
    }
    if (!eye) return;
    const nearest = this.#lamps
      .map((lamp) => ({ lamp, distance: lamp.position.distanceToSquared(eye) }))
      .filter(({ distance }) => distance < LIGHT_REACH * LIGHT_REACH)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.#lights.length);
    this.#lights.forEach((light, index) => {
      const pick = nearest[index];
      if (!pick) {
        light.intensity = 0;
        return;
      }
      light.position.copy(pick.lamp.position);
      light.color.copy(pick.lamp.color);
      light.distance = pick.lamp.range;
      light.intensity = 140 * pick.lamp.size * pick.lamp.size * strength;
    });
  }

  dispose(): void {
    this.#glow.geometry.dispose();
    (this.#glow.material as MeshBasicMaterial).dispose();
    this.#glow.dispose();
    for (const light of this.#lights) light.dispose();
  }
}
