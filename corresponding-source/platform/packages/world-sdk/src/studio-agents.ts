import { z } from 'zod';
import { AvatarLook, DEFAULT_AVATAR_LOOK } from '@genvr/contracts';
import { findWearable } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';

export const StudioAgent = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  name: z.string().trim().min(1).max(200),
  avatar: z.number().int().min(0).max(7),
}).strict();
export type StudioAgent = z.infer<typeof StudioAgent>;
export const StudioAgents = z.array(StudioAgent).max(200).superRefine((rows, context) => {
  if (new Set(rows.map(row => row.id)).size !== rows.length) context.addIssue({ code: 'custom', message: 'Duplicate agent ID.' });
});
const colors = ['#4263eb', '#2b8a3e', '#d48806', '#8950c6'];
/** Stable host preset IDs use actual Core Library clothing, not a copied mesh. */
export function studioAgentLook(preset: number): AvatarLook {
  if (!Number.isInteger(preset) || preset < 0 || preset > 7) throw new Error('Unknown agent avatar.');
  const wear = [`genvr.core.clothing.${preset < 4 ? 'hoodie' : 'jacket'}`, 'genvr.core.clothing.boots'];
  if (!wear.every(id => findWearable(id))) throw new Error('Agent clothing is unavailable.');
  return AvatarLook.parse({ ...DEFAULT_AVATAR_LOOK, body: 'classic', shirt: colors[preset % 4], wear });
}
const prefix = 'host-agent:';
type AgentRuntime = Pick<GenvrRuntime, 'upsertRemotePlayer' | 'removeRemotePlayer' | 'remotePlayerIds' | 'terrainHeightAt' | 'localPlayer'>;
/** Rendering changes no agent authority and never writes host identities into portable world files. */
export function syncStudioAgents(runtime: AgentRuntime, input: unknown, localLooks: ReadonlyMap<string, AvatarLook> = new Map()): number {
  const rows = StudioAgents.parse(input).sort((a, b) => a.id.localeCompare(b.id));
  const wanted = new Set(rows.map(row => prefix + row.id));
  const placed = rows.map((row, index) => {
    const x = runtime.localPlayer.x + (index % 5 - Math.min(rows.length - 1, 4) / 2) * 2;
    const z = runtime.localPlayer.z + 4 + Math.floor(index / 5) * 2;
    const y = runtime.terrainHeightAt(x, z);
    if (!Number.isFinite(y)) throw new Error('Agent ground is unavailable.');
    return { id: prefix + row.id, state: { name: row.name, x, y, z, yaw: Math.PI, clip: 'Idle', look: JSON.stringify(localLooks.get(row.id) ?? studioAgentLook(row.avatar)) } };
  });
  for (const id of runtime.remotePlayerIds()) if (id.startsWith(prefix) && !wanted.has(id)) runtime.removeRemotePlayer(id);
  for (const row of placed) runtime.upsertRemotePlayer(row.id, row.state);
  return rows.length;
}
