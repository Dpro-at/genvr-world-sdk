import type { CommandPayload, ItemInstance } from '@genvr/contracts';
import { describeGeneratedControls, generatedControlValueError, GENERATED_PARAMS_MAX } from '@genvr/core-library';

/**
 * Why an instance's parameters do not fit its item's generated look (decision 130), or null when they do. Only
 * items drawn by a runtime generator are checked: each generator parameter must have the right type and stay
 * inside its limits, and an instance holds at most `GENERATED_PARAMS_MAX` keys in all. Other keys (color,
 * material, zone, ride) are left to their own rules.
 */
export function generatedParamsError(
  itemId: string,
  params: Readonly<Record<string, unknown>>,
): string | null {
  const info = describeGeneratedControls(itemId);
  if (!info) return null;
  const keys = Object.keys(params);
  if (keys.length > GENERATED_PARAMS_MAX)
    return `${itemId} takes at most ${GENERATED_PARAMS_MAX} parameters (got ${keys.length}).`;
  for (const control of info.controls) {
    const value = params[control.key];
    if (value === undefined || value === null) continue;
    const error = generatedControlValueError(control, value);
    if (error) return `${itemId}: ${error}`;
  }
  return null;
}

/**
 * The parameter check of one command before it is applied (decision 130): `place_item` with its `itemParams`, and
 * `set_item_params` merged onto the placed instance. Every other command passes.
 */
export function commandParamsError(
  command: CommandPayload,
  instances: ReadonlyArray<Pick<ItemInstance, 'instanceId' | 'itemId' | 'params'>>,
): string | null {
  if (command.type === 'place_item')
    return generatedParamsError(command.params.itemId, command.params.itemParams ?? {});
  if (command.type !== 'set_item_params') return null;
  const instance = instances.find((i) => i.instanceId === command.params.instanceId);
  if (!instance) return null;
  const merged: Record<string, unknown> = { ...instance.params };
  for (const [key, value] of Object.entries(command.params.params)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return generatedParamsError(instance.itemId, merged);
}
