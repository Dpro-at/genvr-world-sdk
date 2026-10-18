/** Accept older saved recipes while writing only the current rig identifier. */
export const normalizeCharacterRig = (value: unknown): unknown => value === 'mixamo-52' ? 'genvr-humanoid-52' : value;
