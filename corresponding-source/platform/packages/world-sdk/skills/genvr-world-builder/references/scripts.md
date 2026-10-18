# Place scripts: when and how

A place script is a small JavaScript file in the place. The room runs it in a sandbox after the rules. It hears
the rules' events and can **only ask for the rules' actions** (add to a counter, show a message, end the match,
...). It cannot reach accounts, the network, other places or the world's items. So a script adds logic, never
power.

## Rules first, script second

Use rules for everything they can say: they are simpler, shown in the studio's rules editor, and checked by the
Checks. Write a script only when the logic needs one of these:

- arithmetic or memory the counters cannot hold (a list of who touched what, an order of arrival, a random pick);
- many similar rules that would pass the 64-rule limit (a 30-gate race);
- logic across events with state (combos, streaks, a cooldown per player).

Keep counters as the shared truth: the script reads and changes declared counters, and the rules, ranking and
displays keep working with them.

## The loop

1. `get_script_api` (and `part: 'types'` when you want the exact signatures). Use only what it lists.
2. Declare every counter the script uses with `set_rules` `add_counters` first. Every zone tag it names must
   exist (`set_zone`). Event names must be the engine's or names a rule `emit`s.
3. Write the source. Use fixed names (`'coins'`, not a name built from strings): the Checks read fixed names and
   warn on built ones (`script-dynamic-name`).
4. `test_script` with `source` and a list of `events` (and `players`, `seed`): it runs the script on a real session
   of the place's game, nothing saved, and answers with each action it asked for (accepted or refused and why),
   the counters after, and its log. Repeat until it does what you meant.
5. `set_script` with a `name` and the `source`. The answer carries its Checks (syntax errors with line and
   column). A saved change restarts the match in open rooms.
6. After a real match, `test_script` with `recording: 'last_match'` replays it, and `get_script_logs` shows the
   open room's log.

## Limits (a script that passes them is switched off for the match)

| Limit | Value |
|---|---|
| Scripts per place | 8, each up to 16 384 characters (65 536 in all) |
| Time | 25 ms at start, 5 ms per handler; 25 ms a second per script, 50 ms a second per place |
| Actions | 16 per handler; 512 reads per handler |
| Strikes | 3 over-time runs or 50 errors switch the script off for the match |
| Memory | 4 MiB per script; all scripts of a place share 64 MiB |
| Log | 10 lines a second, 200 characters a line |

No `eval`, `Function`, timers of your own or `performance`; `Math.random` is seeded and `Date` follows the match
clock, so a dry run and a real match agree. A place that is not private runs only script texts a moderator
approved; a newer text waits for review while the last approved one runs.
