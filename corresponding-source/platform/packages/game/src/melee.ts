import type { MeleeTool, Pose } from './types.js';

/** Who a strike reaches: inside the arc and within reach plus a latency tolerance, nearest first. */
export function meleeTargets(
  attacker: Pose, tool: MeleeTool, others: Array<{ id: string; x: number; z: number }>, tolerance = 0.5,
): string[] {
  const fx = Math.sin(attacker.yaw);
  const fz = Math.cos(attacker.yaw);
  const halfArc = (tool.arcDeg * Math.PI) / 360;
  return others
    .map((o) => ({ id: o.id, dx: o.x - attacker.x, dz: o.z - attacker.z }))
    .map((o) => ({ ...o, distance: Math.hypot(o.dx, o.dz) }))
    .filter((o) => o.distance <= tool.reach + tolerance)
    .filter((o) => o.distance < 1e-6 || Math.acos(Math.min(1, (o.dx * fx + o.dz * fz) / o.distance)) <= halfArc)
    .sort((a, b) => a.distance - b.distance)
    .map((o) => o.id);
}
