/**
 * The Genvr logo symbol (docs/BRAND.md, owner N-081): the Dpro square symbol, the diamond of orange, purple and
 * lavender blocks with the white centre, next to the name GENVR. Brand colours are allowed for the logo (decision 67).
 * The picture comes from the Dpro logo kit (`dpro-icon-color.png`, trimmed to 128 px in public/brand).
 */
export function GenvrMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a 128 px brand picture; no image optimisation needed
  return <img src="/brand/dpro-symbol-128.png" alt="" aria-hidden width={128} height={128} className={className} />;
}
