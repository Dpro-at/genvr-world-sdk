---
name: genvr-film-maker
description: >-
  Step-by-step guide for making films, episodes and series scenes in Genvr Studio's Filming workspace
  through the live Studio MCP tools (or the studio assistant's same tools): choosing the actor, motions and
  expressions, writing dialogue with saved voices, recording timed or manual takes, putting several
  languages (voice + captions) on one picture, editing sound, and exporting a shot or the full film. Use
  whenever an agent films, dubs, captions or exports in Genvr (studio_action, avatar_voice,
  user_avatar_library, list_avatar_motions, present_avatar, set_camera, get_capture), and when adding a
  lesson learned while doing so.
---

# Genvr film maker

How to make a short film or a series episode in a Genvr world with the live Studio tools, from an
empty timeline to an exported video. Build the world first with `genvr-world-builder`; Build and
Filming use the same live world.

The guide has parts. Read the one you need:

| Part | File | Read it when |
|---|---|---|
| `workflow` | this file | always, first |
| `discovery` | [references/discovery.md](references/discovery.md) | every session: find all tools, how Dpro/MCP connect, update this skill |
| `tools` | [references/tools.md](references/tools.md) | choosing an operation, or an operation refuses |
| `languages` | [references/languages.md](references/languages.md) | dubbing / captions in more than one language |
| `series` | [references/series.md](references/series.md) | several scenes, episodes or a recurring cast |
| `mistakes` | [references/mistakes.md](references/mistakes.md) | before exporting, and when something looks wrong |

## What you can and cannot do

- You control the **live, already open Studio** through the host's live connection. Check
  `get_studio_capabilities`, then `list_studio_sessions` and `select_studio_session` before anything else.
  No session means no filming: say so, do not pretend.
- Characters, motions and voices come from the **host's private library** and the built-in ones.
  List them (`user_avatar_library`, `list_avatar_motions`, `avatar_voice` `voices`) and use only returned IDs.
- Private library files (characters, motions, voice references) stay on the device. Never upload,
  publish or embed them anywhere, and never claim a film may be published: publishing and licence
  questions (for example third-party character/motion sources) are the owner's decision.
- Voice generation needs the host's local voice runtime. A failed or missing voice job is not speech.
- Mouth motion is baked into the recorded picture. Changing dialogue later means recording a new take.
- Imported characters need compatible facial controls for visible mouth movement; the Standard robot
  and the built-in human support it. Several independent imported cast members are not guaranteed.

## Workflow

0. **Discover first.** Read [references/discovery.md](references/discovery.md): list the real tools,
   capabilities and editor commands, and note anything this skill does not describe yet.
1. **Connect.** `get_studio_capabilities` → `list_studio_sessions` → `select_studio_session`. Note
   `place_id` and `session_id`; every `studio_action` needs both. `inspect_studio` shows the world,
   actor, camera and `availableWorlds`.
2. **Plan the scene in one sentence per shot**: who, what they do, what they say, where the camera is,
   how long (keep shots ≤ 30 s; a series episode is several shots). Agree it with the user first.
3. **Cast.** `user_avatar_library` `list` → `assign` the character to `self` (My avatar). Change the actor
   only before recording; recorded video keeps its actor.
4. **Choose actions.** `list_avatar_motions` (query by name/category). Preview with `present_avatar`
   `{event:{kind:"animation",target:"self",animation:"<id>",duration:<ms ≥ 200>}}` and expressions with
   `kind:"expression"`. Use the returned IDs in cues.
5. **Write the dialogue.** `avatar_voice` `voices` → pick a saved voice per character and language.
   Set the cues with `studio_action {operation:{kind:"cues",cues:[...]}}` (id, actor, label, action,
   start, end, text, volume; optional `at`/`to` positions). Generate each line's audio with
   `{kind:"dialogue_voice",cue_id,voice_id,language}` and check `{kind:"dialogue_preview",cue_id}`.
6. **Camera and light.** `set_camera` presets or timed path stops; `{kind:"lighting"}` for spotlights.
7. **Close Avatar Live** (`present_avatar {event:{kind:"display",open:false}}`) — recording needs the
   rendered world viewport.
8. **Record.** Timed: `{kind:"record"}`. Manual: `{kind:"manual_record",action:"start"}` … act …
   `{kind:"manual_record",action:"stop"}`. Every operation returns a `job_id`: poll `get_capture`
   `{place_id,job_id}` until `done` **from the same MCP client process** that started it.
9. **Check the timeline.** `{kind:"inspect"}`: the new picture clip (its **clip id** and
   `startSeconds`), media, cues, sound and caption tracks.
10. **Languages (optional).** One picture, one voice + caption track per language — see
    [references/languages.md](references/languages.md).
11. **Sound.** Ambience gain with `clip.set` on `soundType:"ambience"` clips only; import music/effects
    with `sound_import`. Never change dialogue gain to fix ambience.
12. **Export.** Shot: `{kind:"export",shot_id:"<picture CLIP id>",width,height}`; full film: omit
    `shot_id`. The active dialogue language decides the exported voice and captions. Read the
    result path/MIME from `get_capture`, then report duration, size and language that were actually checked.
13. **Report honestly**: what was recorded and exported, which IDs, what failed and why. Save the project.
14. **Update the skill** with anything new you verified this session (see discovery, step 3).

## Done means

- The take exists on the timeline with sound (inspect proves it).
- Each language you claim has its own voice and caption track starting at the shot's start.
- The export file was produced and its duration/streams were checked.
- No private file left the device and nothing was published.
