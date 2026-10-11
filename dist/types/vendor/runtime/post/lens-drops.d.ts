type N = any;
export declare class LensDrops {
    #private;
    readonly wet: any;
    readonly age: any;
    readonly seed: any;
    readonly aspect: any;
    duration: number;
    resize(w: number, h: number): void;
    update(dt: number, underwater: boolean): void;
    node(uv: N, sharp: (uv: N) => N, blurred: (uv: N) => N): N;
    reset(): void;
    dispose(): void;
}
export {};
