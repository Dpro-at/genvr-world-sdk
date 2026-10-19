# Mistakes earlier films made

| Symptom | Cause | Fix |
|---|---|---|
| `get_capture`: "Unknown local filming job." | polled from a new MCP client | keep one client open from start to result |
| `record` job: "No rendered frame available." | Avatar Live was open over the world | `present_avatar {event:{kind:"display",open:false}}`, then record |
| "Clip not found in this browser project." | used a media id | use the timeline clip id from `inspect` |
| language tracks start at 0 s | `dialogue_track` without `start` | `start` = the shot clip's `startSeconds` (undo, then redo) |
| export peak 0 dB / voice twice | source cue audio still plays with the language track | remove the source cue audio after promotion |
| `present_avatar` animation refused (`>=200`) | duration given in seconds | duration is milliseconds |
| `studio_action` refused (missing strings) | no `place_id` / `session_id` | pass both from `list_studio_sessions` |
| `{kind:"voice"}` "Failed to fetch" | free online voice service unavailable | use saved voices with `dialogue_voice` |
| voice job "running" forever | local voice runtime missing | `avatar_voice models`; report it, do not fake speech |
| new character but old face in video | recorded before the change | record a new take |

Before finishing: inspect the timeline, play the chosen language, export, check the file
(duration, video + audio streams), and state exactly which language and IDs were used.
