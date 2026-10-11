import { anyGeneratedLook, getCoreItem, type GeneratedLook, type GeneratedParam, type GeneratedControlGroup } from './3d-models/index.js';

/** Discoverable controls for existing generated Core looks. No global settings or creator-package schema. */
export interface GeneratedControl {
  key: string;
  label: string;
  description: string;
  group: GeneratedControlGroup;
  unit?: string;
  type: 'number' | 'string' | 'boolean';
  default: GeneratedParam;
  min?: number;
  max?: number;
  values?: readonly string[];
}
export interface GeneratedControlInfo {
  generator: string;
  source: GeneratedLook['generated']['source'];
  controls: readonly GeneratedControl[];
}
/** Uses the same author defaults/limits as runtime generation and server validation. */
export function describeGeneratedControls(itemId: string): GeneratedControlInfo | null {
  const item = getCoreItem(itemId), look = item ? anyGeneratedLook(item) : null;
  if (!look) return null;
  return describeGeneratedLookControls(look);
}
/** Pure descriptor adapter, also reusable by future reviewed package metadata. */
export function describeGeneratedLookControls(look: GeneratedLook): GeneratedControlInfo {
  const { generator, source, params, limits, controls: metadata } = look.generated;
  return { generator, source, controls: Object.entries(params).map(([key, value]) => {
    const limit = limits[key] ?? {};
    const docs = metadata?.[key];
    const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
    const range = typeof value === 'number' ? ` Allowed range: ${limit.min ?? 'unbounded'} to ${limit.max ?? 'unbounded'}.`
      : limit.values ? ` Choices: ${limit.values.join(', ')}.` : '';
    return { key, label: docs?.label ?? label.charAt(0).toUpperCase() + label.slice(1), type: typeof value as GeneratedControl['type'],
      default: value, group: docs?.group ?? 'general',
      description: `${docs?.help ?? `Generator setting ${key}.`} Default: ${String(value)}.${range}`,
      ...(docs?.unit ? { unit: docs.unit } : {}),
      ...(limit.min !== undefined ? { min: limit.min } : {}),
      ...(limit.max !== undefined ? { max: limit.max } : {}),
      ...(limit.values ? { values: [...limit.values] } : {}) };
  }) };
}
/** A null patch resets the override; concrete values are checked here on both UI and server. */
export function generatedControlValueError(control: GeneratedControl, value: unknown): string | null {
  if (typeof value !== control.type) return `${control.key} must be a ${control.type}.`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `${control.key} must be a finite number.`;
    if ((control.min !== undefined && value < control.min) || (control.max !== undefined && value > control.max))
      return `${control.key} must be from ${control.min ?? '-inf'} to ${control.max ?? 'inf'} (got ${value}).`;
  }
  if (typeof value === 'string' && control.values && !control.values.includes(value))
    return `${control.key} must be one of ${control.values.join(', ')} (got ${value}).`;
  return null;
}
