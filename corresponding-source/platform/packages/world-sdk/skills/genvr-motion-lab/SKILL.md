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

## Motion check and styles (board M16)

`check_all { styles? }` plays every move on the Lab body (the Standard robot; other bodies are checked in the Studio later) at the fixed step 1/60 s and checks it against each style's limits; the report is kept in the project. Read it with `check_report { style?, limit? }` (worst first) and open one move with `check_move { move, style? }`, which checks it again now (after a fix).

| Check | What it catches | Realistic | Game | Anime |
|---|---|---|---|---|
| foot_slide | a planted foot drifting on the ground | ≤ 1 cm | ≤ 1.5 cm | ≤ 1 cm |
| ground | a foot or the body under the floor | 0 cm | 0 cm | 0 cm |
| joint_limits | knee forward, elbow backward past human limits | 0° extra | 0° extra | +15° |
| body_clash | a hand or foot inside the body | 0 cm | 0 cm | 0 cm |
| balance | weight outside the planted feet while standing | ≤ 0.1 s | ≤ 0.2 s | not scored |
| loop_seam | last frame ≠ first frame of a loop | ≤ 2° | ≤ 2° | ≤ 2° |
| speed_match | planted feet speed vs body speed | ± 10 % | ± 15 % | ± 10 % |

- Reading a card: the score is 100 less a capped penalty per check (its worst issue only); each issue names the frames it covers (from–to at 60 per second), its value, the limit and the unit. Fix the worst move first, the base moves first (Idle, Walk, Run, Jump, Turn), then check it again.
- Moves in the air or in water (Jump, Swim, Breaststroke) skip the floor checks; seated and climbing moves are not scored for balance.
- The limits above are the board's proposals. `style_params { style? }` shows a style's numbers (timing curve, amplitude, holds, transition, cancel points, overlap) and limits. `style_set { style, params?, limits? }` from you waits for the owner: a style is for everyone; the owner applies it in Lab › Check (`style_confirm` is the owner's).

## My motions in the Lab — private references (board M20)

Motions the owner imported in Avatar › My motions (for example Mixamo) are private references on this device. `mine_list { query?, pack? }` lists them by key (`mine:` + 12 letters), name and pack. `check_move { move: key, style? }` plays one on the Lab body and checks it like our moves (also its pace from its feet); `settings_set { motion: key }` + `run` runs the course with it. The project keeps only the key, never the file, its name or its pack.

- Use them to compare and learn: run and check ours and the reference the same way, then improve our move in Pose and keys.
- `compare { ours, ref, style?, place? }` checks one of our moves and a private reference now and returns both cells and, per check, the worst value of each (null = within the limit). The person sees ours on the character and the reference on a see-through body `beside` it or `over` it, on the same clock. The pair is kept in the project by keys only. Read the rows: where the reference is clean and ours is not, that is what to improve in ours.
- Never share, publish or adopt a private motion (Q-MIXAMO); only our own versions can join the basics, and the owner confirms (later phases of M20).

## Training stations (board M18)

The lab has stations to train every kind of move, standing in the course like obstacles (same ids, `x` across, `z` along, `turn` in degrees, sizes in metres). `stations_base { confirm: true }` puts the base lab's 11 in the 42 × 26 m yard; `station_add` adds one. Pick a station by what the move needs:

| Station | Use it for | Runs now |
|---|---|---|
| `jump_pit` (runway 20 m, board 1–3 m before 8 × 3 m sand) | Run, Long Jump, landings | yes: distance from the board edge, foul (toe over the board, cm), take-off speed, steps, landing forward/back |
| `grasp_table` (2 × 0.9 m, 0.6–1.1 m high, 12 objects 0.1–8 kg) | Reach, grab, lift, carry, place | yes: objects, grabbed, held without a drop, drops, reach at the grab (cm), place error (cm) |
| `conveyor` (6 × 0.6 m, 0.85 m high, 0.1–1 m/s, one object every 1–5 s, bin at the end) | reach and grab moving objects, toss into the bin | yes: 8 objects; picked, picked %, hand–object timing (ms), missed, dropped, in the bin, reached the end unpicked, steps (feet stay planted) |
| `tool_bench` (1.8 × 0.7 × 0.9 m: hammer + nail board, screwdriver + screw plate, saw + plank in a clamp, wrench + bolt) | hammer, screw turn, saw, wrench turn | yes: hammer hits / swings, swing smoothness, self hits, screw wrist turns, saw straightness (cm), wrench pulls, other hand holds |
| `pool` (12.5 × 6 m, zones 1.0 / 1.4 / 2.0 m deep, steps at the shallow end, ladder at the deep end) | step into water, swim, tread water, ladder out | yes: splash (cm), head above water (%), stroke (breaststroke below 1.8 m/s, front crawl above), strokes and strokes per minute, swim speed, breath every n strokes, where it switched from walking to swimming (1.4 m deep), reached the deep end, ladder exit (s), sank (fail) |
| `climb_wall` (5 × 5 m, holds every 0.3–0.5 m), `ladder` (3 m, rungs every 0.3 m) | climb, ladder up and down, top out | yes: holds reached of all, three-point contact (%), slips, time to the top (s), reached the top, climb down clean |
| `weapon_rack` (2.4 m: foam knife, wooden sword, foam hammer, staff, round shield, foam axe) with the nearest `target_post` (pads) | knife thrust, the sword's three lines, hammer and axe blows, staff strikes and a spin, shield blocks | yes: weapons, blows, hits (each blow counted once), hit %, mean distance from the pad's middle (cm), back to guard (s), blocks and shield angle (good 70–95°), prop through the body (fail), balance, target used (no post within 8 m: a practice target 2 m in front of the rack) |
| `target_post` alone (1.6 m, 3 pads) | bare-hand punches and kicks | yes: the same measures for 3 punches and 2 kicks |
| `high_bar` (4 m wide, 0.8–2.0 m high, mat 5 × 3 × 0.5 m) | scissor high jump | yes: bar height, clearance (cm; below 0 touches the bar), bar touched, take-off speed, landing |
| `hurdles` (30 m lane, 4 hurdles 0.5–1.0 m, 6.5 m apart) | hurdle step, three-step rhythm | yes: hurdles hit (each counted once), steps between hurdles (3 is the rhythm), trail leg height, time, landing |

- Run all stations: `stations_run_all { repeats }` (or Run all stations in the Lab) runs each station with seeds seed, seed + 1 … without keeping the runs and lists the best total per station, worst first: train the top of that list next. The night queue that does this unattended is board M6.
- Run on a station: `run { station }` (or the Lab's Run on picker). The answer has `station_score` next to the common scores. Jump pit: speed is the run-up, `jump_timing_ms` moves the take-off foot (later can foul), `lean_deg` sets the flight angle (20° + half the lean) and a negative lean sits back on landing.
- A station run's total is half the common score (foot slide, penetration, smoothness, fall; no time goal on a station) and half the station's quality: a clean jump's distance against 8 m (a foul is 0); the objects held without a drop out of all of them less the place error (cm, at most 30); on the belt the picked % less the mean timing / 10 ms (at most 20) and 5 per drop; on the bench the mean of each tool (hammer hits / swings − 50 per self hit, saw 100 × (1 − wander / 3 cm), screwdriver 100 × 12 / wrist turns, wrench 100); on the rack and the post the hit % less the mean distance / 2 (at most 20) and 30 for a lost balance (a prop through the body is 0); in the pool half the head-above-water %, 30 for reaching the deep end and 20 for a ladder exit within 8 s (sinking is 0); high bar 70 + the clearance (cm, at most 30), 20 when the bar is touched; hurdles 100 − 25 per hurdle hit − 15 without the three-step rhythm; on the wall and ladder 60 for the top, 0.3 × three-point %, −10 per slip and 10 for a clean climb down.
- Conveyor: `jump_timing_ms` is the hand's timing (early − / late +); more than 5 cm off the object is a miss, an edge grab over 3 cm of 1 kg or more slips. Tool bench: the run speed is the swing speed (faster is less accurate, 5 cm toward the holding hand hits it); the blend sets swing smoothness. Pool: the swim speed is ¾ of the run speed (at most 2 m/s); slower than 0.4 m/s in deep water sinks. Wall and ladder: faster than 3 m/s moves two limbs at once (no three-point contact) and slips more. High bar: the vertical take-off speed is 55 % of the run speed (at most 4 m/s); the scissor passes 25 cm under the hips' top. Hurdles: the trail leg rises 0.62 m × size + 4 cm per m/s. Rack and post: blows spread more at higher run speed; heavier props are slower back to guard; a staff spun faster than 5 m/s passes through the body; leaning more than 12° loses balance.
- "Fit to character" (on by default) sets table, belt and bench heights by the character's hip height, so short and tall bodies train at the same reach. Objects beyond the arm's reach are missed, which is a result, not an error.
- Objects: `prop_add / prop_set / prop_remove { confirm: true }` (shape, size, mass, grip power|pinch|hook|handle, spot `at`, mark `target`). A grip holds at most power 15, handle 12, hook 10, pinch 1.5 kg (fully closed).
- Removing a station or an object needs `confirm: true`. Weapons are foam or wood training props only: no brands, no damage, nothing breaks.
- Start with the moves we have, compare only within one character, and keep the best per station.

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

After Save as version the motion is in My motions (Avatar › Moves); `made_to_moves { version? }` puts an older version there. Using it in the game (keys 1–8, or instead of Idle / Walk / Run / Jump) is `avatar_studio` `move_use` — see the avatar-presentation skill.

Habits: key the whole body on frame 0, then only the joints that change; read `problems` after big changes; mirror
for the other side instead of setting it by hand.

## Good habits

- Change one setting at a time and run again; compare with `scores` against the best.
- Name versions with a short `note` (what changed).
- When a run is blocked, read the last event: it says what was too high or too small. Do not change the course to
  hide a weak motion unless the task is to test an easier course.
