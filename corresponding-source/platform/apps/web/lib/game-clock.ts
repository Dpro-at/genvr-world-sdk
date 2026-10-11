/** Seconds left in a phase, from the server's end time and the measured server-minus-client offset. */
export function remaining(endsAt: number, serverOffsetMs: number, clientNow: number): number {
  return Math.max(0, Math.ceil((endsAt - (clientNow + serverOffsetMs)) / 1000));
}

/** Seconds as `m:ss` for the match clock. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
