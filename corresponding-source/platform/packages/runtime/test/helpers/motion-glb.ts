/**
 * A small motion-only GLB made in memory for tests (board M20): a humanoid skeleton with Mixamo-style joint names and a
 * one-second loop whose legs swing. No real motion file is needed or kept in the repository.
 */
const joints: Array<[name: string, parent: string | null, at: [number, number, number]]> = [
  ['Hips', null, [0, 1, 0]], ['Spine', 'Hips', [0, 0.1, 0]], ['Spine1', 'Spine', [0, 0.1, 0]], ['Spine2', 'Spine1', [0, 0.1, 0]], ['Neck', 'Spine2', [0, 0.15, 0]], ['Head', 'Neck', [0, 0.1, 0]],
  ['LeftShoulder', 'Spine2', [0.05, 0.1, 0]], ['LeftArm', 'LeftShoulder', [0.1, 0, 0]], ['LeftForeArm', 'LeftArm', [0.25, 0, 0]], ['LeftHand', 'LeftForeArm', [0.25, 0, 0]],
  ['RightShoulder', 'Spine2', [-0.05, 0.1, 0]], ['RightArm', 'RightShoulder', [-0.1, 0, 0]], ['RightForeArm', 'RightArm', [-0.25, 0, 0]], ['RightHand', 'RightForeArm', [-0.25, 0, 0]],
  ['LeftUpLeg', 'Hips', [0.1, -0.05, 0]], ['LeftLeg', 'LeftUpLeg', [0, -0.42, 0]], ['LeftFoot', 'LeftLeg', [0, -0.42, 0]], ['LeftToeBase', 'LeftFoot', [0, -0.05, 0.12]],
  ['RightUpLeg', 'Hips', [-0.1, -0.05, 0]], ['RightLeg', 'RightUpLeg', [0, -0.42, 0]], ['RightFoot', 'RightLeg', [0, -0.42, 0]], ['RightToeBase', 'RightFoot', [0, -0.05, 0.12]],
];

/** `armRollDeg` turns both upper arms about their own bone axis at rest, as rigs with other bone axes do. */
export function motionGlb(prefix = 'mixamorig:', swingDeg = 20, armRollDeg = 0): ArrayBuffer {
  const times = [0, 0.25, 0.5, 0.75, 1];
  const quat = (deg: number) => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
  const swing = (sign: number) => times.flatMap((t) => quat(sign * swingDeg * Math.sin(2 * Math.PI * t)));
  const floats = [...times, ...swing(1), ...swing(-1)];
  const bin = new Float32Array(floats);
  const index = (name: string) => joints.findIndex(([n]) => n === name);
  const json = {
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: joints.map(([name, , at]) => ({ name: prefix + name, translation: at, ...(armRollDeg && name.endsWith('Arm') && !name.includes('Fore') ? { rotation: quat(armRollDeg) } : {}), children: joints.flatMap(([, parent], i) => (parent === name ? [i] : [])) }))
      .map(({ children, ...node }) => (children.length ? { ...node, children } : node)),
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: times.length * 4 }, { buffer: 0, byteOffset: times.length * 4, byteLength: times.length * 16 }, { buffer: 0, byteOffset: times.length * 20, byteLength: times.length * 16 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: times.length, type: 'VEC4' }, { bufferView: 2, componentType: 5126, count: times.length, type: 'VEC4' }],
    animations: [{ name: 'Swing', samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }, { input: 0, output: 2, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: index('LeftUpLeg'), path: 'rotation' } }, { sampler: 1, target: { node: index('RightUpLeg'), path: 'rotation' } }] }],
  };
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4, binLength = Math.ceil(bin.byteLength / 4) * 4;
  const out = new ArrayBuffer(12 + 8 + jsonLength + 8 + binLength), view = new DataView(out), bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength); bytes.set(text, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(new Uint8Array(bin.buffer), 28 + jsonLength);
  return out;
}
