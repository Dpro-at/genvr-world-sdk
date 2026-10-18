# Known mistakes and lessons

Add every new lesson here the day it is found: what happened, the number, how to avoid it. Newest last.

## Placing

- **Water and steep ground.** Items under water (`drowned`) or on ground too steep for them (`slope`; steep ground
  itself is `steep`) give warnings with no automatic fix. The first MCP build spent many calls probing for flat ground.
  Avoid it: read the `Ground:` part of `get_world_summary` first and keep play items near the spawn, where the
  ground is usually dry and walkable. If a finding comes, move the item toward the spawn in steps of 5 to 10 m and
  run `get_checks` again.
- **Spawn points.** A game needs them (`game-no-spawn`; with teams, one per team: `game-team-no-spawn`). Search
  the catalog for `spawn point`. Not in water (`spawn-water`), not inside another item (`spawn-blocked`).
- **Overlap, floating, buried.** Two items inside each other give `overlap`; an item above what is under it
  `floating`, under the ground `buried`. Leave about 1 m between items larger than a
  player.
- **Scattered decoration has no physics.** Players, rides and (until fixed) the camera pass through scattered
  trees. Do not use `scatter_items` for walls, borders or anything that should block; place those one by one.
- **Unreachable.** An item players cannot get to from the start point gives `unreachable`. Keep goals on the
  ground or within a 1 m step of it.

## Shaping the world

- **The summary gives no ground heights** (2026-10-03, first Dpro Studio build): `get_world_summary` says only
  `Ground: an island world` and `Sea up to -1 m`, not how high the land stands or where the shore is. Setting the
  sea to 6, 14 and 20 m changed little seen from the spawn; the island is a plateau higher than that. Now read
  `get_ground` first: it gives the heights, the highest point and the land share, so the sea level is chosen, not
  guessed.
- **A starter world keeps its own trees.** `remove_items` takes away the spawn ring, but the woods grow from the
  world itself; use `cover_ground` with `cleared` (radius up to 100 m) where the ground must be empty.

## Zones and gates

- **A gate counts one way only.** Valley Haul's toll gate counted only on the way back to the Depot, and the
  designing agent could not see it then. Now `get_world_summary` prints the facing and the heading that counts:
  read it after `set_zone` and turn the gate with `move_item` if it faces the wrong way.
- **Zone size comes from the item's scale.** A gate is 12 m x size wide; an area 4 m x size each way. A thin gate
  on a wide road lets players drive past it.
- **Every tag must match.** A rule naming a tag no zone has gives `game-zone-tag-missing`; a zone no rule uses
  gives `game-zone-tag-unused`. Same for ride tags (`ride-tag-unused`).
- **Visible zones.** Players see only zones set `visible: true`. Make goals visible unless hiding them is the game.

## Rules

- **A match that should end when time is up with your own winner needs its own `time_up` rule** with
  `end_match`. When only the clock ends a match, `game-clock-only` suggests a rule that ends it earlier.
- **Declare counters before rules use them** (`game-counter-undeclared`), and start a timer before a rule waits
  for it (`game-timer-not-started`). A timer that fires after time up never matters
  (`game-timer-after-time-up`).
- **A custom event needs an `emit`** somewhere (`game-event-not-emitted`).
- **Guard state.** Check "carrying = 0" before loading; reset what a player carries on `dismounted` and when they
  leave, or it is lost for the match.
- **A `died` rule needs something that does damage** (a weapon tool, or a `damage` action). Valley Haul had a
  `died` rule that could never fire.
- **Ride seats.** More seats in all rides than the place holds players gives `ride-seats-vs-players`; too few
  rides leaves players waiting: set `return_seconds` so empty rides come back.
- **Balance with the expected player count.** Two players emptied Valley Haul's 24 crates in under 3 minutes of a
  4-minute match. Work out a loop's time from the distances in `sizes`, then pick stock and length.

## Displays

- Phones show only the displays that fit, the rest behind "Show N more". Put the goal counter and the timer first.
- Give every display a friendly label ("Crates Delivered"), not the counter's name.

## Working over MCP

- Read `get_game` right before `set_rules`, and pass `expected_version`: a change by index on a changed game is
  refused.
- Search once per part and keep the ids; searches are limited to 20 a minute.
- Do not build on a wrong step: `undo_last_change` at once.


