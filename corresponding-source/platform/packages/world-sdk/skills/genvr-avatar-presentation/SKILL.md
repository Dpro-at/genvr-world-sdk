---
name: genvr-avatar-presentation
description: Control Genvr SDK avatar gestures, facial expressions, imported GLB motions, screen effects and right-side notification or rich cards through the existing Studio tools and present_avatar executor, and edit the character itself (body, height, muscle, fat, face shape, colours, view modes such as skeleton, muscles and fat) with avatar_studio. Use when animating or editing an existing character, coordinating presentation with a reply, or integrating a host event stream.
---

# Genvr avatar presentation

Use the existing character, its skeleton and the current Studio workspace. Do not create another viewer or floating controls panel. Manual tools and model calls share `present_avatar`. Presentation is optional: use a gesture or expression when it improves the response, without forcing markers into every reply.

## Find the actual capabilities

- Call `get_studio_capabilities` first on standalone MCP. `list_avatar_motions` searches native IDs and optional host catalog metadata configured through `GENVR_MOTION_CATALOG`. File discovery does not attach the live viewport.
- `TOOL_DEFINITIONS` contains the current `present_avatar` JSON schema and available Core animation IDs. Inspect it instead of guessing names.
- Studio's assistant has this tool through its host adapter. The standalone file-only MCP server cannot animate an absent viewport; it reports presentation unavailable. `get_avatar_guide` retrieves this guide without creating a world.
- A custom host attaches a live controller with `session.attachPresentation(handle.execute, handle.controller.describe)`. The description lists imported motion IDs and their targets. Use only IDs loaded in the current viewport.
- `self` means the currently visible character editor stage while Avatar is open, or the local world character otherwise. Other targets are host agent IDs supplied by the host; internal runtime IDs are prefixed `host-agent:` by the adapter.

## Use the existing tool locations

| Function | Studio location |
|---|---|
| Core gestures | Items → Moves; Avatar → Moves |
| Imported motion-only GLB files | Items → Moves; Avatar → Moves |
| Facial expressions | Avatar → Moves → Facial Expressions, in the same card grid |
| Screen effects | Items → Effects |
| Notification previews | Items → Notifications |
| Rich card previews | Items → UI cards |
| Body, height, muscle, fat, face shape, hair | Avatar → Look, Shape, Face; MCP `avatar_studio` set |
| Colours | Avatar → Colours; MCP `avatar_studio` set colors |
| Skeleton, muscles, fat and other views | Avatar → View ▾ on the stage, right-click the avatar; MCP `avatar_studio` view |
| Favourite moves, idle | Avatar → Moves (★, Use as idle) |

Notifications and cards enter from the right of the room/background viewport. They are screen-space displays, not objects attached to the character's head. Keep the original card styling while using the existing category docks for controls.

## Tool calls

Arguments are `{ "event": { ... } }`. All durations are milliseconds, from 200 to 60000, default 5500. Calls are transient and do not modify world files.

```json
{"event":{"kind":"expression","target":"self","expression":"thinking","duration":3000}}
```

Expressions: `neutral`, `smile`, `angry`, `sad`, `surprised`, `thinking`. Use restrained transitions. Missing model face morphs cannot be invented: mesh bodies need compatible morphs; generated humans use drawn face controls; the standard robot uses independent screen eyes (round, with pupils and lids that blink and follow the viewer), brows and mouth; other block bodies have a simpler mouth response.

```json
{"event":{"kind":"animation","target":"self","animation":"genvr.core.animation.wave","duration":4000}}
```

Confirm the animation ID in `TOOL_DEFINITIONS` or `PRESENTATION_ANIMATIONS`; the example ID must not substitute for capability discovery. A rejected animation is not a successful gesture. Both gestures and expressions restore idle/neutral after their deadline.

```json
{"event":{"kind":"effect","effect":"rain","enabled":true,"intensity":0.4,"duration":6000}}
```

Effects: matrix, emoji, snow, fireflies, starfield, rain, fire, lightning, aurora, glitch, scanlines, hologram, vignette, confetti. Screen effects are separate from saved world weather. Respect the viewport's reduced motion handling. Disable an effect with `enabled:false`; `{"event":{"kind":"clear"}}` clears the active presentation.

```json
{"event":{"kind":"notification","notification":{"type":"task","title":"Export ready","body":"The host confirmed that the export completed."}}}
```

A notification is a display, not proof of an external event. Use actual host data for app, payment and stock notifications. Do not invent prices or state that a terminal command, reply, approval or biometric verification succeeded because its card appeared. Host callbacks perform actions and report their outcome. `sourceId` identifies the host event for those callbacks.

Rich cards use `{kind:"card", title, duration, spec:{root,elements}}`. Elements have `type`, `props`, `children`. Choose existing card types and bounded JSON data; never send executable HTML or JavaScript. A chart's input is data supplied by the host, not a market feed.

## Import realistic old motions

