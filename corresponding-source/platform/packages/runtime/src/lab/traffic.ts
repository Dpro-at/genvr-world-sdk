import type { LabCar, LabCourse, LabStreet } from '@genvr/contracts';

/** Street lanes run along x; cars drive toward −x on a loop this long (metres), centred on the crossing. */
export const LAB_CAR_LOOP = 80;
export const LAB_CAR_SIZE = { length: 4.2, width: 1.8, height: 1.5 } as const;

/** Walkers' light: red for `red_s` at the start of every cycle, then green (cars stop while walkers have green). */
export function walkerGreen(street: LabStreet, t: number): boolean {
  return t % street.light.cycle_s >= street.light.red_s;
}

export function laneCentreZ(street: LabStreet, lane: number): number {
  return street.z + (lane + 0.5) * street.lane_width;
}

/**
 * Where a car's centre is at time `t` (x along the street). It passes the crossing (x = 0) first at `offset_s`.
 * A car that keeps the rules waits before the crossing while walkers have green.
 */
export function carX(street: LabStreet, car: LabCar, t: number): number {
  const half = LAB_CAR_LOOP / 2;
  if (car.speed <= 0) return half;
  const lapT = LAB_CAR_LOOP / car.speed;
  // Unstopped position: x = v * (offset - t), wrapped into the loop.
  const free = (tt: number) => {
    let x = car.speed * (car.offset_s - tt);
    x = ((((x + half) % LAB_CAR_LOOP) + LAB_CAR_LOOP) % LAB_CAR_LOOP) - half;
    return x;
  };
  if (car.runs_red || !street.crossing) return free(t);
  // Delay the car by every green the walkers had while it was waiting at the stop line (2 m before the crossing).
  let delay = 0;
  const stop = LAB_CAR_SIZE.length / 2 + 2;
  for (let step = 0, tt = 0; tt <= t && step < 100000; step++, tt += 1 / 30) {
    const x = free(tt - delay);
    if (x > 0 && x <= stop + 0.2 && walkerGreen(street, tt)) delay += 1 / 30;
  }
  void lapT;
  return free(t - delay);
}

export interface LabCarBox { id: string; min: [number, number, number]; max: [number, number, number] }

export function carBoxes(course: LabCourse, t: number): LabCarBox[] {
  const street = course.street;
  if (!street) return [];
  return course.cars.map((car) => {
    const x = carX(street, car, t), z = laneCentreZ(street, car.lane);
    return { id: car.id, min: [x - LAB_CAR_SIZE.length / 2, 0, z - LAB_CAR_SIZE.width / 2], max: [x + LAB_CAR_SIZE.length / 2, LAB_CAR_SIZE.height, z + LAB_CAR_SIZE.width / 2] };
  });
}
