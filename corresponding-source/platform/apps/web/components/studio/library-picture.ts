import { itemGeneratedLook, itemModelLook, type CoreItem } from '@genvr/core-library';
import type { Style } from '@genvr/contracts';

/** Empty generated pictures retain the existing engine preview; respect the selected style. */
export function coreLibraryPicture(item: CoreItem | undefined, style: Style): string | null {
  if (!item) return null;
  return (
    itemModelLook(item, style)?.model.picture || itemGeneratedLook(item, style)?.generated.picture || null
  );
}
