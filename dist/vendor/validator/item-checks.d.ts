import type { ModelStats } from './glb.js';
/**
 * Budgets for one item's model (P2-12). Within `phone` the item is fine on phones; above it the
 * item still works on computers but is marked not ready for phones; above `limit` it is refused
 * (it would slow down every place that uses it).
 */
export declare const ITEM_BUDGET: {
    readonly phone: {
        readonly triangles: 20000;
        readonly textureMB: 16;
        readonly drawCalls: 16;
        readonly bones: 80;
    };
    readonly limit: {
        readonly triangles: 150000;
        readonly textureMB: 96;
        readonly drawCalls: 64;
        readonly bones: 256;
    };
};
export type BudgetKey = 'triangles' | 'textureMB' | 'drawCalls' | 'bones';
/** A kind of device and what one item may use on it and stay smooth (decision 82). */
export interface DeviceClass {
    id: 'slow-phone' | 'fast-phone' | 'tablet' | 'console' | 'computer';
    label: string;
    budget: Readonly<Record<BudgetKey, number>>;
}
/**
 * Per-item budgets by device (owner note 2026-09-27): from slow phones to computers. Fast phones
 * use the phone budget and computers the hard limit, so the classes agree with ITEM_BUDGET.
 */
export declare const DEVICE_CLASSES: readonly DeviceClass[];
export interface DeviceFit {
    id: DeviceClass['id'];
    label: string;
    /** Within the budget on every measure. */
    ready: boolean;
    /** Share of the budget each measure uses (1 = exactly at the budget). */
    loads: Record<BudgetKey, number>;
    /** The measure that uses the most of this device's budget. */
    heaviest: BudgetKey;
    budget: Readonly<Record<BudgetKey, number>>;
}
/** How a model fits each kind of device, from slow phones to computers. */
export declare function deviceFit(stats: Pick<ModelStats, BudgetKey>): DeviceFit[];
export interface CheckFinding {
    level: 'error' | 'warning';
    code: string;
    message: string;
}
export interface ItemChecks {
    stats: ModelStats;
    /** Refusing errors (none when the item may be installed). */
    ok: boolean;
    /** Measured by the platform (the author's `budget.mobileReady` is only a claim). */
    mobileReady: boolean;
    findings: CheckFinding[];
    /** When the checks ran (ISO time). */
    checkedAt: string;
}
export declare const BUDGET_LABELS: {
    readonly triangles: "triangles";
    readonly textureMB: "MB of textures";
    readonly drawCalls: "draw calls (mesh parts)";
    readonly bones: "bones";
};
/**
 * Checks a model against the item budgets and against what the author declared in the manifest.
 * Errors refuse the item; warnings go to the reviewer.
 */
export declare function checkItemModel(stats: ModelStats, declared?: {
    triangles: number;
    textureMB: number;
    mobileReady: boolean;
}, now?: () => Date): ItemChecks;
