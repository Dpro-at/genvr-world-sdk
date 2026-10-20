---
name: genvr-motion-lab
description: >-
  Guide for the Genvr Studio motion lab through the live Studio MCP tool `motion_lab` (or the Lab area by hand):
  building a measured test course (step, ramp, gap, low wall, window, a street with a timed light and box cars),
  running the lab robot through it with repeatable fixed-step runs, reading the scores (foot slide, penetration,
  fall, car hit, time, smoothness), keeping motion versions and sharing a version with the GenVR community (owner
  confirms), and making a new motion by pose and key frames (every joint and finger by number inside the joint law,
  a hand or foot moved and the limb following, pins, mirror, Test in course, Save as version). Use whenever an agent
  tests, tunes, compares, makes or prepares to share motion in a motion lab project.
---

# Motion lab

A motion lab is its own Studio project (the Lab tab opens it from any project; there is one lab, made the first time). It never changes a real world. The lab
character is the Standard robot (body `robot`): the same 52-bone human skeleton as the human bodies, with five toes
on one ToeBase joint per foot that bend up 0–45° by themselves when the heel lifts (a clip that keys ToeBase wins). Everything a person can do in the Lab area, an agent can do with
`motion_lab`, with the same owner gates.

## Who runs

By default the Lab follows the Avatar tab: it runs the project's avatar when the Lab can use it (the Standard robot or
a character imported into My characters; hidden bodies never), else the robot. `characters` lists who can run (id,
name, source `lab` or `mine`, leg = hip height in metres) and who runs now; `who_set {who}` picks one, and
`who_set {who: "avatar"}` follows the Avatar tab again. A picked character that was deleted falls back to the robot.
Imported characters are private: their versions are never shareable. Scores and the best version compare one
character's runs only, and the clip's pace on the floor scales with leg length (robot hip 0.84 m).

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

## Sharing a motion with the GenVR community (publishing)

Every version is private on this device first. Sharing publishes it, so the owner decides every share.

- `motions_mine` lists every version with its state: `private`, `pending` (prepared, waits for the owner), `shared`,
  `blocked` (with the reasons), plus `publishing`: `platform` (GenVR hosting connected) or `local-preview`.
- `motion_similar { version }` shows motions we already have that are like it: the GenVR library move it is made from
  (also run on the same course, so foot slide and score can be compared) and the owner's shared versions of that move.
  Alike = pace, stride, lean and step height; it is not a pose-by-pose compare yet. Tell the owner when the library
  move is as good or better: keeping theirs or using the library one is their choice.
- `share_prepare { version, share: { name, description?, tags?, preview_s? } }` prepares a share only when the owner
  asked for it. Tags: lower-case words with dashes, up to 8. Nothing is published; the owner sees it in the Lab and
  presses "Share with the community".
- `share { version, confirm: true }` is the owner's: an agent is refused and the prepared share keeps waiting.
- `unshare { version, confirm: true }` stops sharing (or drops a prepared share). A shared version cannot be deleted
  before it is unshared.
- A motion made here by pose and key frames counts as made in the lab (it can be shared from a GenVR character).
- Never shareable: a motion not made from a GenVR library move or in this lab, on a GenVR character (for example made from Mixamo),
  a motion from a video the owner has no rights to, and a version that falls, is hit by a car or does not finish.
- Licence shown on every shared motion: **GenVR community licence** — free to use in GenVR worlds and films, also
  commercially; credit the creator; do not sell or re-share the motion file on its own.
- Without GenVR hosting a share is a local preview: say so plainly ("marked shared on this device, nothing was
  published").

## Making a motion by pose and key frames (board M11)

The Lab's **Pose and keys** mode (left: body map + hand map; right: the sliders; over the view: Turn joint 1, Move
hand / foot 2, Pin 3, Onion skin O, Play Space; under it: the key track). Same through `motion_lab`:

- `pose_new { name, frames?, loop?, from: stand|t_pose }` — 60 frames per second (120 = 2 s); frame 0 gets a key of
  the whole pose. A made motion may not take a library move's name (Walk, Run …). `pose_list`, `pose_open { motion }`.
- `pose_get { frame }` — every slider, rows keyed there, the joint law check (`problems`, empty = natural), wrists and
  ankles in metres (`limbs`: x his left, y up, z his front, feet on the floor at y ≈ 0.1), pins and all keys.
- Sliders have the Avatar pose panel's names: `head.nod|turn|tilt`, `spine.bend|turn|side`, per side with `L.`/`R.`
  (his left / right): `collar.lift`, `arm.up|forward|twist`, `elbow.bend|twist`, `wrist.bend|side`,
  `hand.fist` (%), `hand.spread`, `palm.cup`, `thumb.across|out|turn|mid|tip`, `index|middle|ring|pinky.base|side|mid|tip`,
  `leg.forward|out|twist`, `knee.bend`, `ankle.bend|side`; and the hips `root.x|y|z` (metres; y < 0 = lower).
- `pose_set { frame, joint, side: both|left|right, value }` or `{ frame, values: { "R.elbow.bend": 38 } }` — each
  stops at the joint law; the answer lists `stopped`. On a frame keyed for that joint's row it changes the key;
  otherwise it waits as a **draft** — call `key_add` or it is lost when another frame is edited.
- `key_add { frame, rows?, ease? }` — rows: body, right_arm, right_hand, left_arm, left_hand, legs (default all);
  ease: linear, smooth (default), hold. The lab fills the frames between keys; a loop runs from the last key into the
  first. `key_remove`, `key_ease`, `key_copy { from, to, rows? }`.
- `limb_move { frame, limb, target: [x,y,z] | by: [dx,dy,dz] }` — two-bone reach; `miss_cm` > 2 means out of reach
  or stopped by the joint law. `pin { limb, on }` — a pinned foot keeps its spot (the hips move), a pinned hand
  reaches back. `pose_mirror { frame, mode: swap|left_to_right|right_to_left }`.
- `pose_test` — Test in course (pace measured from the motion's feet; a motion that does not walk scores a big foot
  slide: say so, it is honest). `pose_save_version { note? }` — tests again only when the keys changed, then keeps the
  run as a version with the keys; `rollback` brings the keys back.

Habits: key the whole body on frame 0, then only the joints that change; read `problems` after big changes; mirror
for the other side instead of setting it by hand.

## Good habits

- Change one setting at a time and run again; compare with `scores` against the best.
- Name versions with a short `note` (what changed).
- When a run is blocked, read the last event: it says what was too high or too small. Do not change the course to
  hide a weak motion unless the task is to test an easier course.
