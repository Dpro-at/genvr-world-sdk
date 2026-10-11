// The parts of three.js's meshoptimizer simplifier (MIT) used for LOD levels; three ships no types for it.
declare module 'three/examples/jsm/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    /** Simplified indices and the resulting error (relative to the mesh size). */
    simplify(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      targetIndexCount: number,
      targetError: number,
      flags?: string[],
    ): [Uint32Array, number];
  };
}
