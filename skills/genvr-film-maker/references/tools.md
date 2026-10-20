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
| `record` | optional `shot_id`, `settings`, `world_sound`, `live_actors`, `scene_id` | timed take with the draft cues; with `scene_id` the new shot joins that scene and the scene's own sound is used |
| `manual_record` | `action: start / stop`, optional `seconds` 1–30 (default 30) | live take: the person moves the character; `seconds` is the longest it runs; wait for stop's job before editing |
| `dialogue_track` | `cue_id`, `shot_id` (**clip id**), `language`, `start`, `append` | promotes a cue's audio + text to that language's voice + caption tracks |
| `sound_import` | `name`, audio MIME, base64 `data` (≤ 8 MB decoded) | imports at the playhead; returns `media` and `clip` |
| `lighting` | optional `lights[]` | read or replace up to four spotlights |
| `export` | optional `shot_id` (**clip id**) or `range: 'marked'`, `width` 320–3840, `height` 240–2160, optional `language`, `captions: 'picture' / 'none'` | full film, one shot or the marked In/Out; `language` keeps only that language's captions and voice (call once per language for one file each); WebM ≤ 40 MB |
| `language` | `action: 'make_missing'`, `what: captions / voices / both`, optional `languages[]` | fills what Film settings asks for: captions from the film's voice, dubbed voice for text + voice languages; returns `done`, `skipped` (with the reason) and `status` |
| `undo` / `redo` | — | one editor step each |

Film settings (set once for the whole film; read them first with `inspect` → `film.settings`):
`command` `project.settings` with any part of `{ kind: 'film'|'series', name, languages: [{ lang, level: 'text'|'text_voice' }]
(first = main language), story, shotSeconds 1–30, worldSound, roomVoices, caption: { size, place, inExport },
titles: { intro, episodeCard, credits, creditsText }, director: { autonomy: 'auto'|'end'|'each' } }`. Parts merge; it is one
undo step. Video size is `project.size`. Titles and the AI director are stored now and used in a later release.

Cast and script (`command`; read `film.cast`, `film.lines`, `film.languageStatus` with `inspect`):
- `cast.add { name, actor ('self' = my avatar, or a scene actor id), linesBy?: { kind: 'agent', name } | { kind: 'owner' }, role?, personality?, arc? }` → character id.
- `cast.set { cast, ...same fields }`, `cast.voice { cast, lang, voice: { kind: 'ai', voiceId, name } | { kind: 'person', name } | null }`,
  `cast.remove { cast, confirm: true }` (confirm is needed when it has lines; its lines go too).
- `line.write { cast, text: { ar: '…', en: '…' }, episode? }` and `line.set { line, text?, episode? }`: an agent may write **only**
  for characters whose `linesBy` is an agent; every agent write is a draft. `line.approve` is owner-only (MCP refuses it).
- `line.place { line, lang, start?, seconds? }`: an **approved** line becomes a draft cue of the next take (then `dialogue_voice`, `record`).

Scenes and links (`command`; read `film.scenes`, `film.links` with `inspect`):
- `scene.add { name, place?, when?, instructions?, who?: [{ cast, job }], spots?: [{ name, x, z }], sound?: { mode: 'world'|'own', ambience 0–100, steps 0–100 }, episode? }` → scene id;
  `scene.set { scene, ...any of those }` (sound merges), `scene.move { scene, index }`, `scene.remove { scene, confirm }`.
- `scene.shot { scene, media, remove?, index? }`: a recording (media id) belongs to one scene; record with `scene_id` to do it at once.
- Write exact cues with the scene's named spots: put `at` / `to` on the spot's x/z so the sheet shows the spot name.
- `link.add { from: { media, at }, to: { media, at }, kind: continue|flashback|back|jump|loop, returnAt? (flashback: required), look: cut|blur|fade|old_film }`,
  `link.set { link, ... , returnAt: null to clear }`, `link.remove { link }`. Links are stored and shown in Workflow; playback through links comes later.

AI suggestions (the owner asks in the shot panel: read `film.requests` with `inspect`):
- Answer with `suggestion.add { kind: transition|colour|effect, clip (clip id), label, request?, steps: [{ id, args }] }`.
  Steps may only be transition.add/set/remove, look.apply, effect.add/set/remove, property.set/clear, clip.blend, and each
  step's `args.clip` must be the same clip. Nothing changes until the owner keeps it; keep/drop (`suggestion.mark`) is
  owner-only. `suggestion.ask` and `suggestion.forget` exist too.
- Voice takes of a person (`film.takes`, without audio) are recorded, kept and deleted only in the Studio.
- Camera and lights of a shot: `set_camera` and `lighting` as before; "Camera of this shot" = `media[].camera`.

Series and episodes (`film.episodes`; scenes have `episode` = the episode's place, from 1):
- `episode.add { title, outline?, cast? }`, `episode.set { episode, ... }`, `episode.remove { episode, confirm }` (its scenes move to episode 1).
  Read the series story (`film.settings.story`) and the episode outline before writing lines.

AI director (`film.director`) — you direct with the same commands as everything above, and report each step:
1. The owner starts a run in the Studio (or you `director.start { idea, kind, episodes, minutes, autonomy }`).
2. `director.claim { agent: '<your name>' }` while it is `waiting_for_agent`.
3. For every step: `director.step { label, op, state: running|done|failed, note?, step? }` (`op` = the command or kind you used,
   e.g. `cast.add`, `line.write`, `scene.add`, `studio_action · record`). Send `op: 'finish', state: 'done'` at the end.
4. With autonomy `each` every done step waits for the owner's Approve (with `end` only the finish); the run is `paused`
   until then — check `film.director.status` before the next step. Approving is owner-only.
5. `director.pause {}` / `director.pause { resume: true }` / `director.stop {}` work for you too.
Never publish, share or upload during a run; the owner does that.

Editor commands used often: `clip.trim`, `clip.move`, `clip.split`, `clip.set` (volume), `clip.fade`,
`clip.remove`, `clip.soundType`, `track.set`, `transition.add/set/remove`.

## IDs you must not mix up

- **media id** (`film.media[].id`): the recorded video file.
- **clip id** (`film.tracks[].clips[].id`): its placement on the timeline. `export` and
  `dialogue_track` want the **clip id**; a media id answers "Clip not found in this browser project."
