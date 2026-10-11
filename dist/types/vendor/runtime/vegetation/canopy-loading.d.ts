/** Serializes one world's lazy canopy preparation against rendering and disposal. */
export declare class CanopyLoading<T extends {
    dispose(): void;
}> {
    private readonly callbacks;
    resource: T | null;
    busy: boolean;
    closed: boolean;
    failed: boolean;
    private pending;
    private readonly waiting;
    constructor(callbacks: {
        load(): Promise<T>;
        reload(id: string): void;
        notify(id: string): void;
        report(error: unknown): void;
    });
    private report;
    request(id: string): void;
    assertCaptureReady(): void;
    /** Stop accepting work immediately; wait for borrowed renderer use before destroying it. */
    close(): Promise<void>;
    settled(): Promise<void>;
}
