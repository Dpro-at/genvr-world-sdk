# Sizes, distances and speeds

All coordinates are **meters on the ground**: x and z, from -4000 to 4000. Height (y) is worked out by the place.

## Directions

- **North is -z, south +z, east +x, west -x.** `get_world_summary` prints a `Directions:` line in places with zones.
- `turn` is in degrees; **turn 0 faces +z (south)**. Turn 90 faces +x (east), 180 faces -z (north), 270 or -90
  faces -x (west).
- A **gate counts only when crossed heading the way the item faces.** The summary says it:
  `counts when crossed heading east (+x)`. To make a gate count from the spawn side, turn it so it faces away
  from the spawn, toward where players go.

## Players

| What | Number |
|---|---|
| Walk | 4.5 m/s |
| Run | 8.5 m/s (a lap of 100 m on foot is about 12 s) |
| Jump | about 1.1 m high (7 m/s up, gravity 22 m/s²) |
| Server move check | 12 m/s on foot; a rider up to the ride's max speed x 1.15 |
| Player height | about 1.8 m |

Something a player must jump onto is at most 1 m high. A gap they must jump is at most about 3 m running.

## Zones

| Shape | Size | Meaning |
|---|---|---|
| `area` | 4 m x 4 m times the item's x and z scale (1 to 120 m each) | the player is inside it (`zone_entered`, `zone_exited`) |
| `gate` | 12 m wide times the item's x scale (2 to 120 m), no depth | the player crossed it going forward (`zone_crossed`) |

The size comes from the item's `size`. An area of `size` 2 is 8 x 8 m; a gate of `size` 0.5 is 6 m wide.
Make a gate as wide as the path players use (a road of 8 m needs a gate of at least 8 m, `size` 0.7 or more).
Give each zone room: two areas closer than their own size make players enter both at once.

## Rideable items (`set_ride`)

| Number | Range | Good start |
|---|---|---|
| `seats` | 1 to 8 | 1 for a race, 2 to 4 for a family ride |
| `max_speed` | 1 to 60 m/s | ground cart 12 to 18, car 20 to 30, boat 10 to 16, plane 25 to 40 |
| `accel` | 0.5 to 40 m/s per second | about max_speed / 3 |
| `turn` | 10 to 360 degrees per second | 90 to 140 for carts |
| `climb` (air) | 0 to 30 m/s | 6 to 10 |
| `ceiling` (air) | 5 to 300 m above ground | 40 to 80 for a small place |
| `reach` | 1 to 12 m (how close to get on) | 3 |
| `exit` | 0.5 to 10 m (get-off distance) | 2 |
| `return_seconds` | 0 to 600 (an empty ride goes back home; 0 stays) | 20 to 60 in games, so rides are not lost |
| `set_speed` factor (a rule) | 0.1 to 3, for 0.1 to 600 s | 1.5 x for 5 s is a clear boost |

A water ride needs water under it; an air ride needs open sky. A ground ride on a 15 m/s cart covers 100 m in
about 7 s.

## Game limits

| Thing | Limit |
|---|---|
| Match length | 30 s to 30 min (`minutes` 0.5 to 30) |
| Minimum players | 1 to 50 |
| Health | 1 to 1000 |
| Respawn wait | 0 to 60 s |
| Countdown / results | 0 to 30 s / 3 to 60 s |
| Tools per player | 4 |
| Counters | 32 (names up to 40 characters) |
| Rules | 64, each up to 6 conditions and 8 actions; messages up to 80 characters |
| Displays (HUD) | 8 (phones show the first ones and hide the rest behind "Show N more": put the important ones first) |
| Rule chains (`emit` into another rule) | 8 deep; 64 actions per event |
| Timers | 0.1 to 3600 s |

## Place sizes

| Size tier | Side | Players |
|---|---|---|
| small | 500 m | 30 |
| medium | 1000 m | 50 |
| large | 2000 m | 100 |
| huge | 4000 m | 100 |

Items must stay inside the place (half the side from the center each way). Use only a small part of it for a
game: most good games fit in 150 x 150 m around the spawn. Everything far from play costs phones for nothing.

## Good distances (from earlier builds)

- Spawn points 4 to 8 m apart, on flat dry ground, facing the play area.
- Start to first goal: 30 to 80 m for a ride, 20 to 40 m on foot.
- A delivery loop of about 15 s by cart (Valley Haul: depot at (0, 30), quarry at (70, -40), about 100 m) feels
  right; two players emptied 24 crates in under 3 minutes.
- Leave 3 m around play items before scattering decoration.

## Drawing walls, roads and ramps

| Tool | Use it for | Notes |
|---|---|---|
| `draw_wall` (`points`, `closed?`, `height?`, `material?`) | a wall through corner points (up to 50, 1 km in all); `closed` makes a room with a floor | `material`: plaster (default), `old-stone` (old castle and town walls), `stone`, `old-brick`, `brick`, `yellow-brick`, `concrete`, `wood`. For a ring around a track use an open wall whose last point repeats the first: a closed one lays a floor over everything inside. |
| `build_house` (`points`, `levels?`, `facade?`, `roof?`, ...) | a house seen from outside, with windows by storey and a roof | Not enterable. |
| `draw_road` / `pave_area` / `draw_river` | a road through points (ground flattened, bridges over water) / a paved square with an exact edge / a river from its start down to its end (from 11 m wide you can swim) | |
| `fill_blocks`, `dig_blocks`, `block_floor`, `block_line` | block places only | |
| `build_platforms` | side-view places only: a jumpable platform course | |

`stretch` [width, height, depth] in metres (0.1 to 50) shapes the parts Box, Wedge, Ball and Cylinder (`place_item`,
`place_items`, `move_item`). A Wedge is a ramp: low at its front (the way its turn faces), high at its back, so a car
driving up it heads opposite its turn. A jump: about 6 wide, 1.5 high, 8 deep.
