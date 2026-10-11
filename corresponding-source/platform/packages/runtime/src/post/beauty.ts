/** Existing underwater look retained until the dedicated source underwater port; above-water identity. */
import { TSL, type Texture, type PerspectiveCamera } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL graph */
export function underwaterBeauty(
  input: Texture,
  depth: Texture,
  camera: PerspectiveCamera,
  under: any,
  caustics: Texture | null,
  rays: boolean,
): any {
  const N = TSL as any,
    uv = N.uv();
  const sway = N.vec2(
    N.sin(N.time.mul(1.7).add(uv.y.mul(9))).mul(0.0035),
    N.sin(N.time.mul(2.3).add(uv.x.mul(7))).mul(0.0035 * 0.7),
  ).mul(under);
  let picture = N.texture(input, uv.add(sway)).rgb;
  if (caustics)
    picture = picture.add(
      N.texture(caustics, uv.mul(N.vec2(2.1, 1.4)).add(N.time.mul(0.03)))
        .r.mul(N.texture(caustics, uv.mul(N.vec2(1.5, 1.1)).sub(N.time.mul(0.022))).r)
        .mul(0.22)
        .mul(under),
    );
  if (rays)
    picture = picture.add(
      N.sin(uv.x.mul(18).add(uv.y.mul(6)).sub(N.time.mul(0.6)))
        .mul(0.5)
        .add(0.5)
        .mul(N.float(1).sub(uv.y))
        .mul(0.16)
        .mul(under),
    );
  const distance = N.perspectiveDepthToViewZ(
    N.texture(depth, uv).r,
    N.reference('near', 'float', camera),
    N.reference('far', 'float', camera),
  ).negate();
  return N.vec4(N.mix(picture, N.vec3(0.1, 0.38, 0.42), N.smoothstep(0, 36, distance).mul(under)), 1);
}
