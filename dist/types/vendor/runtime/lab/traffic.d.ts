import type { LabCar, LabCourse, LabStreet } from '../../contracts/index.js';
/** Street lanes run along x; cars drive toward −x on a loop this long (metres), centred on the crossing. */
export declare const LAB_CAR_LOOP = 80;
export declare const LAB_CAR_SIZE: {
    readonly length: 4.2;
    readonly width: 1.8;
    readonly height: 1.5;
};
/** Walkers' light: red for `red_s` at the start of every cycle, then green (cars stop while walkers have green). */
export declare function walkerGreen(street: LabStreet, t: number): boolean;
export declare function laneCentreZ(street: LabStreet, lane: number): number;
/**
 * Where a car's centre is at time `t` (x along the street). It passes the crossing (x = 0) first at `offset_s`.
 * A car that keeps the rules waits before the crossing while walkers have green.
 */
export declare function carX(street: LabStreet, car: LabCar, t: number): number;
export interface LabCarBox {
    id: string;
    min: [number, number, number];
    max: [number, number, number];
}
export declare function carBoxes(course: LabCourse, t: number): LabCarBox[];