Use `Import GLB motion` to load a self-contained motion-only GLB, at most 16 MB and two minutes. The importer maps source bones to the current body's joint map, retains target proportions, removes horizontal root travel and returns a transient `motion:*` ID. Do not replace a captured motion with a loosely similar procedural gesture and claim equal realism. Load and compare the real source motion.

Verify rest posture, shoulders/elbows, finger direction, hip height, foot contact and transitions on the current body. A motion can be structurally compatible yet need artistic correction. Reimport after changing to another viewport or rebuilding the target body; an ID alone does not transfer the loaded clip. Keep character geometry, clothing and motion data as distinct assets.

Character recipe editing is separate from this presentation tool: use `avatar_studio` (below). Do not claim that `present_avatar` or `avatar_studio` creates new meshes, designs clothes or runs a 3D generation model.

## Edit the character: avatar_studio

`avatar_studio` changes the same character a person edits in the Avatar tab (tabs Look · Shape · Face · Colours · Voice · Saved). It needs a live Studio; the call opens the Avatar tab. Always start with `{"action":"inspect"}`: it returns the current recipe, view, shading, playing clip, facts (height in metres, bones, current expression, `expressionSupported`) and the saved characters.

- `set` merges `recipe` parts into the current recipe (one level deep inside objects, so `{"shape":{"muscles":{"biceps":0.5}}}` keeps the other muscles). The result is validated; out-of-range values are refused with the reason.
- Bodies: pick `robot` (the Standard robot, the default for new characters) or `human` (Anime body), or a body of My characters; `inspect` lists them as `pickableBodies`. `classic`, `simple`, `starter`, `anime-boy` and `warrior` are hidden: refused as a new choice, but a character already on one keeps it.
- Shape: `height` 0.85–1.15, `weight` 0.75–1.35, `scale` 0.6–1.6, `anime` 0–1, `muscle` −1–1 (overall), `fat` 0–0.85 (healthy range only), `fatPattern` −1 (lower body) .. 1 (belly), `definition` 0–1.
- `shape.muscles` (each −1–1): neck, shoulders, chest, traps, lats, biceps, triceps, forearms, abs, obliques, waist, lowerBack, hips, glutes, quads, hamstrings, calves, hands.
- `shape.fatRegions` (each −1–1): belly, waist, hips, buttocks, thighs, upperArms, forearms, calves, face, chin.
- `shape.face` (each −1–1, generated human bodies only): eyes eyeSize, eyeOpen, eyeSpacing, eyeHeight, eyeTilt, eyeFold, eyeDepth; brows browHeight, browAngle; nose noseSize, noseWidth, noseLength, noseBridge, noseTip, nostrils, noseDepth; mouth mouthWidth, mouthHeight, upperLip, lowerLip, mouthCorners; cheeks cheekVolume, cheekBones, cheekInner; jaw chinWidth, chinHeight, chinForward, jawWidth; head headWidth, headLength.
- `colors` (skin, hair, top, bottom, shoes…), `hair`, `body` and `animations` (`idle` = the move it stands with, `emotes` = up to 16 favourite moves, the ★ list in Avatar → Moves).
- `view` shows the body as `normal`, `first-person`, `skeleton`, `skeleton-mesh`, `muscles` (red), `fat` (yellow), `wireframe`, `clay` or `normals`; `shading` is `smooth` or `flat`. Views change only the display, not the recipe.
- `expression` shows `neutral`, `smile`, `angry`, `sad`, `surprised` or `thinking` on the face. It is refused when the body has no face controls; say so instead of claiming it worked.
- `play` plays a move id (from `list_avatar_motions`); `reset_shape` returns the shape to normal; `save` keeps the character in this browser; `export` returns the recipe JSON.
- `undo` / `redo` step through the character's edits (a slider drag is one step), the same as Ctrl+Z / Ctrl+Y on the Avatar tab.

```json
{"action":"set","recipe":{"shape":{"muscle":0.4,"fat":0.1,"muscles":{"shoulders":0.6},"face":{"eyeSize":0.3}}}}
{"action":"view","view":"muscles"}
{"action":"expression","expression":"smile"}
```

Show the change to the person (a view or the face close-up) and describe what changed; do not save or overwrite their saved character unless they asked.


## Existing filming MCP

The SDK forwards the existing platform filming tools when its operator configures `GENVR_HOST_MCP_URL` and `GENVR_HOST_MCP_TOKEN`. First inspect `get_studio_capabilities`, then `list_capture_sessions` for the host place. Use `set_camera`, `capture_photo`, `record_video`, and `get_capture` with the returned session ID. For editing, call `studio_action` with operation `{ "kind": "commands" }` before issuing commands or batches. These are the same editor operations as the Filming workspace. A local file-world ID is not a platform place ID. Do not claim a recording, render or edit succeeded until the host job reports success.

## Made motions in the game (board M19)

Motions made in the Motion lab (Pose and keys) go to **My motions › Made in the Lab** when a version is saved (or with `motion_lab` `made_to_moves`). Use them in a project through `avatar_studio`:

