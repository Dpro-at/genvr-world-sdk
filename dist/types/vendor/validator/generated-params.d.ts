import type { CommandPayload, ItemInstance } from '../contracts/index.js';
/**
 * Why an instance's parameters do not fit its item's generated look (decision 130), or null when they do. Only
 * items drawn by a runtime generator are checked: each generator parameter must have the right type and stay
 * inside its limits, and an instance holds at most `GENERATED_PARAMS_MAX` keys in all. Other keys (color,
 * material, zone, ride) are left to their own rules.
 */
export declare function generatedParamsError(itemId: string, params: Readonly<Record<string, unknown>>): string | null;
/**
 * The parameter check of one command before it is applied (decision 130): `place_item` with its `itemParams`, and
 * `set_item_params` merged onto the placed instance. Every other command passes.
 */
export declare function commandParamsError(command: CommandPayload, instances: ReadonlyArray<Pick<ItemInstance, 'instanceId' | 'itemId' | 'params'>>): string | null;
