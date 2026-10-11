/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
/** One fin segment (dorsal / anal): rays, height profile over the segment, rake of the first / last ray, notch. */
export interface FinSegment {
    from: number;
    to: number;
    rays: number;
    spiny: boolean;
    h: number[][];
    rake: number[];
    notch: number;
}
export interface MouthShape {
    corner: number;
    y: number;
    tip: number;
    protrude?: number;
}
export interface EyeSpot {
    u: number;
    y: number;
    r: number;
}
/** Fields every entry has (the skin table reads these). */
export interface SpeciesBase {
    pattern: number;
    body: number;
    mouth: MouthShape;
    eye: EyeSpot;
    opercle: number;
    scales: number;
    scaleVis: number;
    lateral: number;
    arch: number;
    iris: number;
    irid: number;
    metal: number;
}
/** A fish: geometry (FishGeometry.js) and skin. */
export interface FishAnatomy extends SpeciesBase {
    sec: number;
    top: number[][];
    bot: number[][];
    wid: number[][];
    mouth: Required<MouthShape>;
    dorsal: FinSegment[];
    anal: FinSegment[];
    pectoral: {
        u: number;
        y: number;
        len: number;
        base: number;
        rays: number;
        shape: 'rounded' | 'pointed' | 'falcate';
        spread: number;
    };
    pelvic: {
        u: number;
        len: number;
        rays: number;
    };
    caudal: {
        shape: 'forked' | 'lunate' | 'rounded' | 'truncate';
        len: number;
        span: number;
        fork: number;
        rays: number;
    };
    finlets?: {
        from: number;
        to: number;
        dorsal: number;
        ventral: number;
    };
}
/** Rays and the turtle: geometry from CreatureGeometry.js, these entries only feed the skin table. */
export type CreatureAnatomy = SpeciesBase;
export type FishName = 'silverside' | 'chromis' | 'grunt' | 'yellowtail' | 'tang' | 'sergeant' | 'wrasse' | 'parrot' | 'angel' | 'barracuda' | 'redSnapper' | 'grouper' | 'tuna' | 'mahi' | 'mullet' | 'needlefish' | 'jack' | 'tarpon';
export type CreatureName = 'stingray' | 'eagleRay' | 'turtle';
export type SpeciesName = FishName | CreatureName;
export interface SkinColours {
    back: number;
    flank: number;
    belly: number;
    fin: number;
    edge: number;
    rough: number;
}
export declare const PATTERN: {
    readonly silverside: 0;
    readonly chromis: 1;
    readonly grunt: 2;
    readonly yellowtail: 3;
    readonly tang: 4;
    readonly sergeant: 5;
    readonly wrasse: 6;
    readonly parrot: 7;
    readonly angel: 8;
    readonly barracuda: 9;
    readonly redSnapper: 10;
    readonly grouper: 11;
    readonly tuna: 12;
    readonly mahi: 13;
    readonly mullet: 14;
    readonly needlefish: 15;
    readonly jack: 16;
    readonly tarpon: 17;
    readonly stingray: 18;
    readonly eagleRay: 19;
    readonly turtle: 20;
};
export declare const SPECIES: {
    [K in FishName]: FishAnatomy;
} & {
    [K in CreatureName]: CreatureAnatomy;
};
export declare const SKIN: Record<SpeciesName, SkinColours>;
