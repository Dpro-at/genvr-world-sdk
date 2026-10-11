import { type Num3 } from './geo-builder.js';
import type { VillageContext } from './context.js';
export interface Footprint {
    x: number;
    z: number;
    r: number;
    kind: string;
}
/** Source Village.js house / hut spec (Village.js 145-178). */
export interface HouseSpec {
    name?: string;
    harbor?: boolean;
    x: number;
    z: number;
    yaw: number;
    w: number;
    d: number;
    stories?: number;
    storyH?: number;
    floorY?: number;
    clearance?: number;
    porch?: {
        depth: number;
        width?: number;
        offset?: number;
        rail?: string;
        stairX?: number;
    } | null;
    annex?: {
        w?: number;
        d?: number;
        x?: number;
        wall?: Num3;
    } | null;
    trim: Num3;
    accent: Num3;
    wall: Num3;
    curtain?: Num3;
    paint?: number;
    weather?: number;
    shutters?: string;
    doorGlass?: boolean;
    litChance?: number;
    porchPaint?: Num3 | null;
    siding?: number;
    foundation?: string;
    plaster?: Num3;
    stoneStyle?: number;
    rimRaw?: boolean;
    roof?: string;
    roofMat?: string;
    pitch?: number;
    ovE?: number;
    ovR?: number;
    roofColor?: Num3;
    thatchAge?: number;
    rust?: number;
    galv?: boolean;
    noVent?: boolean;
    winW?: number;
    winH?: number;
    doorX?: number;
    chimney?: number;
    fewWindows?: boolean;
    closedChance?: number;
    lantern?: boolean;
    porchPitch?: number;
    railNet?: Num3 | null;
    porchBench?: boolean;
    stovepipe?: boolean;
    antenna?: boolean;
    gutter?: boolean;
    buoys?: number;
    tank?: number;
    woodpile?: number;
}
export declare function buildHouse(ctx: VillageContext, s: HouseSpec): {
    floorY: number;
    roofTop: number;
    footprint: Footprint;
};
export interface BoathouseSpec {
    x: number;
    z: number;
    yaw: number;
    w?: number;
    d?: number;
    wall?: Num3;
    paint?: number;
    roofColor?: Num3;
}
export declare function buildBoathouse(ctx: VillageContext, s: BoathouseSpec): {
    footprint: Footprint;
};
export interface PlacedSpec {
    x: number;
    z: number;
    yaw: number;
}
export declare function buildMarketStall(ctx: VillageContext, s: PlacedSpec): {
    footprint: Footprint;
};
export interface ShedSpec {
    name?: string;
    x: number;
    z: number;
    yaw: number;
    w?: number;
    d?: number;
    wall?: Num3;
    paint?: number;
    door?: Num3;
    roof?: Num3;
    galv?: boolean;
}
export declare function buildShed(ctx: Omit<VillageContext, 'lights' | 'inst'>, s: ShedSpec): {
    floorY: number;
    roofTop: number;
    footprint: Footprint;
};