- `moves_mine` — the made motions (newest version of each: id, name, version, score, whether it passed the course, how fast its feet travel, loop, shareable) and where this project uses each.
- `move_use { motion, slot: 1–8, once? }` — the player's key 1–8 plays it (once by default; `once: false` loops until the player moves). One move per key; a new one takes the key.
- `move_use { motion, replaces: Idle | Walk | Run | Jump }` — it plays instead of that base move for this project's avatar only. Walk and Run take only a loop that travels (its feet give at least 0.3 m/s) and passed the course; Idle needs a loop. The answer explains a refusal: fix the motion in the Lab, do not retry.
- `move_unuse { motion }`, `move_preview { motion }` (plays it once on the avatar).

In Test world and play: keys 1–8 and the move bar; controllers: D-pad 1–4, hold LB + D-pad 5–8. Other players see a made motion only when the world carries it: only shareable ones (made in the lab, not from Mixamo or a video, on a GenVR character) may go with a published world, and the owner confirms the publish. Never publish for the owner.

## Private user library

Use `user_avatar_library` with `action: "list"` to discover private character and motion IDs. Paginate with `offset` and `limit` (maximum100). Use `action: "assign"`, `target` and an available character `id`; `id: null` restores the default. Use `action: "play"` with an available private motion ID for playback. Use `action: "delete"` with an `id` only when the owner asks to delete that imported character or motion: list first and use the returned ID. The Studio shows the owner a confirm and the tool waits for the owner's Delete or Cancel; it answers `result: "deleted"` or `result: "cancelled"` (also when nobody answers in time). Nothing is deleted without the owner's click, and built-in bodies cannot be deleted. When the answer lists `targets`, tell the owner that the Standard robot now replaces the deleted character for them. Requires an attached Studio host. Standalone file-only MCP reports it unavailable. Never infer permission to publish or redistribute private files. Imported facial morph support varies; skeletal playback does not imply facial expression support.


## Local live Studio and voice

Run genvr-studio and configure the MCP process with the exact GENVR_STUDIO_CONNECTION file printed by it. Never request or expose the token. Call list_studio_sessions, select_studio_session and inspect_studio before acting. Live sessions execute the existing editor and private library; file-only sessions have no viewport. Local filming uses the returned local place/session IDs, not an authenticated platform account.

Call avatar_voice with action models and voices before choosing IDs. Install downloads only a supported optional model and returns a job ID; poll action job. Use demo with a discovered demoId to download a publisher-provided evaluation reference, or clone with an authorized PCM WAV base64 sample and consent:true. Never infer consent from an arbitrary public recording. Assign with projectId/target/voiceId; speak with text/language/voiceId. Both Arabic and English are supported by the current model. A cloned profile stores a reusable reference; this is zero-shot conditioning, not model training. Speech jobs generate local audio and then play it in the selected live viewport. Poll until done; report failures honestly. Use recordings/audio for private export and replay for existing clips. Use playback with command play/pause/stop/seek/rate/volume for player controls. Voices and models are not public package assets. Respect model and sample provenance; do not claim all providers, microphone conversations or untested voice quality are implemented.


Use `avatar_voice` action `design` with language, voiceType (`male`, `female`, `child`), text and optional description to audition a synthetic draft. Poll the job; its result.id is the audioId. Call `save_design` with audioId/name only after selecting the preview; this does not assign an avatar. Call `assign` separately with voiceId/projectId/target. `export_voice` returns a reference WAV with embedded language/type/model metadata. Discover and install both Voice Designer and Multilingual Voice before design; the designer supplies an English reference and the multilingual model synthesizes the selected output language. Child-style is a synthetic cartoon trait, not an age-verified speaker. Listen before claiming a specific timbre or accent.

## Avatar Live

Use the separate Avatar Live toolbar action for direct display presets. `present_avatar` kind `display` opens/closes the viewer and selects layout, framing and background. Layout IDs: large, desktop, browser, compact, banner, circle, watch. Wait until inspect_studio reports a ready avatar before sending motion/expression commands. Native and private host motions use their existing IDs; do not rename proprietary assets into public package content. Speech remains on avatar_voice with the current saved voice assignment. Notifications/cards have a reserved right-side area.

Share is a separate toolbar action. `share_studio` action inspect reports whether a real hosting adapter exists; open shows its controls. Create only with explicit user authorization, a request for the current project, and the host adapter. Public/private/invite rules, passwords and joining are enforced by the host server. A local iframe is not a public share, and access controls must never be claimed operational without this adapter.

For a saved-world background, inspect `availableWorlds` via `inspect_studio`, then use `present_avatar` display with `background: "world"`, `worldId`, and optional `worldSpot: {position,target,player}` XYZ objects. Only use permitted IDs. The UI supports read-only WASD/mouse exploration and Use this spot; neither operation edits the source project. Reset worldId/worldSpot to null to use the current live world view.
