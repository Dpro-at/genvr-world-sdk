import { z } from 'zod';

/**
 * Board M18 · training stations: the base lab has a place to train every kind of move. A station stands in the course
 * like an obstacle (same `id`, `z` along the course, `x` sideways) and turns by `turn` degrees. Sizes are metres and
 * follow the board. Props are the objects on a station (grasp objects, tools, training weapons); weapons are foam or
 * wood training props only (Q-LAB-18a). The hit dummy stays the fight station (M7).
 */
const stationId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Use a short id: lower-case letters, digits and dashes.');
const metres = (min: number, max: number) => z.number().min(min).max(max);
const place = { id: stationId, z: metres(0, 80), x: metres(-60, 60).default(0), turn: z.number().min(0).max(359).default(0), hidden: z.boolean().default(false) };

export const LabJumpPit = z.object({ ...place, kind: z.literal('jump_pit'), runway_length: metres(10, 30).default(20), runway_width: metres(0.8, 2).default(1.2),
  /** The take-off board (0.2 m deep) ends this far before the sand. */
  board_gap: metres(1, 3).default(2), sand_length: metres(4, 10).default(8), sand_width: metres(2, 4).default(3), sand_depth: metres(0.2, 0.6).default(0.4) }).strict();
export const LabHighBar = z.object({ ...place, kind: z.literal('high_bar'), width: metres(2, 6).default(4), height: metres(0.8, 2).default(1.2),
  mat: z.tuple([metres(2, 8), metres(1, 5), metres(0.2, 1)]).default([5, 3, 0.5]) }).strict();
export const LabHurdles = z.object({ ...place, kind: z.literal('hurdles'), lane_length: metres(10, 40).default(30), lane_width: metres(0.8, 2).default(1.2),
  count: z.number().int().min(1).max(10).default(4), height: metres(0.5, 1).default(0.76), spacing: metres(3, 10).default(6.5) }).strict();
export const LabPoolZone = z.object({ from_m: metres(0, 25), depth_m: metres(0.5, 3) }).strict();
export const LabPool = z.object({ ...place, kind: z.literal('pool'), length: metres(6, 25).default(12.5), width: metres(3, 12).default(6),
  /** Depth from `from_m` (along the pool) to the next zone: shallow end first. */
  zones: z.array(LabPoolZone).min(1).max(4).default([{ from_m: 0, depth_m: 1 }, { from_m: 4, depth_m: 1.4 }, { from_m: 8, depth_m: 2 }]),
  steps: z.boolean().default(true), ladder: z.boolean().default(true), edge_friction: z.number().min(0.05).max(1).default(0.4) }).strict();
export const LabClimbWall = z.object({ ...place, kind: z.literal('climb_wall'), width: metres(2, 8).default(5), height: metres(2, 8).default(5),
  hold_spacing: metres(0.3, 0.5).default(0.4), mat: z.tuple([metres(2, 8), metres(1, 4)]).default([5, 2.4]) }).strict();
export const LabLadder = z.object({ ...place, kind: z.literal('ladder'), height: metres(1, 6).default(3), rung_spacing: metres(0.25, 0.4).default(0.3) }).strict();
export const LabGraspTable = z.object({ ...place, kind: z.literal('grasp_table'), width: metres(1, 3).default(2), depth: metres(0.5, 1.5).default(0.9),
  height: metres(0.6, 1.1).default(0.75),
  /** Table, belt and bench heights follow the character's hip height, so short and tall bodies train at the same reach. */
  fit_to_character: z.boolean().default(true) }).strict();
export const LabConveyor = z.object({ ...place, kind: z.literal('conveyor'), length: metres(2, 10).default(6), width: metres(0.4, 1).default(0.6),
  height: metres(0.6, 1.1).default(0.85), speed_mps: metres(0.1, 1).default(0.3), every_s: metres(1, 5).default(3), mix: z.boolean().default(true),
  bin: z.boolean().default(true), stand_mark: metres(0.2, 1).default(0.4), fit_to_character: z.boolean().default(true) }).strict();
