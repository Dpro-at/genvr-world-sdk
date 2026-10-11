/** Tidewater AirHaze/PostFX equations, MIT, DRG Software Solutions LLC (4811ba48).
 * Standard depth adaptation lives in the GPU pass; these physical quantities are coordinate independent. */
export declare const HAZE: {
    readonly marineSigma: 0.00015;
    readonly marineHeight: 110;
    readonly aerosolSigma: 0.000032;
    readonly aerosolHeight: 1400;
    readonly density: 1.6;
    readonly steps: 16;
    readonly marchDistance: 2500;
    readonly near: 900;
    readonly far: 60000;
};
export declare function layerOpticalDepth(sigma: number, height: number, cameraHeight: number, vertical: number, distance: number): number;
export declare function hazeInScatter(cameraHeight: number, vertical: number, distance: number, density?: number): number;
export declare function hazePhase(cosine: number): number;
export declare function marchHaze(cameraHeight: number, vertical: number, distance: number, jitter: number, visibility: (distance: number) => number, density?: number): [number, number];
export declare function aoDepthWeight(relative: number): number;
export declare function aoMultiBounce(ao: number): number;
export declare function historyAccepts(previousDistance: number, expectedDistance: number): boolean;
