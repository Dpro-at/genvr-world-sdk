import { type GeneratedLook, type GeneratedParam, type GeneratedControlGroup } from './3d-models/index.js';
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
export declare function describeGeneratedControls(itemId: string): GeneratedControlInfo | null;
/** Pure descriptor adapter, also reusable by future reviewed package metadata. */
export declare function describeGeneratedLookControls(look: GeneratedLook): GeneratedControlInfo;
/** A null patch resets the override; concrete values are checked here on both UI and server. */
export declare function generatedControlValueError(control: GeneratedControl, value: unknown): string | null;