export const LAB_TOOLS = ['hammer', 'screwdriver', 'saw', 'wrench'] as const;
export const LabToolBench = z.object({ ...place, kind: z.literal('tool_bench'), width: metres(1, 3).default(1.8), depth: metres(0.5, 1).default(0.7),
  height: metres(0.7, 1.1).default(0.9), tools: z.array(z.enum(LAB_TOOLS)).min(1).max(4).default([...LAB_TOOLS]), fit_to_character: z.boolean().default(true) }).strict();
export const LAB_WEAPONS = ['knife', 'sword', 'hammer', 'staff', 'shield', 'axe'] as const;
export const LabWeaponRack = z.object({ ...place, kind: z.literal('weapon_rack'), width: metres(1, 4).default(2.4),
  weapons: z.array(z.enum(LAB_WEAPONS)).min(1).max(6).default([...LAB_WEAPONS]) }).strict();
export const LabTargetPost = z.object({ ...place, kind: z.literal('target_post'), height: metres(1, 2.2).default(1.6), pads: z.number().int().min(1).max(6).default(3) }).strict();

export const LabStation = z.discriminatedUnion('kind', [LabJumpPit, LabHighBar, LabHurdles, LabPool, LabClimbWall, LabLadder, LabGraspTable, LabConveyor, LabToolBench, LabWeaponRack, LabTargetPost]);
export type LabStation = z.infer<typeof LabStation>;
export type LabStationKind = LabStation['kind'];
export const LAB_STATION_KINDS: readonly LabStationKind[] = ['jump_pit', 'high_bar', 'hurdles', 'pool', 'climb_wall', 'ladder', 'grasp_table', 'conveyor', 'tool_bench', 'weapon_rack', 'target_post'];
/** A course holds at most this many stations; their ids are unique together with the obstacles and cars. */
export const LAB_MAX_STATIONS = 12;

/** An object on a station: a grasp object, a tool or a training weapon. `at` is its spot on the station's top (m). */
export const LabProp = z.object({
  id: stationId,
  on: stationId,
  name: z.string().min(1).max(40),
  shape: z.enum(['box', 'cylinder', 'sphere', 'tool']),
  size_m: z.tuple([metres(0.02, 2), metres(0.02, 2), metres(0.02, 2)]),
  mass_kg: metres(0.01, 30),
  grip: z.enum(['power', 'pinch', 'hook', 'handle']),
  at: z.tuple([metres(-5, 5), metres(-5, 5)]).default([0, 0]),
  /** Where it should be placed (Place runs), on the same station's top. */
  target: z.tuple([metres(-5, 5), metres(-5, 5)]).optional(),
  /** Training weapons are foam or wood; nothing breaks and there is no damage. */
  material: z.enum(['foam', 'wood', 'plastic', 'metal', 'glass', 'card']).default('plastic'),
}).strict();
export type LabProp = z.infer<typeof LabProp>;

/** The board's 12 grasp objects (two of each): cube 5 cm 0.1 kg, cup 0.3, ball 22 cm 0.5, bottle 1, box 30 cm 3, crate 40 cm 8 kg. */
export function graspTableProps(on: string): LabProp[] {
  const kinds: Array<Omit<LabProp, 'id' | 'on' | 'at' | 'target'>> = [
    { name: 'Cube', shape: 'box', size_m: [0.05, 0.05, 0.05], mass_kg: 0.1, grip: 'pinch', material: 'plastic' },
    { name: 'Cup', shape: 'cylinder', size_m: [0.08, 0.1, 0.08], mass_kg: 0.3, grip: 'handle', material: 'plastic' },
    { name: 'Ball', shape: 'sphere', size_m: [0.22, 0.22, 0.22], mass_kg: 0.5, grip: 'power', material: 'plastic' },
    { name: 'Bottle', shape: 'cylinder', size_m: [0.08, 0.3, 0.08], mass_kg: 1, grip: 'power', material: 'plastic' },
    { name: 'Box', shape: 'box', size_m: [0.3, 0.3, 0.3], mass_kg: 3, grip: 'power', material: 'card' },
    { name: 'Crate', shape: 'box', size_m: [0.4, 0.4, 0.4], mass_kg: 8, grip: 'handle', material: 'wood' },
  ];
  // Two rows across the table; each object's mark is its own spot: a Place run picks it up and puts it back on it.
  return kinds.flatMap((kind, k) => [0, 1].map(copy => { const x = -0.85 + k * 0.34, z = copy ? 0.22 : -0.22;
    return LabProp.parse({ ...kind, id: `${on}-${kind.name.toLowerCase()}-${copy + 1}`, on, at: [x, z], target: [x, z] }); }));
}

