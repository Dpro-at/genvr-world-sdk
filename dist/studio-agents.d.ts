import { z } from 'zod';
import { AvatarLook } from '@genvr/contracts';
import type { GenvrRuntime } from '@genvr/runtime';
export declare const StudioAgent: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    avatar: z.ZodNumber;
}, z.core.$strict>;
export type StudioAgent = z.infer<typeof StudioAgent>;
export declare const StudioAgents: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    avatar: z.ZodNumber;
}, z.core.$strict>>;
/** Stable host preset IDs use actual Core Library clothing, not a copied mesh. */
export declare function studioAgentLook(preset: number): AvatarLook;
type AgentRuntime = Pick<GenvrRuntime, 'upsertRemotePlayer' | 'removeRemotePlayer' | 'remotePlayerIds' | 'terrainHeightAt' | 'localPlayer'>;
/** Rendering changes no agent authority and never writes host identities into portable world files. */
export declare function syncStudioAgents(runtime: AgentRuntime, input: unknown, localLooks?: ReadonlyMap<string, AvatarLook>): number;
export {};
