import { TerrainActiveSurface, TerrainFieldDescriptor } from '../contracts/index.js';
import type { SoilName } from '../contracts/index.js';
export type NativeGroundVariant = 'beach-sand' | 'seabed-sand' | 'rock' | 'grass' | 'dirt' | 'seagrass' | 'rubble';
export interface ResolvedTerrainSurface {
    size: number;
    levels: number;
    bindings: {
        variant: NativeGroundVariant;
        soil: SoilName;
        inputs: Record<string, {
            channel: string;
            scale: number;
        }>;
    }[];
}
/** Live native renderer capabilities; generic stored rasters remain unrestricted by this profile. */
export declare function resolveTerrainSurface(descriptor: TerrainFieldDescriptor, surface: TerrainActiveSurface): ResolvedTerrainSurface;
/** Approximate interaction/footstep classification, separate from source visual mask equations. */
export declare function terrainSurfaceSoil(profile: ResolvedTerrainSurface, sample: (channel: string, x: number, z: number) => number | null, height: number, seaLevel: number, x: number, z: number): SoilName;
