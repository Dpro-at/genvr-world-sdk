/** On-demand scene inventory. No renderer hooks, GPU queries or per-frame work. */
import type { Object3D } from 'three';
export interface DiagnosticOptions {
    instanceId?: string;
}
export interface DiagnosticItem {
    instanceId: string;
    itemId: string;
    name?: string | undefined;
}
export interface DiagnosticResource {
    id: string;
    label: string;
    root: Object3D | null;
    detail?: string;
}
export interface ItemDiagnostic extends DiagnosticItem {
    meshParts: number;
    visibleTriangles: number;
    sharedBatch: boolean;
    status: 'scene-visible' | 'hidden' | 'not represented';
}
export interface ResourceDiagnostic {
    id: string;
    label: string;
    detail?: string;
    status: 'scene-visible' | 'hidden' | 'unavailable';
    objects: number;
    meshes: number;
    visibleMeshes: number;
    visibleTriangles: number;
    geometryBytes: number;
}
export interface RuntimeDiagnostics {
    capturedAt: number;
    scanMs: number;
    backend: string;
    paused: boolean;
    resources: ResourceDiagnostic[];
    items: ItemDiagnostic[];
    geometryBytes: number;
    visitedObjects: number;
    truncated: boolean;
}
export interface DiagnosticInput {
    backend: string;
    paused: boolean;
    resources: readonly DiagnosticResource[];
    items: readonly DiagnosticItem[];
}
/** Hard work/storage caps: incomplete snapshots are explicitly labelled in the UI. */
export declare const DIAGNOSTIC_LIMITS: {
    readonly objects: 8192;
    readonly slots: 16384;
    readonly items: 1000;
    readonly itemLookups: 16384;
    readonly resources: 64;
    readonly scanMs: 12;
};
export declare function inspectResources(input: DiagnosticInput, options?: DiagnosticOptions): RuntimeDiagnostics;
