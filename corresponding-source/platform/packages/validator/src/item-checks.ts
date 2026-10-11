import type { ModelStats } from './glb.js';

/**
 * Budgets for one item's model (P2-12). Within `phone` the item is fine on phones; above it the
 * item still works on computers but is marked not ready for phones; above `limit` it is refused
 * (it would slow down every place that uses it).
 */
export const ITEM_BUDGET = {
  phone: { triangles: 20_000, textureMB: 16, drawCalls: 16, bones: 80 },
  limit: { triangles: 150_000, textureMB: 96, drawCalls: 64, bones: 256 },
} as const;

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
export const DEVICE_CLASSES: readonly DeviceClass[] = [
  {
    id: 'slow-phone',
    label: 'Slow phones',
    budget: { triangles: 8_000, textureMB: 8, drawCalls: 8, bones: 60 },
  },
  { id: 'fast-phone', label: 'Fast phones', budget: ITEM_BUDGET.phone },
  { id: 'tablet', label: 'Tablets', budget: { triangles: 40_000, textureMB: 32, drawCalls: 24, bones: 120 } },
  {
    id: 'console',
    label: 'Consoles and TVs',
    budget: { triangles: 80_000, textureMB: 64, drawCalls: 48, bones: 200 },
  },
  { id: 'computer', label: 'Computers', budget: ITEM_BUDGET.limit },
];

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
export function deviceFit(stats: Pick<ModelStats, BudgetKey>): DeviceFit[] {
  return DEVICE_CLASSES.map(({ id, label, budget }) => {
    const loads = Object.fromEntries(
      (Object.keys(budget) as BudgetKey[]).map((key) => [
        key,
        Math.round((stats[key] / budget[key]) * 100) / 100,
      ]),
    ) as Record<BudgetKey, number>;
    const heaviest = (Object.keys(loads) as BudgetKey[]).reduce((a, b) => (loads[b] > loads[a] ? b : a));
    return { id, label, ready: loads[heaviest] <= 1, loads, heaviest, budget };
  });
}

/** glTF extensions the engine loads (Draco, Meshopt, and KTX2 decoders are set up). */
const SUPPORTED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'KHR_texture_transform',
  'KHR_lights_punctual',
  'EXT_texture_webp',
  'KHR_texture_basisu',
]);

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

export const BUDGET_LABELS = {
  triangles: 'triangles',
  textureMB: 'MB of textures',
  drawCalls: 'draw calls (mesh parts)',
  bones: 'bones',
} as const;

/**
 * Checks a model against the item budgets and against what the author declared in the manifest.
 * Errors refuse the item; warnings go to the reviewer.
 */
export function checkItemModel(
  stats: ModelStats,
  declared?: { triangles: number; textureMB: number; mobileReady: boolean },
  now: () => Date = () => new Date(),
): ItemChecks {
  const findings: CheckFinding[] = [];
  let mobileReady = true;
  for (const key of Object.keys(BUDGET_LABELS) as Array<keyof typeof BUDGET_LABELS>) {
    const value = stats[key];
    const format = (n: number) => n.toLocaleString('en-US');
    if (value > ITEM_BUDGET.limit[key]) {
      findings.push({
        level: 'error',
        code: `too-many-${key}`,
        message: `${format(value)} ${BUDGET_LABELS[key]}; the most an item may have is ${format(ITEM_BUDGET.limit[key])}.`,
      });
    } else if (value > ITEM_BUDGET.phone[key]) {
      mobileReady = false;
      findings.push({
        level: 'warning',
        code: `heavy-${key}`,
        message: `${format(value)} ${BUDGET_LABELS[key]}; phones handle up to ${format(ITEM_BUDGET.phone[key])} per item.`,
      });
    }
  }
  for (const extension of stats.extensions) {
    if (!SUPPORTED_EXTENSIONS.has(extension) && !extension.startsWith('KHR_materials_'))
      findings.push({
        level: 'warning',
        code: 'unsupported-extension',
        message: `Uses ${extension}, which Genvr does not load yet; parts of the model may look different.`,
      });
  }
  if (stats.triangles === 0)
    findings.push({ level: 'error', code: 'no-triangles', message: 'The model has nothing to draw.' });
  if (declared) {
    if (stats.triangles > declared.triangles * 1.1 + 10)
      findings.push({
        level: 'warning',
        code: 'budget-triangles',
        message: `The manifest says ${declared.triangles.toLocaleString('en-US')} triangles; the model has ${stats.triangles.toLocaleString('en-US')}.`,
      });
    if (stats.textureMB > declared.textureMB * 1.1 + 0.5)
      findings.push({
        level: 'warning',
        code: 'budget-textures',
        message: `The manifest says ${declared.textureMB} MB of textures; the model needs about ${stats.textureMB} MB.`,
      });
    if (declared.mobileReady && !mobileReady)
      findings.push({
        level: 'warning',
        code: 'budget-phones',
        message: 'The manifest says the item is ready for phones, but it is over the phone budget.',
      });
  }
  return {
    stats,
    ok: !findings.some((finding) => finding.level === 'error'),
    mobileReady: mobileReady && !findings.some((finding) => finding.level === 'error'),
    findings,
    checkedAt: now().toISOString(),
  };
}
