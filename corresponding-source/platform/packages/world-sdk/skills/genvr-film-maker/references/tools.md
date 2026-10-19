# Film tools

All `studio_action` calls: `{place_id, session_id, operation:{kind:..., ...}}`. Each returns
`{job_id, local:true}`; poll `get_capture {place_id, job_id}` until `status` is `done` or `failed`.
Jobs live in the MCP client process that started them: keep one client open for a whole sequence.

## Session and library

| Tool | Use |
|---|---|
| `get_studio_capabilities` | what the live connection can do (filming, voice, avatarLive, privateLibrary, sharing) |
| `list_studio_sessions` / `select_studio_session` | the open Studio window; gives `placeId` and session id |
| `inspect_studio` | world style/kind, actor, animation, camera, `availableWorlds` |
| `user_avatar_library` | `list` characters (built-in + private), `assign` to `self` or a host agent, `play` a private motion |
| `list_avatar_motions` | `query`, `category`, `offset`, `limit`; each entry has `id`, `source` (`native` or `private-host-library`) |
| `present_avatar` | preview `animation` (duration ms ≥ 200), `expression`, `effect`, `notification`, `card`, `display` |
| `avatar_voice` | `voices`, `models`, `assign`, `speak` (async job → `job`), `replay`, `playback`, `recordings` |
| `set_camera` / `get_camera` / `reset_camera` | presets and timed path stops |
| `capture_photo` | PNG of the live view (job) |

## Film operations (`studio_action` `operation.kind`)

| kind | Fields | Notes |
|---|---|---|
| `inspect` | — | film tracks, clips (`id`, `media`, `startSeconds`, `endSeconds`), media, cues, actors |
| `commands` | — | discover editor command schemas before `command`/`batch` |
| `cues` | `cues[]`, optional `shot_id` | draft cues; each: `id`, `actor`, `label`, `action`, `start`, `end` (> start, ≤ 180 s), `text`, `volume` 0–2, optional `audio`, `voice`, `at`, `to[]` |
| `dialogue_voice` | `cue_id`, `voice_id`, `language`, optional `shot_id` | generates the line with a saved voice; line length sets the cue end |
| `dialogue_preview` | `cue_id`, optional `shot_id` | listen with mouth motion |
| `record` | optional `shot_id`, `settings`, `world_sound`, `live_actors` | timed take with the draft cues |
| `manual_record` | `action: start / stop`, optional `seconds` 1–30 (default 30) | live take: the person moves the character; `seconds` is the longest it runs; wait for stop's job before editing |
| `dialogue_track` | `cue_id`, `shot_id` (**clip id**), `language`, `start`, `append` | promotes a cue's audio + text to that language's voice + caption tracks |
| `sound_import` | `name`, audio MIME, base64 `data` (≤ 8 MB decoded) | imports at the playhead; returns `media` and `clip` |
| `lighting` | optional `lights[]` | read or replace up to four spotlights |
| `export` | optional `shot_id` (**clip id**) or `range: 'marked'`, `width` 320–3840, `height` 240–2160, optional `language`, `captions: 'picture' / 'none'` | full film, one shot or the marked In/Out; `language` keeps only that language's captions and voice (call once per language for one file each); WebM ≤ 40 MB |
| `undo` / `redo` | — | one editor step each |

Film settings (set once for the whole film; read them first with `inspect` → `film.settings`):
`command` `project.settings` with any part of `{ kind: 'film'|'series', name, languages: [{ lang, level: 'text'|'text_voice' }]
(first = main language), story, shotSeconds 1–30, worldSound, roomVoices, caption: { size, place, inExport },
titles: { intro, episodeCard, credits, creditsText }, director: { autonomy: 'auto'|'end'|'each' } }`. Parts merge; it is one
undo step. Video size is `project.size`. Titles and the AI director are stored now and used in a later release.

Editor commands used often: `clip.trim`, `clip.move`, `clip.split`, `clip.set` (volume), `clip.fade`,
`clip.remove`, `clip.soundType`, `track.set`, `transition.add/set/remove`.

## IDs you must not mix up

- **media id** (`film.media[].id`): the recorded video file.
- **clip id** (`film.tracks[].clips[].id`): its placement on the timeline. `export` and
  `dialogue_track` want the **clip id**; a media id answers "Clip not found in this browser project."
