/** External node namespaces are confined to the import compatibility boundary. */
export const LEGACY_BONE_PREFIX = 'mixamorig';
export const canonicalBoneName = (value: string): string => value.replace(/^(?:mixamorig|genvr):?/, '');