/** The tool bench's tools (hammer 0.5 kg and the others) and the pieces they work on (nail board, screw plate, plank in a clamp, bolt). */
export function toolBenchProps(on: string, tools: readonly (typeof LAB_TOOLS)[number][] = LAB_TOOLS): LabProp[] {
  const sets: Record<(typeof LAB_TOOLS)[number], Array<Omit<LabProp, 'id' | 'on' | 'at'> & { key: string }>> = {
    hammer: [{ key: 'hammer', name: 'Hammer', shape: 'tool', size_m: [0.1, 0.03, 0.32], mass_kg: 0.5, grip: 'handle', material: 'wood' },
      { key: 'nail-board', name: 'Nail board', shape: 'box', size_m: [0.3, 0.04, 0.2], mass_kg: 1.2, grip: 'power', material: 'wood' }],
    screwdriver: [{ key: 'screwdriver', name: 'Screwdriver', shape: 'tool', size_m: [0.03, 0.03, 0.22], mass_kg: 0.15, grip: 'handle', material: 'plastic' },
      { key: 'screw-plate', name: 'Screw plate', shape: 'box', size_m: [0.2, 0.02, 0.15], mass_kg: 0.6, grip: 'power', material: 'metal' }],
    saw: [{ key: 'saw', name: 'Hand saw', shape: 'tool', size_m: [0.12, 0.02, 0.5], mass_kg: 0.45, grip: 'handle', material: 'metal' },
      { key: 'plank', name: 'Plank in clamp', shape: 'box', size_m: [0.6, 0.03, 0.12], mass_kg: 1.5, grip: 'power', material: 'wood' }],
    wrench: [{ key: 'wrench', name: 'Wrench', shape: 'tool', size_m: [0.04, 0.02, 0.25], mass_kg: 0.3, grip: 'handle', material: 'metal' },
      { key: 'bolt', name: 'Bolt', shape: 'cylinder', size_m: [0.03, 0.06, 0.03], mass_kg: 0.08, grip: 'pinch', material: 'metal' }],
  };
  // Each tool lies by its piece, the tools in a row across the bench.
  return tools.flatMap((tool, i) => sets[tool].map(({ key, ...prop }, k) => LabProp.parse({ ...prop, id: `${on}-${key}`, on, at: [-0.66 + i * 0.44 + (k ? 0.08 : -0.08), k ? -0.12 : 0.15] })));
}

/** The training weapons on the rack: generic foam or wood props only (Q-LAB-18a: no damage, nothing breaks). */
export function weaponRackProps(on: string, weapons: readonly (typeof LAB_WEAPONS)[number][] = LAB_WEAPONS): LabProp[] {
  const all: Record<(typeof LAB_WEAPONS)[number], Omit<LabProp, 'id' | 'on' | 'at'>> = {
    knife: { name: 'Foam knife', shape: 'tool', size_m: [0.04, 0.03, 0.25], mass_kg: 0.1, grip: 'handle', material: 'foam' },
    sword: { name: 'Wooden sword', shape: 'tool', size_m: [0.06, 0.03, 1], mass_kg: 0.8, grip: 'handle', material: 'wood' },
    hammer: { name: 'Foam hammer', shape: 'tool', size_m: [0.12, 0.08, 0.6], mass_kg: 0.5, grip: 'handle', material: 'foam' },
    staff: { name: 'Staff', shape: 'tool', size_m: [0.04, 0.04, 1.8], mass_kg: 1.2, grip: 'power', material: 'wood' },
    shield: { name: 'Round shield', shape: 'cylinder', size_m: [0.6, 0.04, 0.6], mass_kg: 1.5, grip: 'handle', material: 'foam' },
    axe: { name: 'Foam axe', shape: 'tool', size_m: [0.16, 0.04, 0.6], mass_kg: 0.4, grip: 'handle', material: 'foam' },
  };
  // In a row along the rack, standing in it.
  return weapons.map((weapon, i) => LabProp.parse({ ...all[weapon], id: `${on}-${weapon}`, on, at: [-0.9 + (1.8 * i) / Math.max(1, weapons.length - 1), 0] }));
}

