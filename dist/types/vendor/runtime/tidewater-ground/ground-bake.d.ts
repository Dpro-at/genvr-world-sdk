/** Source: Tidewater TerrainBake.js, MIT, pinned 4811ba48d795197de5621985f404e765c0b7c0ef.
 * Normal RGBA8 = nx,nz,rock,AO; splat RGBA8 = sand,path,gully/seagrass,rubble/scarp.
 * Heights must use sea-relative coordinates; source AO skips heights below -25m.
 */
export interface TerrainBakeFields {
    res: number;
    texel: number;
    origin: number;
    heights: Float32Array;
    rock: Float32Array;
    sand: Uint8Array;
    path: Uint8Array;
    gully: Uint8Array;
    seagrass?: Uint8Array;
    rubble?: Uint8Array;
    scarp?: Uint8Array;
    pads?: readonly {
        x: number;
        z: number;
        radius: number;
    }[];
}
export interface TerrainFieldSampler {
    res: number;
    texel: number;
    origin: number;
    heightAt: (x: number, z: number) => number;
    rockAt?: (x: number, z: number) => number;
    /** Mask callbacks use source byte units 0..255 (rock uses 0..1). */
    sandAt?: (x: number, z: number) => number;
    pathAt?: (x: number, z: number) => number;
    gullyAt?: (x: number, z: number) => number;
    seagrassAt?: (x: number, z: number) => number;
    rubbleAt?: (x: number, z: number) => number;
    scarpAt?: (x: number, z: number) => number;
    pads?: TerrainBakeFields['pads'];
}
/** Sample cell centres exactly as source TerrainData; no source island layout is embedded. */
export declare function sampleTerrainFields(input: TerrainFieldSampler): TerrainBakeFields;
export declare function bakeTerrainMaps(terrain: TerrainBakeFields): {
    normal: Uint8Array<ArrayBuffer>;
    splat: Uint8Array<ArrayBuffer>;
    ms: {
        ao: number;
        maps: number;
    };
};
