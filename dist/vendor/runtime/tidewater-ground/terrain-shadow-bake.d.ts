export declare function buildShadowHeights(terrain: {
    res: number;
    heights: Float32Array;
    texel: number;
}, factor?: number): {
    levels: {
        data: Uint16Array<ArrayBuffer>;
        width: number;
        height: number;
    }[];
    texel: number;
    maxHeight: number;
};