/** The base lab yard (board M18): 42 × 26 m with a 1 m grid, beside the course (its middle at x 25 m, clear of the run line). */
export const LAB_BASE_YARD = { width: 42, depth: 26, x: 25 } as const;
/**
 * Footprint on the floor: `width` across the station (local x, centred on its spot) and `length` along it (local z,
 * from its spot forward). `turn` turns local z toward +x (seen from above).
 */
export function stationFootprint(station: LabStation): { width: number; length: number } {
  switch (station.kind) {
    case 'jump_pit': return { width: Math.max(station.runway_width, station.sand_width), length: station.runway_length + station.sand_length };
    case 'high_bar': return { width: station.mat[0], length: station.mat[1] };
    case 'hurdles': return { width: station.lane_width, length: station.lane_length };
    case 'pool': return { width: station.width, length: station.length };
    case 'climb_wall': return { width: station.width, length: station.mat[1] };
    case 'ladder': return { width: 0.6, length: 0.6 };
    // Tables, belt and bench leave 0.8 m in front for the character to stand.
    case 'grasp_table': return { width: station.width, length: station.depth + 0.8 };
    case 'conveyor': return { width: station.length, length: station.width + 0.8 };
    case 'tool_bench': return { width: station.width, length: station.depth + 0.8 };
    case 'weapon_rack': return { width: station.width, length: 0.5 };
    case 'target_post': return { width: 0.6, length: 0.6 };
  }
}

/** The footprint's corners on the floor ([x, z], metres). */
export function stationCorners(station: LabStation): Array<[number, number]> {
  const { width, length } = stationFootprint(station), a = station.turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ([[-width / 2, 0], [width / 2, 0], [width / 2, length], [-width / 2, length]] as const).map(([x, z]) => [station.x + x * c + z * s, station.z - x * s + z * c]);
}

/** The base lab's stations (board M18), laid out so each fits in the 42 × 26 m yard without touching another. */
export function baseLabStations(): LabStation[] {
  return [
    { kind: 'jump_pit', id: 'jump-pit', x: -20, z: 24, turn: 90 },
    { kind: 'hurdles', id: 'hurdles', x: -20, z: 20, turn: 90, lane_length: 24 },
    { kind: 'high_bar', id: 'high-bar', x: -17, z: 13 },
    { kind: 'pool', id: 'pool', x: -9, z: 4 },
    { kind: 'climb_wall', id: 'climb-wall', x: 0, z: 2 },
    { kind: 'ladder', id: 'ladder', x: 5, z: 2 },
    { kind: 'tool_bench', id: 'tool-bench', x: 9, z: 4 },
    { kind: 'grasp_table', id: 'grasp-table', x: 9, z: 10 },
    { kind: 'conveyor', id: 'conveyor', x: 15, z: 10 },
    { kind: 'weapon_rack', id: 'weapon-rack', x: 15, z: 3 },
    { kind: 'target_post', id: 'target-post', x: 15, z: 6 },
  ].map(row => LabStation.parse({ ...row, x: row.x + LAB_BASE_YARD.x }));
}

/** Ids must be unique across stations, obstacles and cars; at most LAB_MAX_STATIONS stations. Returns the problems. */
export function stationProblems(stations: readonly LabStation[], otherIds: readonly string[] = [], props: readonly LabProp[] = []): string[] {
  const problems: string[] = [], seen = new Set(otherIds);
  if (stations.length > LAB_MAX_STATIONS) problems.push(`A course holds at most ${LAB_MAX_STATIONS} stations.`);
  for (const station of stations) { if (seen.has(station.id)) problems.push(`Two parts share the id "${station.id}".`); seen.add(station.id); }
  const stationIds = new Set(stations.map(station => station.id));
  for (const prop of props) {
    if (seen.has(prop.id)) problems.push(`Two parts share the id "${prop.id}".`);
    seen.add(prop.id);
    if (!stationIds.has(prop.on)) problems.push(`"${prop.id}" is on a station that is not in the course ("${prop.on}").`);
  }
  return problems;
}
