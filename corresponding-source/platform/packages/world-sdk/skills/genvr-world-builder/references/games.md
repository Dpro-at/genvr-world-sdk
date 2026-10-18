# From a game idea to rules

A Genvr game is generic parts: **zones** (areas and gates with tags), **rideable items** (with ride tags),
**counters** (named numbers per player, team or the whole match), **rules** (when an event, if conditions, do
actions), a **ranking** and **displays**. The engine knows no game; the tags and names are yours.

## Turn the idea into parts

Answer these, in this order, and write the answers down before any call:

1. **The goal.** What number shows who is winning? That is the ranking counter (`ranking: { by, order, then? }`).
2. **The verbs.** What do players do to change it? Each verb is an event in a place: entering an area, crossing a
   gate, getting on or off a ride, hitting, dying, a timer. Each place becomes a zone with a tag.
3. **The state.** What must the game remember between events? (carrying something, laps done, stock left).
   Each is a counter. Player scope for things a player has, global for shared stock, team for team totals.
4. **The end.** Time up, a counter reaching a number, or one player reaching a zone. A match that ends when time
   is up needs its own rule for `time_up` with `end_match`, or the clock just stops.
5. **What players see.** Up to 8 displays: the goal counter first, then the timer, then the rest.
6. **Feedback.** A `show_message` for each important moment (picked up, delivered, need a ride). Keep messages
   short; they show on phones.

## Events, conditions, actions

- **Events (`when.event`):** `zone_entered`, `zone_exited`, `zone_crossed` (with `tag`), `mounted`,
  `dismounted` (with the ride `tag`), `player_joined`, `player_left`, `hit`, `died`, `respawned`,
  `phase_changed`, `time_up`, `counter_changed` (with `counter`), `timer_fired`, or your own name raised by `emit`.
- **Conditions (`if`, all must hold):** `counter` compared with a number or another counter
  (`= != < <= > >=`), `phase`, `team`, `riding` (true or false, with an optional ride tag).
- **Actions (`do`, in order):** `add_counter`, `set_counter`, `add_score`, `end_match` (winner by counter, the
  actor, a team, or nobody), `start_timer`, `damage`, `heal`, `teleport_to_zone`, `show_message`, `emit`, `say`,
  `dismount`, `set_speed` (factor and seconds). `who` is `actor` (default), `everyone` or `team_of_actor`.

## Patterns that work

| Game | Parts |
|---|---|
| **Delivery** | pick-up area, drop-off area, a player counter "carrying" (0 or 1), a delivered counter; ride optional. |
| **Race** | numbered gates `cp1..cpN` facing along the track, a player counter `next_cp`; each gate rule checks `next_cp = k` then adds 1; the finish gate ends the match with the actor as winner, or counts laps. |
| **Collect** | several small areas tagged the same (`coin`), a player counter; a timer gives them back. |
| **King of the hill** | one area, a repeating timer (`timer_fired` starts it again) that adds 1 to whoever is inside, tracked with an `inside` counter set on enter and exit. |
| **Tag / hunt** | `hit` and `died` with health, teams two, ranking by knock-outs (the default game already counts them). |

Always guard the state: a pick-up rule checks "carrying = 0" so entering twice does not load twice; dropping
the ride (`dismounted`) or leaving resets what the player carried, or it is lost.

## Worked example: Valley Haul (built over MCP, 2026-10-02, played with bots)

A 240 s free-for-all: drive a cart from the Depot to the Quarry, load a crate, bring it back.

- **Items and zones:** Depot area `depot` at (0, 30); Quarry area `quarry` at (70, -40) (about 100 m apart);
  a gate `toll` at (28, 4) on the way back, facing the Depot; three carts tagged `cart` (ground, 16 m/s, 1 seat)
  next to the spawn points near the Depot; zones visible in play.
- **Counters:** `crates_delivered`, `crate_on_cart`, `tolls_passed` (player); `quarry_stock` (global, start 24).
- **Rules (shape):**

```json
[
  { "when": { "event": "zone_entered", "tag": "quarry" },
    "if": [ { "kind": "riding", "is": true, "tag": "cart" },
            { "kind": "counter", "name": "crate_on_cart", "op": "=", "value": 0 },
            { "kind": "counter", "name": "quarry_stock", "op": ">", "value": 0 } ],
    "do": [ { "kind": "add_counter", "name": "crate_on_cart", "by": 1 },
            { "kind": "add_counter", "name": "quarry_stock", "by": -1 },
            { "kind": "show_message", "text": "Crate loaded! Back to the Depot" } ] },
  { "when": { "event": "zone_entered", "tag": "quarry" },
    "if": [ { "kind": "riding", "is": false } ],
    "do": [ { "kind": "show_message", "text": "You need a Haul Cart" } ] },
  { "when": { "event": "zone_entered", "tag": "depot" },
    "if": [ { "kind": "counter", "name": "crate_on_cart", "op": ">=", "value": 1 } ],
    "do": [ { "kind": "set_counter", "name": "crate_on_cart", "to": 0 },
            { "kind": "add_counter", "name": "crates_delivered", "by": 1 },
            { "kind": "add_score", "by": 1 } ] },
  { "when": { "event": "zone_crossed", "tag": "toll" },
    "if": [ { "kind": "riding", "is": true } ],
    "do": [ { "kind": "add_counter", "name": "tolls_passed", "by": 1 },
            { "kind": "set_speed", "factor": 1.6, "seconds": 5 } ] },
  { "when": { "event": "dismounted", "tag": "cart" },
    "if": [ { "kind": "counter", "name": "crate_on_cart", "op": ">=", "value": 1 } ],
    "do": [ { "kind": "set_counter", "name": "crate_on_cart", "to": 0 },
            { "kind": "add_counter", "name": "quarry_stock", "by": 1 } ] },
  { "when": { "event": "counter_changed", "counter": "quarry_stock" },
    "if": [ { "kind": "counter", "name": "quarry_stock", "op": "<=", "value": 0 } ],
    "do": [ { "kind": "end_match", "winner": { "byCounter": "crates_delivered", "order": "high" } } ] },
  { "when": { "event": "time_up" },
    "do": [ { "kind": "end_match", "winner": { "byCounter": "crates_delivered", "order": "high" } } ] }
]
```

- **Ranking:** `{ "by": "crates_delivered", "order": "high", "then": "tolls_passed" }`; equal rows go to whoever
  reached the value first.
- **Displays:** delivered, on cart, stock, tolls, timer, rank, speed (each with a friendly label).
- **What the play-test showed:** everything worked; two players emptied the stock in under 3 minutes, so the
  240 s clock only mattered for a lone player. Tune stock and distance to the player count you expect.
