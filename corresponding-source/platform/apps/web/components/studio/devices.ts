/**
 * Device models of the studio emulator (P3-06): screen sizes in CSS pixels (portrait for phones
 * and tablets, as the makers list them), corner radius, and bezel. The emulator runs the real
 * player page at this size, so the preview shows exactly what a player on that device sees.
 */
export type DeviceKind = 'desktop' | 'tablet' | 'phone' | 'tv';
export type Orientation = 'landscape' | 'portrait';

export interface DeviceModel {
  id: string;
  kind: DeviceKind;
  name: string;
  /** Width and height in the device's natural orientation. */
  width: number;
  height: number;
  /** Screen corner radius and frame thickness in CSS pixels. */
  radius: number;
  bezel: number;
}

export const DEVICE_MODELS: readonly DeviceModel[] = [
  { id: 'iphone-15', kind: 'phone', name: 'iPhone 15', width: 393, height: 852, radius: 55, bezel: 12 },
  { id: 'iphone-se', kind: 'phone', name: 'iPhone SE', width: 375, height: 667, radius: 6, bezel: 14 },
  { id: 'pixel-8', kind: 'phone', name: 'Pixel 8', width: 412, height: 915, radius: 48, bezel: 12 },
  { id: 'galaxy-s24', kind: 'phone', name: 'Galaxy S24', width: 360, height: 780, radius: 44, bezel: 10 },
  { id: 'ipad-air', kind: 'tablet', name: 'iPad Air 11"', width: 820, height: 1180, radius: 26, bezel: 20 },
  { id: 'ipad-pro', kind: 'tablet', name: 'iPad Pro 13"', width: 1032, height: 1376, radius: 28, bezel: 20 },
  {
    id: 'galaxy-tab-s9',
    kind: 'tablet',
    name: 'Galaxy Tab S9',
    width: 800,
    height: 1280,
    radius: 22,
    bezel: 18,
  },
  { id: 'tv-1080', kind: 'tv', name: 'TV 1080p', width: 1920, height: 1080, radius: 4, bezel: 14 },
];

/** First model of each kind is the default when the kind is chosen; desktop is the edit view. */
export const defaultModel = (kind: DeviceKind): DeviceModel | null =>
  DEVICE_MODELS.find((model) => model.kind === kind) ?? null;

/** Screen size in the chosen orientation (phones and tablets turn; TVs and laptops do not). */
export function screenSize(model: DeviceModel, orientation: Orientation): [number, number] {
  const turns = model.kind === 'phone' || model.kind === 'tablet';
  const long = Math.max(model.width, model.height);
  const short = Math.min(model.width, model.height);
  if (!turns) return [model.width, model.height];
  return orientation === 'landscape' ? [long, short] : [short, long];
}
