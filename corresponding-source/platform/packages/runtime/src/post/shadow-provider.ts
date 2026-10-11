/** Tidewater AirHaze hard-shadow query over the live Three CSM targets (standard Z). */
import { TSL, type Camera, type DirectionalLight } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL graph and CSM attachment */
export function hazeShadowProvider(
  sun: DirectionalLight,
  camera: Camera,
): ((position: any) => any) | undefined {
  const csm = (sun.shadow as any).shadowNode;
  const lights: DirectionalLight[] = csm?.lights ?? [];
  if (lights.length !== 3 || lights.some((l) => !l.shadow.map?.depthTexture)) return undefined;
  const N = TSL as any;
  const view = N.uniform(camera.matrixWorldInverse).setGroup(N.renderGroup);
  const maps = lights.map((l) => N.texture(l.shadow.map!.depthTexture));
  const matrices = lights.map((l) => N.uniform(l.shadow.matrix).setGroup(N.renderGroup));
  return (position: any) =>
    N.Fn(() => {
      const visibility = N.float(1).toVar();
      const distance = view.mul(N.vec4(position, 1)).z.negate();
      for (let i = 2; i >= 0; i--) {
        N.If(distance.lessThan([10, 60, 400][i]), () => {
          visibility.assign(1);
          const p = matrices[i].mul(N.vec4(position, 1));
          const q = p.xyz.div(p.w);
          N.If(
            q.x
              .greaterThanEqual(0)
              .and(q.x.lessThanEqual(1))
              .and(q.y.greaterThanEqual(0))
              .and(q.y.lessThanEqual(1))
              .and(q.z.greaterThanEqual(0))
              .and(q.z.lessThanEqual(1)),
            () => {
              const pixel = N.ivec2(
                N.clamp(N.vec2(q.x, q.y.oneMinus()), 0, 0.999999).mul(N.textureSize(maps[i])),
              );
              visibility.assign(
                N.textureLoad(maps[i], pixel).r.greaterThanEqual(q.z.sub(0.00002)).select(1, 0),
              );
            },
          );
        });
      }
      return visibility;
    })();
}
