# Tools: which one for what

Platform tools take `place_id` from `list_places`; local SDK tools use the current file world or selected Studio session. Read capabilities and discover tool schemas first. Refusals explain the reason.

## Reading

| Tool | Use it for |
|---|---|
| `list_places` (`from?`) | the places you may build in: id, role, version, size, view, block ground, game, title. 50 a page. |
| `get_world_summary` (`from_item?`) | the ground, every item with its instance id and (x, z), zones with size, facing and the heading that counts, rideable items, the `Directions:` line. 100 items a page (`more_items_from`). Read it before every round of changes. |
| `get_game` (`from_rule?`) | counters, rules with their index, ranking, displays, and `place_version: N`. |
| `get_ground` (`x?`, `z?`, `radius?`) | ground heights on a 21 x 21 grid (whole place, or a square around x, z), the sea level (`~` cells are under it), highest and lowest point, land share. Read it before `set_sea`, shaping, or laying a path. |
| `get_checks` | the problems of the saved place: id, code, level, message, instance ids, whether a fix exists. At most 50. |
| `search_catalog` (`query`) | items by meaning, then by words; up to 20 `id: name (caption)` lines. 20 searches a minute: search for each part once and keep the ids. |
| `get_style_guide` (`style`) | the item and place budgets and the look rules of a style. |

## Building

| Tool | Use it for | Notes |
|---|---|---|
| `place_item` | one item at (x, z) with `turn` (degrees, 0 faces +z), `size` (0.2 to 10), `color`, `on` (stand it on another item) | Height is worked out: it rests on the ground or on `on`. Parts: `stretch` (`sizes`). |
| `scatter_items` | up to 60 of up to 8 items mixed in a circle (radius 1 to 200 m) | Decoration only. Scattered items get no physics bodies: players and vehicles pass through them. |
| `move_item` | move, turn or resize one placed item | Give only what changes. A gate's facing is its turn. |
| `remove_items` | up to 100 instance ids at once | |
| `place_items` (`items`) | up to 200 items in one change: `itemId`, `x`, `z`, optional `y` (exact; else it rests), `turn`, `size`, `stretch`, `lean` (degrees toward its front), `params` (generator parameters within the item's limits) | One write; nothing is placed when one item is refused. |
| `set_zone` | make a placed item an `area` (inside it) or a `gate` (crossed going forward), with a `tag`; `visible` shows it while playing; `off` ends it | Any item can be a zone. The item's scale sets the zone size (see `sizes`). |
| `set_ride` | make a placed item rideable: `model` ground, water or air; seats, max_speed, accel, turn, grip, climb, ceiling, camera, reach, exit, return_seconds, `tag` | `model: null` ends it. A new model starts from that model's preset numbers. |

## The place and its world

| Tool | Use it for |
|---|---|
| `create_place` (`style`, `world_kind?`, `title?`, `size?`) | a new private place of this account, any style; realistic places start as a `valley`, `island` (sea all round), `plain` or `mountains` world; `size` small 500 m (default) to max 8000 m. Answers with the new `place_id`. |
| `make_world` (`kind`, `seed?`) | turn the place into a starter world of a kind (hills, woods, trees and rocks around the spawn). Not for block ground. |
| `set_sea` (`level`) | the sea fills everything below this height (m); `null` takes it away. |
| `set_story` | scroll-page camera stops |
| `sculpt_terrain` (`x`, `z`, `radius`, `operation`, `strength?`) | raise, lower, flatten or smooth the ground in a circle (radius 1 to 100 m). |
| `paint_terrain` (`x`, `z`, `radius`, `soil` or `material`) | grass, dirt, sand, rock or snow (or a named ground material in realistic places). |
| `cover_ground` (`x`, `z`, `radius`, `cover`) | plants or pebbles, `cleared` (nothing grows), `default`. Needs a world (`make_world`). |
| `set_ground_heights` | Up to129×129 points,2m spacing, base64 int16 centimetres above base. Query the host schema for fields; one undo restores the tile. |
| `paint_ground_rule` (box `x1`..`z2`, `soil`/`material` or `cover`, `height?`, `slope?`, `depth_below_sea?`) | paint where a rule holds in a box up to 512 m, e.g. rock over 35 degrees. |
| `set_sky` (`preset`, `cycle_minutes?`, `time_of_day?`, `sun_azimuth?`, `wind_direction?`, `wind_speed?`) / `set_weather` (`preset`) | day, sunset, night, storm, a cycle, a fixed hour, the sun path, the wind (from, degrees from north; m/s) / clear, rain, snow, storm, fog, sandstorm. |

Walls, roads, rivers, blocks: see `sizes`. Check the host tool list for `add_water` and `set_style`.

## The game

| Tool | Use it for |
|---|---|
| `set_game` | make the place a game or change it: `teams` (none or two), `minutes` (0.5 to 30), `health`, `respawn_seconds`, `min_players`, `tools` (item ids players hold); `remove: true` makes it an ordinary world again. A new game starts with a clock, a point per knock-out and highest score wins. |
| `set_rules` | Add/remove counters, rules and HUD without replacing unrelated entries. Read get_game first; use its expected_version and current indexes. Whole counters/rules/hud lists replace their previous lists. |

## Scripts

| Tool | Use it for |
|---|---|
| `get_script_api` (`part?`) | the Script API, limits and examples; `part: 'types'` gives the `.d.ts`. Read it before writing a script. |
| `get_scripts` (`script_id?`, `from_line?`) | the place's scripts, or one source with line numbers. |
| `test_script` | a dry run on the place's real game, nothing saved: the actions asked for, accepted or refused, counters after, its log. |
| `set_script` | add, change, switch on or off, or remove one script; answers with its Checks. A saved change restarts the match in open rooms. |
| `get_script_logs` (`since?`) | the script log of the open room; empty when no room is open. |

## Fixing and undoing

| Tool | Use it for |
|---|---|
| `apply_check_fix` (`finding_id`) | apply one finding's automatic fix as one change. Refused when the finding is gone or has no fix. |
| `undo_last_change` | undo your own latest change, step by step. Refused when someone else changed the place since (then undo in the studio). |

## When a tool refuses

- **"The place is being changed by someone else right now"**: a builder is working in the studio. Wait, read again.
- **"The game changed since it was read"**: `set_rules` by index or whole list on a changed game. Read `get_game`
  again and use the fresh indexes.
- **"Place not found."**: wrong id, or the token does not cover that place. Use an id from `list_places`.
- **Rate limits**: 120 requests a minute per token, 30 changes a minute and 2000 a day per account, 20 searches a
  minute. Batch your thinking, not your calls: plan the layout first, then place.
- **One change** holds at most 200 commands: a `scatter_items` of 60 is fine; do not try to place a city in one call.
