/** Days from new moon to new moon. */
const SYNODIC_DAYS = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

/** Moon phase from the date (P2-36): 0 new moon, 0.5 full moon; everyone sees the same moon. */
export function moonPhase(nowMs: number): number {
  const days = (nowMs - NEW_MOON_MS) / 86_400_000;
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}
