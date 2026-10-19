---
name: genvr-motion-lab
description: >-
  Guide for the Genvr Studio motion lab through the live Studio MCP tool `motion_lab` (or the Lab area by hand):
  building a measured test course (step, ramp, gap, low wall, window, a street with a timed light and box cars),
  running the lab robot through it with repeatable fixed-step runs, reading the scores (foot slide, penetration,
  fall, car hit, time, smoothness), and keeping motion versions. Use whenever an agent tests, tunes or compares
  motion in a motion lab project.
---

# Motion lab

A motion lab is its own Studio project ("My projects › New motion lab"). It never changes a real world. The lab
character is the Standard robot (body `robot`). Everything a person can do in the Lab area, an agent can do with
`motion_lab`, with the same owner gates.

## Start

1. `get_studio_capabilities` → `motionLab.executable` must be true (a motion lab project is open in the live Studio).
2. `motion_lab { operation: { kind: "commands" } }` lists every operation with one line of help.
3. `motion_lab { operation: { kind: "inspect" } }` shows the course, the run settings, the last run and the best version.

## The course (metres; the course runs along +z from the start line at z = 0)

| Kind | Sizes (defaults) | What the robot does |
|---|---|---|
| `step` | height 0.3, depth 0.6, width 3 | steps up if `step_height` + 8 cm ≥ height; higher than that the toes catch (penetration), 12 cm over it trips (fall); over 45 cm: blocked |
| `ramp` | rise 0.8, length 3, top 1, width 3 | walks up, slower on the slope |
| `gap` | width 1 (the hole), height 0.8 (the blocks), landing ±0, landing_depth 1.2, lane 3 | jumps (Jump Forward, Long Jump when longer than 2 m); a late take-off falls in |
| `low_wall` | height 0.9, thickness 0.3, width 4 | climbs over (Climb) up to 1.3 m; higher: blocked |
| `window` | sill 0.9, opening 1.0 × 0.8, wall 2.4 × 5 | climbs through when the opening is at least 0.75 m high and the sill at most 1.2 m |

- `obstacle_add { obstacle: { kind, z, …sizes } }` (an id is made when missing), `obstacle_set { id, set: {…} }`, `obstacle_remove { id }`.
- `course_from_seed { seed, obstacles 1–12, hardness 1–5, street }`: the same seed always gives the same course.
- `traffic_set { street: { z, lanes, lane_width, crossing, light: { cycle_s, red_s } } | null, cars: [{ id, lane, speed, offset_s, runs_red }] }`.
  Walkers have red for `red_s` at the start of every cycle; cars stop while walkers have green unless `runs_red`.
- Beam, door, uneven ground and moving platform are shown as "later" and refused for now.

## Runs

- `settings_set { settings }` or `run { settings }`: `motion` (Walk, Run, Sneak, Crouch Walk), `speed` m/s, `stride` m,
  `step_height` m, `jump_timing_ms` (− = before the edge), `blend_s`, `lean_deg`, `wait_for_green`.
- A run uses a fixed step of 1/60 s and the course seed: the same course, settings and seed always give the same
  frames and score. Runs are kept with their course and replayed (the last 20, plus the best version).
- `frame { run?, t }` returns the body, the feet (planted or not), the balance point, the speed and the move at that time.
- Honest limit (gait model v1): the feet are placed by a stride model of the move, not read from the animated bones.
  A stride that does not fit the speed makes planted feet slide. Reading the real bones comes with the motion tool (L3).

## Scores (`scores { run? }`)

| Score | How it is measured |
|---|---|
| `foot_slide_cm` | planted feet moving over the ground, both feet, whole run |
| `penetration_cm` | deepest a foot went below the ground or an obstacle top under it |
| `fell`, `car_hit`, `finished` | from the run's events |
| `time_s` | start to the end of the run |
| `smoothness` | 1 / (1 + mean jerk / 300) of the body path; 1 = no jerk |
| `total` | 100 − slide × 1.2 (max 30) − penetration × 2 (max 20) − slowness (max 20; waiting at red is not slow) − (1 − smoothness) × 20; a fall caps it at 20, a car hit at 10, an unfinished run is halved |

## Versions and owner gates

- `save_version { run?, note? }` keeps a run's settings and score as v1, v2 … of its motion.
- `save_best { version }` from an agent only asks: the owner sees "… asks to make … the best" in the Lab and confirms.
  The best version is the ghost the next runs are compared with.
- `rollback { version }` uses a version's settings again.
- `version_delete { version, confirm: true }`: an agent may delete only versions an agent made, never the best one.

## Good habits

- Change one setting at a time and run again; compare with `scores` against the best.
- Name versions with a short `note` (what changed).
- When a run is blocked, read the last event: it says what was too high or too small. Do not change the course to
  hide a weak motion unless the task is to test an easier course.
