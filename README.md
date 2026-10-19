# 3D World SDK 0.3.0-preview.3

Account-link support in this version requires the matching Genvr host routes and database migration 0041.
The host implementation is prepared for review; production account linking is not active until that rollout is verified.
No npm publication or account activation is part of this release. Local authoring works independently.

Standalone authoring with the same Genvr world contracts, command engine, Core Library and assistant tools.
No Agent Player dependency or integration. JavaScript is bundled; declaration dependencies are ordinary npm
packages, not private workspace packages. Download the standalone `.tgz` from the Dpro GitHub SDK prerelease,
then `npm install /path/to/3d-world-sdk-0.3.0-preview.3.tgz` (Node 24+). Run `npx genvr-studio` to open
the included Studio at http://127.0.0.1:3029. Bundled Genvr source retains AGPL-3.0-only;
the included asset credits describe their separate licenses. This preview uses the shared engine and
authoring tools and existing website Studio components. `genvr-world-demo` remains the legacy simplified
example on3028; `genvr-studio` is the creation/building/filming application.

## Preview 3 updates

The Scene inspector uses compact icon tabs: **Scene** for actor motion/paths, **Voices** for
editable dialogue and saved voice selection, and **Shot** for shot camera/re-record controls.
Voices opens by default when the host voice service is available. **Choose avatar from library**
opens the host character library directly from Scene or Voices; the chosen character replaces
My avatar. Existing scene actors are directed separately. Account characters appear only when
the host supplies them; the standalone SDK does not fabricate account access. Add a dialogue line, choose
its saved voice and language, then generate/listen before recording. Captions & dubbing opens
the existing multilingual subtitle and language voice-track tools; optional model downloads
remain separate. Each dialogue cue has one attached recording; language versions use separate
tracks/takes. Re-record for changed lip movements after changing dialogue audio.

Skinned actors no longer blur between their rest pose and animated pose in Realistic worlds.
Camera and root motion still contribute to motion blur; skeletal deformation blur is excluded
until the renderer has matching previous-frame deformation data. This does not change clips,
retargeting or the user's private libraries.

## Shared Studio

N-296/N-297: this version bundles the website's creation/style flow, BuildPanel, StudioChrome, library,
explorer/properties, environment, avatar and filming panels. First screen creates or opens a project,
not a read-only world. Small starter generation is shared with the API. The same film engine, cameras,
recording, timeline, captions, sound, colour and Story workspace are used without a fabricated account.

```ts
import { mountStudio } from '3d-world-sdk/studio';
import '3d-world-sdk/studio.css';
const studio = mountStudio(document.getElementById('studio')!);
// false means busy, failed save, or edits arrived during saving. Keep the UI mounted in that case.
const closed = await studio.dispose();
```

The default host uses IndexedDB for private local worlds and a separate `sdk-studio:<project-id>` film
namespace, preserving website account keys. Autosave, explicit save, open and export use validated runtime
snapshots, including undo/redo and loaded height/voxel/raster-field pages. `.genvr-studio` version1 is a local
format (64MB,10000items); `.genvrfilm` carries films and recorded media. Export both for a complete backup.
Existing format1 `.genvr-world` files can be imported; Studio snapshots cannot be uploaded through the
platform's format1 replay endpoint. Invalid/incomplete imports never replace the current saved project.

`mountStudio` accepts `storage: StudioStorage`, `model: ChatModel` and `forceWebGL`. The standalone server
serves bundled assets and workers automatically. Embedded hosts must serve `dist/studio-assets` at `/`,
preserve bundled chunk/worker/font relative paths, and load the stylesheet. One mounted Studio per module
is supported. Device iframe previews require default browser storage and a page that mounts this Studio;
custom-storage hosts receive an explicit unsupported-preview error rather than a different saved world.
Play-view changes in Place settings take effect when reopening. Undo history is session-local.

Local projects must support creation, editing, save/open and export without a Genvr account.
Host adapters supply storage and model access; embedded project assets are resolved locally. The default
Studio disables its platform API transport, publish/account/MCP controls and remote creator/free catalogs.
Local runtime edits and film exports require no account. Optional model/map/speech tools retain their own
network requirements and may download large model weights; optional speech/translation/dubbing weights are
not bundled or downloaded at startup. The licensed MediaPipe face-landmarker model is included for avatar tools.
Permission controls must be backed by the relevant host/server checks, not simulated by the UI.
Publishing, collaboration and account services do not become offline services merely by packaging
their interfaces. Agent Player integration, production account-link activation and npm publication
remain deferred. Existing released archives must not be silently replaced.

```ts
import { WorldSession, saveWorld, browserStorage, GenvrClient } from '3d-world-sdk';
const world = WorldSession.create({ title: 'My garden' });
await world.tool('place_item', { itemId: 'genvr.core.bench', x: 5, z: 8 });
await world.tool('set_sky', { preset: 'sunset' });
await saveWorld(world, browserStorage(localStorage));
// Or write world.serialize() to your own local file. It contains no host credentials.
const client = new GenvrClient('https://api.genvr.net'); // existing authenticated cookie, allowed origin
const draft = await client.createDraft(world); // retain ID before upload, so retries do not create duplicates
const uploaded = await client.uploadWorld(world, { id: draft.id, baseVersion: 0 });
// Publication is a separate explicit action requiring content answers and access settings.
```

## Build worlds for games, films and social spaces

Use the SDK to create and edit environments for games, film sets, meeting rooms, exhibitions,
classrooms and other interactive experiences. The same validated Genvr authoring tools can place
items, build rooms, shape supported terrain, change the environment and store game rules/scripts.
Agents can generate and revise these worlds, save them locally, preview them and explicitly submit
them to Genvr. Local asset packages can carry creator-owned models.

| Use | Available in this package | Additional host or Genvr integration |
| --- | --- | --- |
| World and room design | Creation/style UI, shared Studio tools, local save/open/export and undo/redo | Optional model or custom storage adapter |
| Games | Environments and validated game/rule/script authoring data | Game execution, player controls and authoritative server hosting |
| Films | Shared shooting, camera, recording, timeline, captions, sound, colour, Story and export UI | Remote actors/collaboration need a platform host; optional speech tools download models |
| Avatars | Shared character panels, bundled licensed base data, local avatar preview and player movement | Account-wide identity persistence needs a platform host |
| Meetings and social rooms | Build the room and save/publish its world | Multiplayer, participants, voice/video, permissions and a server |

The preview does not include the multiplayer service or meeting application. A downloaded local world is not automatically a playable game, recorded film
or live meeting. Platform publication requires an authenticated account and existing content/access
checks; store item submission enters review. Agent Player integration is deferred.

Use `world.generate(prompt, model)` with your own `ChatModel` adapter or call `world.tool(name, args)` from
any agent. Exported `TOOL_DEFINITIONS` describe the same validated authoring tools as Genvr. Models cannot
publish, submit store items or spend money through those tools. `GenvrClient.submitItem(...)` is an explicit
creator action for a licensed self-contained GLB; the existing store queue, quotas and moderation still apply.
After upload, map local IDs to returned platform item IDs in `uploadWorld`'s third argument.

For MCP-capable agents, run `genvr-world-mcp` (Node 24+) as a stdio MCP server and set `GENVR_WORLD_DIR`
to the local folder you want it to use. It exposes create/open/save plus the shared authoring tools, without
Genvr credentials or publication tools. JavaScript hosts use the explicit authenticated client for publication.

Browser preview is an optional subpath:

```ts
import { previewWorld } from '3d-world-sdk/runtime';
const preview = await previewWorld(world, document.getElementById('preview')!);
// Refresh preview after editing; dispose it before replacing it or unmounting.
preview.dispose();
```

The local model and file adapters need no Genvr account. Studio includes the website's licensed public models,
materials, avatar data, image previews and decoder files, with a generated SHA256 inventory and license notices.
It does not include purchased store packages or user uploads. The legacy example uses procedural benches and a read-only preview.
Copy the package's `assets/materials` directory into your host's public `/materials` path for the two eager
textures; the demo server does this mapping automatically. See `assets/CREDITS.md`.

Format 1 stores creation settings plus a bounded command journal (500 commands, 8 MB total, 2000 instances),
with optional embedded item files. Import replays commands server-side into an owned private draft, refuses
stale versions and forces the target ID/access/version. Raw external world snapshots and raster terrain field
pages are unsupported in format1; Studio uses its separately versioned local snapshot format. Terrain and voxel edits made through supported commands round trip.
Paths/polygons are limited to 128 points, with a cumulative conservative terrain work budget checked before
replay. A package's size tier cannot be changed through its journal; create a new package at that tier instead.
Undo/redo uses validated earlier journal snapshots, not raw terrain restoration commands. Very large builds
may hit these preview limits; they are refused without replacing the saved local world or target draft.
Multiplayer/server scripts need a server host; the preview is not a multiplayer server or script executor.

In this repository: `pnpm --filter @genvr/world-sdk... build`, then
`pnpm --filter @genvr/world-sdk demo` (http://127.0.0.1:3028). Production credentials/cookies require an allowed
host origin; the demo never fabricates a production session. `pnpm --filter @genvr/world-sdk pack:standalone`
produces the independent archive in `dist`. No npm registry publication is performed.

Version policy (N-296): creation, Studio, filming, runtime, tools and contract improvements belong in
shared source and must update the package build, tests and release record in the same work item.
Do not deliver those improvements only in the website or QA host. Prepare a new versioned package
when its shipped behavior changes; publication still needs the current release authorization.
Unrelated platform billing or administration changes do not imply bundling those services.
Consumers pin a version. Package format changes
need an explicit migration, never silent reinterpretation. This 0.x preview may change APIs between minor
versions; users must retain their original saved files.

Publication authentication uses the existing Genvr session, not MCP tokens. An external website requires
an allowed origin and compatible browser cookie policy; the SDK does not change server CORS/auth defaults.
Server hosts can inject an authenticated fetch implementation. If an import commits but its response is lost,
read the target world's latest version with `client.readWorld(id)` before retrying: a stale retry returns409
and never overwrites it.

## Connect a host to a Genvr account (0.2.0)

Agent Player integration is not included. Any CLI, agent or local host can use the account-link adapter:

```ts
import { GenvrAccountLink, GenvrClient } from '3d-world-sdk';
const link = new GenvrAccountLink('https://api.genvr.net');
const request = await link.start('My world tool', ['worlds:read', 'worlds:write']);
// Show request.userCode and open request.verificationUri in the user's browser.
// User signs in to Genvr, compares the code and explicitly approves the displayed scopes.
// Poll at request.interval seconds, stopping at expiresIn, denial or cancellation.
const result = await link.poll(request);
if (result.status === 'linked') {
  // Store result.account.accessToken in the host's secure credential store.
  const client = GenvrClient.linked('https://api.genvr.net', result.account.accessToken);
  const owner = await client.linkedIdentity();
  // Existing createDraft/readWorld/uploadWorld calls now use the scoped account grant.
}
```

This is a Genvr JSON device-link API informed by RFC8628, not a general OAuth/OIDC authorization server. App names are self-declared, not verified identities. Display the code in the initiating host and compare it in Genvr; never approve unsolicited links. No custom browser callback is needed: the host polls and returns to its linked state automatically. Tokens expire after 30 days, have no refresh token, and must be relinked if expired. A consumed token response cannot be retrieved again; restart the link if the response is lost.

Scopes: `worlds:read`, `worlds:write` (private draft/import), `worlds:publish` (separate explicit publication), `items:submit` (existing store review). Request only what the user needs. Tokens cannot edit profiles, access payments/staff tools or call arbitrary API routes. Existing world ownership, tier limits, rights/content checks and item moderation still apply. The user can revoke a grant at Settings → Linked accounts → World apps; a host can call `client.disconnect()` to revoke itself. Revocation takes effect on the next API call.

Local/private save requires no account link. Linking never publishes a world or approves an item automatically. Portable world files never include credentials. Avoid printing tokens, storing them in world files, browser URLs or source control. Untrusted JavaScript with access to the host's credentials can use its grants, so keep secrets in the host's protected storage.

## Avatar presentation in Studio

Studio uses the existing tool categories: **Items → Moves** contains imported motions and facial expressions; **Items → Effects** contains screen effects. **Avatar → Moves** also exposes motion import and facial expressions on the character editor's own stage. Notification and rich-card previews are under **Items → Notifications / UI cards**. The viewport contains only the display layers, with cards entering from the right. There is no separate floating presentation sidebar.

`mountStudio(container, { presentation })` accepts an optional event subscription and host action adapters. Set `presentation.enabled` to `false` to disable the feature. The existing assistant has an optional `present_avatar` tool for animation, expression, effect, notification, card and clear events. The same validated executor handles manual controls and host events. Presentation is transient and is not saved into a world or project.

```ts
mountStudio(container, {
  model: hostChatModel,
  presentation: {
    subscribe(projectId, emit) {
      return hostEvents.subscribe(projectId, event => emit(event));
    },
    actions: {
      approve: notice => hostActions.approve(notice.sourceId),
      reply: (notice, text) => hostActions.reply(notice.sourceId, text),
      draftReply: notice => hostActions.draftReply(notice),
    },
  },
});
```

Hosts retain application authorization and actual action execution. A displayed app, stock, terminal or biometric card does not connect to that service or perform an action. Preview cards and charts use example data. Approval and reply failures remain visible instead of reporting success.

For an existing room/background viewer, `mountAvatarPresentation` from `3d-world-sdk/studio` mounts just the display layers over a positioned container. It returns `execute`, `controller` and `dispose`. A local `WorldSession` can use the same tool path with `session.attachPresentation(handle.execute, handle.controller.describe)`; call the returned detach function when closing the view.

Motion import accepts self-contained motion-only GLB files up to 16 MB. It retargets the source skeleton to the current body's joint map, preserves the target's proportions, removes horizontal root travel, and registers a transient `motion:*` ID. The imported ID is available to the assistant and manual controls. Importing a motion does not replace the avatar or add its source binaries to the package. Motions need to be imported again for a different viewport or rebuilt body. The original avatar's face morphs are required for its full facial detail; generated bodies use their drawn facial controls and block bodies use a simpler mouth representation.

The packaged skill is `skills/genvr-avatar-presentation/SKILL.md`. MCP clients can read the same guide with `get_avatar_guide`; this read does not require a world or a live viewport.

### Host-supplied motion library

Studio accepts `motionLibrary` with ordered entries containing `id` (`motion:...`), `name`, `category`, `loop`, and an async `load(): Promise<ArrayBuffer>` returning a self-contained motion-only GLB. The existing Moves dock displays the catalog with search, category selection and pagination. The same IDs are available to avatar presentation commands. Each compatible avatar retargets the source motion to its own skeleton; finger animation requires matching finger joints. Character preview and world playback share the catalog.

```ts
mountStudio(container, {
  motionLibrary: {
    entries: [{
      id: 'motion:library_wave', name: 'Wave', category: 'Gestures', loop: false,
      load: async () => {
        const response = await fetch('/my-private-library/wave.glb');
        if (!response.ok) throw new Error('Motion unavailable');
        return response.arrayBuffer();
      },
    }],
  },
});
```

Hosts may explicitly map native clip names through `motionLibrary.replacements`, for example `{ Wave: 'motion:library_wave' }`, after validating the replacement on their avatars. Original native clips remain available for restoration when the library is removed. Downloaded third-party motion/model assets are not included in this SDK; the host supplies its own assets and provenance.

### Standard robot and facial expressions

The Avatar workspace includes a separate **Standard robot** body on the standard 52-joint rig, with rigid shells, articulated finger segments and a screen face. Human characters remain separate recipes. Save a character before changing bodies, then restore it from **My characters**. Use **Moves → Facial Expressions** for Neutral, Smile, Angry, Sad, Surprised and Thinking; expressions and body motion can run together.

The standalone MCP server exposes `get_studio_capabilities` and `list_avatar_motions`. Configure `GENVR_MOTION_CATALOG` with a private catalog JSON path to discover additional host motion IDs, names and categories. The catalog tool reads metadata only and does not publish source files. A standalone file session has no connected viewport, character editor or account. Studio UI filming/editing and platform filming connections do not automatically become available through this server; inspect the reported capabilities before calling them.


The packaged MCP also exposes the established filming tools: `list_capture_sessions`, `set_camera`, `reset_camera`, `get_camera`, `capture_photo`, `record_video`, `get_capture`, and `studio_action`. Configure `GENVR_HOST_MCP_URL` and `GENVR_HOST_MCP_TOKEN` for an authorized existing host, then use that host's connected Studio filming session. This adapter forwards the same shared operation schemas; it does not create a second editor or recorder. Use `studio_action` with `{kind:"commands"}` to discover editing commands and their current availability. No host credentials are bundled or inferred from the browser.

### Private character library

Enable `mountStudio(element, { userLibrary: { scope: "my-private-library" } })` to import personal FBX/GLB characters and assign them to the current avatar or host agents. Files stay in the browser profile, separately from world exports. Back up original files; browser storage is not a cloud account. The attached Studio assistant uses `user_avatar_library` to list, assign and play private assets. Standalone MCP without that host returns an unavailable result. Host motion providers remain available through `motionLibrary`; no third-party character or motion data is bundled. Imported rigs and facial morphs vary; compatibility is not guaranteed for arbitrary assets.


## Optional local avatar voice

The local Studio includes an authenticated, loopback-only voice service. The first supported provider runs on Apple Silicon with Python3.12 and the optional packages in `voice-requirements.txt`. Configure `GENVR_VOICE_PYTHON` with that environment's Python executable before starting `genvr-studio`. No desktop installer, Python runtime, voice recording or model weights are bundled.

Open **Avatar voice** from the microphone tool. The model catalog reports supported platforms, languages, cloning, download size and installation state. Download the model on demand (about3.2GB including its tokenizer); select a saved voice or create a private profile from an authorized3–30second recording. Arabic and English are supported. Publisher demo references can be downloaded separately for private evaluation, with provenance retained. Their recordings are not included in the public package. Profiles, assignments and generated WAVs stay under `~/.genvr/voices`; downloaded weights stay in the dedicated `~/.genvr/voice-models` cache. Generation uses cached weights offline after installation.

Assign a profile to a project speaker, enter text and choose **Generate and speak**. The viewport player displays a waveform, live audio level and play/pause/seek/volume controls, plus speed, stop and WAV export. Mouth shapes follow the actual audio; a body without facial controls can play speech but cannot display mouth animation. Playback is routed into filmed audio when world sound recording is enabled. This is audio-driven mouth sync, not phoneme alignment.

For MCP, set `GENVR_STUDIO_CONNECTION` to the connection file printed by the local Studio. Discover/select the real session with `list_studio_sessions` / `select_studio_session`. Use `avatar_voice` actions `models`, `install`, `voices`, `demo`, `clone`, `assign`, `speak`, `job`, `recordings`, `audio`, `replay`, `playback`, `prepare_previews`, `remove`, `design`, `save_design`, `export_voice`. Installation and generation return asynchronous job IDs. Poll `job` until done; a failed job is not successful speech. `playback` supports `play`, `pause`, `stop`, `seek`, `rate` and `volume`. The same voice tool is available to an attached Studio assistant. File-only hosts correctly refuse voice execution.

Speech generation is separate from speech recognition and a conversation model. This preview does not claim a working microphone conversation loop or support for every engine in other voice applications. Desktop hosts can consume the catalog and manage optional runtime installation; that installer is outside this SDK.

Models can be removed from the Models panel and downloaded again. Removal is limited to SDK voice weights in its dedicated cache; named voices, reference samples and generated recordings are preserved. `prepare_previews` caches matching-text samples for all23 languages. Each language card shows its native name and example text, with direct playback from that local cache.


### Voice generator and reusable profiles

Choose a language, Male / Female / Child-style, voice character and preview text in **Voice generator**. **Generate preview** auditions a synthetic voice; **Save to voice library** creates a named profile without changing any avatar assignment. Select **Use** in the library to assign the saved voice independently to a project speaker. Language, requested voice type and speech model remain visible. Exported reference WAVs include the profile metadata in a standard RIFF INFO comment.

Voice Designer is a separate optional Apple Silicon model (~2.31 GB, Apache-2.0). It designs an English reference; Multilingual Voice then speaks the requested language, including Arabic. These are requested synthetic character traits, not speaker-age or gender verification. Audition results before saving: accent and timbre can vary across languages. Both models are needed for this generation pipeline; named profiles subsequently need only Multilingual Voice. Removing Voice Designer preserves saved profiles and recordings.

### Available world starters

New worlds offer only **Simple**, **Realistic** and **Voxel**. Simple and Voxel support Small starter and Empty; Realistic additionally supports Valley, Island, Plain and Mountains. Unavailable styles are hidden, and unsupported style/starter pairs are refused instead of silently producing a different world. The seeded generators retain the selected terrain kind, its water rules and matching asset palette; changing the seed varies placement within those rules. Stored worlds remain importable.

The item library always filters against the current runtime world style and has no All styles override. Shared items remain available when their manifest explicitly supports that style. The assistant's core catalog search, placement and world generator follow the same style boundary. Generated Realistic landscapes cannot switch to a style that lacks their assets.


### Scene dialogue with saved voices

In **Filming → Scene inspector → Voices**, add a dialogue line, choose a saved character voice and output language, then select **Generate scene dialogue**. The generated WAV is copied into the film project, with voice name, language, requested type and model metadata on the cue. The line's duration sets its cue end; next-take length expands when needed. A line that cannot fit a recorded shot is refused instead of silently truncated. **Listen to scene line** previews the attached audio and mouth motion. Save the draft cues to an existing shot or record a new take.

During capture, the avatar mouth follows the scheduled cue audio. The resulting mouth motion is baked into the video; film preview/export mixes the separate dialogue asset at its cue time, retaining trim, split, volume and ducking behavior. Editing dialogue after capture requires re-recording the shot to update its baked mouth motion. Imported characters need compatible facial controls for visible mouth movement. The standard robot supports this path. Audio and model files remain private; exporting a film includes its audio, not model weights.

MCP uses `studio_action` operations `dialogue_voice` (`cue_id`, `voice_id`, `language`, optional `shot_id`) and `dialogue_preview` (`cue_id`, optional `shot_id`). Discover saved profiles with `avatar_voice` first. `inspect_studio` with `include_checks:true` reports the actual world style/kind and placement checks. `get_design_guide` exposes the bundled world-building skill in six parts: workflow, tools, sizes, games, scripts and mistakes. Read capabilities before using platform-only examples in that guide.

The **Island** starter is now a deliberately small shore scene: sea, sand, two palms, two rocks, a shell and an original wooden rowboat. The boat has a level beached berth and is editable scenery. Automatic woods are off; the creator can extend the landscape and add items from the style-filtered library. Existing saved worlds are not rewritten by this change.

Built-in avatar body choices are saved in the local Studio project and restored on reopen. Voice assignments remain independent private per-project/per-speaker mappings; importing a world as a new project does not implicitly copy another project's voice assignment. Voxel ground and heightfield ground require separate worlds; changing a visual style never silently converts their terrain formats.

### Alternate dialogue languages in one scene

Keep one picture clip. `studio_action` with `kind: "dialogue_track"`, `shot_id`, `cue_id`, and `language` promotes a recorded cue's generated audio and text into paired language tracks. Optional `start` sets its timeline offset in seconds. Sound and Captions both expose Scene language; choose a language and press Play. Switching activates only that language's voice and captions. Remove the source cue audio after promotion to avoid playing it twice. Recorded mouth animation stays part of the original picture; switching dubbing does not reanimate a recorded face.

### First film example

New local projects start with a two-scene example film: a welcome and one continuous Standard robot run/follow/drone take, three generated dialogue outputs (Arabic, English and German), and matching caption tracks. Open Filming → Sound or Captions → Scene language → Play. Existing saved films are never replaced. The example contains rendered media only; no voice profiles, reference recordings, models or private character/motion libraries are included. Hosts can disable it with `filmExample: false` or supply their own `.genvrfilm` URL. Serve `/film-examples/` from the packaged `dist/studio-assets` directory along with the other Studio assets.

To change the actor, choose **Change character in Shoot**, then **Choose avatar from library** in Scene inspector. Import or choose a character for My avatar, return to the live world and record a new take. Previously recorded video retains its original actor. The local character library is enabled by default; hosts may pass `userLibrary: false` or inject their existing private library scope/storage.

### Transitions workspace

Filming → Transitions selects a picture clip and its incoming cut. Reuse Dissolve, Dip to black/white, Wipe, Iris, Shape wipe and Block dissolve with duration/alignment/settings. None removes the effect and restores a direct cut. Adding an effect may trim both clips to create footage handles; the edit is undoable. Picture opening/ending creates opacity fades on the selected clip (0 means none) and explicitly replaces its opacity animation. Sound fades remain in Sound; title tracks stay independent. MCP uses existing transition.add/set/remove and batched opacity key commands; `studio_action` can open workspace `transitions`.

For later scenes, `dialogue_track` accepts `append: true` and a global timeline `start`. It keeps the earlier scene's sound/captions. Overlapping language audio is refused. A new recording opens Shoot automatically; camera path time resets at capture start. Browser audio activation can still require pressing Play once; blocked audio reports an error instead of leaving MCP waiting indefinitely.

Film controls available to external agents: `user_avatar_library` chooses private characters, `list_avatar_motions` discovers named actions, `present_avatar` previews actions/expressions, `set_camera` sets presets or timed path stops, and `studio_action` inspects actors and command schemas, sets timed scene cues (`at`/`to` world positions), generates/attaches saved voices, edits language tracks, cuts/transitions/keyframes, records, renders frames and exports. Check `get_studio_capabilities` and `list_studio_sessions` first. Browser layout changes and native file pickers are not a substitute for these semantic editing APIs; private libraries and connected accounts depend on host adapters.

### Sound editor and MCP audio import

Sound contains Import audio file, an audio-clip selector, source In/Out, timeline Start, Apply trim & position (one undo step), Split at playhead, remove, 0–200% volume and fade-in/out. The advanced mixer retains mute/solo, ducking, meters and loudness tools. Imported files stay on the device. Source trims cannot extend beyond the original recording; overlapping placement overwrites existing audio on the destination track.

MCP `studio_action` operation `sound_import` accepts `name`, an audio MIME (`audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/mp4`, `audio/webm`, `audio/flac`, `audio/aac`), and base64 `data` (decoded limit8 MB; the Sound file picker accepts20 MB). It imports at the current playhead and selects the resulting audio clip; result contains `media` and `clip` IDs. No arbitrary filesystem paths or external URLs are fetched. Existing semantic commands `clip.trim`, `clip.move`, `clip.split`, `clip.set` volume, `clip.fade`, `clip.remove` and `track.set` operate on it. Discover schemas with operation `commands`; check `failed` on batches. Audio gains above100% can clip; audition before export.


### Preview6 example and recording

The teaching film contains two picture clips and alternate AR/EN/DE audio/caption tracks (two speech clips per language). The second take follows the running character from the front, keeping the full head and upper body visible, then rises into a drone view without a cut. Audio uses the local saved language-reference voices; optional weights/reference profiles remain external. Timed captions are grouped by sentence with approximate proportional timing, not forced word alignment. Recorded mouth motion matches the source Arabic take; switching dubbing does not recreate recorded lips.

Recording temporarily fits the live viewport to the chosen output aspect ratio and restores its layout afterward, so panel/window resizing does not change capture framing. Camera path time resets at recording start. The editor export filename includes the selected language. Generated example assets play without installing voice models; generation and editable live scenes need the normal host adapters.

Sound has a prominent Environment sound section for each audio clip classified as `ambience`. Its saved gain (0–200%, with mute/25/50/100% presets) is independent of character dialogue and applies to playback and export. MCP uses the same `studio_action` command `clip.set` with `{clip: "<ambience clip ID>", volume: 0.5}`. Inspect film tracks to find sound clips with `soundType: "ambience"`; use `clip.soundType` to classify an imported environment recording. Do not select dialogue clips or alter their gain for an environment adjustment. The shared environment track stays active when changing dialogue language. Live world sound and audio already baked into video are separate from these editable ambience clips.

### Shared world lighting and film export

Build and Filming use the same live runtime/world. Entering Filming selects Shoot and the live world instead of silently displaying the teaching film. Lighting is available under World and Filming → Shoot. Add up to four spotlights, choose My avatar or a scene actor to follow, or World position for a fixed light. Position/aim are actor-relative offsets in metres when following. Colour, intensity, beam angle, soft edge and range are validated; settings persist in `world.environment.lighting`, participate in world undo/redo, and remain unchanged by sky settings. Lights illuminate live geometry and are baked into new recordings; existing videos require a new take for new lighting. These spotlights do not cast additional dynamic shadows.

MCP `studio_action` `{kind:"lighting"}` reads the same settings; supply `lights:[...]` to replace them (an empty array removes them). Each light has `id`, `name`, `enabled`, `actor` (`"self"`, scene actor ID, or null), `color` (`#rrggbb`), `intensity` (0–200), `angle` (5–85 degrees), `softness` (0–1), `distance` (1–200 metres), `position` and `target` (XYZ triples). Unknown actor targets hide their light until the actor is present. `inspect_studio` includes lighting.

The Export scope chooser distinguishes Full film, Selected shot and Marked range. Selected shot exports its timeline window with all audible audio and visible captions/layers, not only the source video. MCP `{kind:"export",shot_id:"<picture clip ID>"}` uses the same timeline-window principle; omit shot_id for the full film, independent of editor In/Out marks. Active dialogue language determines output dialogue/captions, shared ambience stays audible.

The Filming viewport quick toolbar reuses Characters, saved Voice selection/listen, camera presets, Follow, Lighting and Record take. Choosing a saved voice assigns it to My avatar and defaults newly edited dialogue to that profile; generating dialogue is still required to create audio. Existing recorded sound is preserved. Private saved voices and their profile metadata stay in the host library, outside public packages.

### Manual scenes

Filming quick tools provide Start scene and End scene. Start selects the live mouse/keyboard camera, records free movement without replaying draft movement cues, and End saves the actual recorded duration to the timeline. WASD/arrows move, Shift runs; mouse controls the existing live camera. A visible 30-second safety limit ends a take automatically. Timed/cinematic recording remains available in Shoot and Record shot. MCP uses `studio_action` `{kind:"manual_record",action:"start"}` and then `{kind:"manual_record",action:"stop"}`; start returns immediately, and stop finalizes the local recording asynchronously. Wait for the capture to finish before editing/exporting. Cancellation discards a take; End scene preserves it.

Production archives omit generated JavaScript debug maps; corresponding source remains available in the source archive and GitHub. The bundled teaching film uses optimized VP9 pictures and lossless FLAC speech/ambience to fit registry delivery limits. User recordings and saved libraries are untouched.

### Avatar Live and sharing

The top toolbar has separate **Avatar Live** and **Share** actions. Avatar Live is a simple page for the working agent: a header (For me / For my customers, Settings, Share, Close), the live face, the conversation and a side panel for what the agent is doing. All choices live in one **Settings** window with seven sections: Agent, Look & voice, Background (My worlds with Choose a spot, Color, Transparent), Display (Chat + avatar, Video call, Compact or Watch; size; framing; switches for speech, notifications, effects and the side panel), Where it shows (the exact display presets), What it may do and Notifications (per group). It uses the same character library, saved voice assignment, motion library and validated `present_avatar` executor as Studio. The default background is a plain color; the older built-in rooms stay available to `present_avatar`.

Use `present_avatar({event:{kind:"display",open:true,layout:"watch",framing:"bust",background:"color"}})` through the live MCP connection. Existing animation, expression, effect, notification and card events act on the visible live character. Speech playback and mouth synchronization use the existing `avatar_voice` tools. Close with `open:false`; the underlying world and film are retained.

For a direct viewer without the world editor, import `mountAvatarLive` from `3d-world-sdk/studio`, give its container a size and supply a character recipe. The returned handle has `execute`, `setRecipe`, `speak`, `speechControl`, `snapshot` and `dispose`. Its optional `subscribe` adapter delivers real application events. Unsupported face rigs still report their actual capabilities.

Host apps (for example an agent app that shows the avatar inside its own chat) should not build their own avatar settings. Pass `agent: {name, detail?}` and `host: {voices, voiceId, onVoice(id), onPrefs(prefs), onSettings(open)}`: the embedded avatar then shows a **Settings** button and the same Settings window as the Avatar Live page. `onVoice` reports the chosen saved voice, `onPrefs` reports the page choices (`speak`, `size`, notifications and more) on start and after each change, and `onSettings` tells the host when the window opens so it can give the frame more room. `setHost({agent?, host?})` updates the agent or voice list later and `openSettings()` opens the window from host code. Speech itself stays with the host through `speak()`.

`AVATAR_LIVE_LAYOUTS` exposes stable layout IDs. `avatarLiveEmbed(hostedStudioUrl,projectId,layout,display?)` returns a display ID, URL, iframe HTML and a `localOnly` flag. The Studio URL accepts `avatar-live` and `project` query parameters, plus background/color/framing/media. A localhost URL and browser-local project are only a local preview; copying an iframe does not publish private characters, voices or assets. The hosted application must supply authorized project and library access. Uploaded blob backgrounds remain local; use hosted media for sharing.

`mountStudio(container,{sharing:{async create(request){return platform.createShare(request);}}})` enables the separate Share screen. The adapter receives project/surface/layout, private/public/invite access, explicit guests, optional password and joining permission, and returns `{id,url}`. The server must authorize the owner, enforce invitations and join rules, and hash/check passwords. The SDK does not implement public account access control or persist passwords in projects/URLs. Without this adapter the UI shows a local-only explanation and disables public link creation. `share_studio` supports inspect/open/create through MCP and the built-in assistant; creating links requires user authorization and the same host adapter.

Toolbar playback is contextual: Test world in Build/Items/World, Preview avatar in Avatar, and Play film/Pause film in Filming.

Share displays every Avatar Live result and its iframe code in one gallery. Multiple layouts can be selected and copied together; selection is not required to copy a single frame. Previews render the actual character at each layout's camera/aspect, without decorative browser/device frames. `Current world` in Studio uses the existing world renderer as a live backdrop, suppresses its duplicate self avatar/input, and restores the viewport on exit. It does not generate or replace the world. The standalone direct viewer requires a host world viewport for an equivalent background; use Studio for the built-in Current world option. Embedded Studio uses the WebGL fallback for reliable iframe startup.

Avatar Live → Background → My worlds lists projects from the host StudioStorage. Choose a world, then **Choose a spot**: walk with WASD/arrows, drag to look and scroll to zoom. **Use this spot** fixes that camera behind the live avatar. Exploration runs in a disposable copy; it never saves movement or edits into the source world. `inspect_studio.availableWorlds` lists permitted world IDs; `present_avatar` display accepts `worldId` and `worldSpot: {position,target,player}` (XYZ objects). Embed codes retain the selected world/viewpoint; the receiving host must authorize and provide that world.

## Account-linked world publication (preview.12)

Hosts use `GenvrAccountLink.start(clientName, scopes)`, open `verificationUri`, display `userCode`, and poll no faster than `interval` until browser consent succeeds. Keep the resulting bearer token in the host secure credential store, never in project files, URLs or logs. Use `GenvrClient.linked(apiUrl, accessToken)`. Tokens expire after 30 days; revoked/expired credentials return 401 and require a new consent flow. No password is passed to the host.

Scopes: `worlds:read` reads permitted worlds/metadata; `worlds:write` creates private drafts and imports into owned drafts; `worlds:publish` publishes/unpublishes and manages owned access/invitations; `worlds:join` requests access and short-lived play tickets; `items:submit` is optional and only submits assets for moderation. Existing grants do not acquire new scopes: relink for join support. `GenvrAccountLink.start` defaults to `worlds:read` + `worlds:write` only; the MCP `genvr_link_start` tool defaults to read/join, or read/write/publish/join when the host enables publication (see Agent MCP publication).

Explicit workflow: `createDraft(session)` once, retain the returned server ID separately from the local project ID; `readWorld(id)` for the current version; `uploadWorld(session, {id, baseVersion})`; then, only after user confirmation, `publishWorld(id, {title, type, access, content})`. `content` is the required content questionnaire. Server identity owns the draft; the host cannot choose another owner. Stale uploads return 409. Published worlds must be explicitly unpublished AND set to private access before import; keep the same server ID. Do not automatically retry draft creation after an uncertain response.

`experience(id)` returns server metadata (`isOwner`, `status`, `accessMode`). `setAccess(id, {mode})` supports private/friends/invite/public or `{mode:'password', password}`. Private keeps only owners/builders eligible; use `unpublishWorld(id)` to return to draft. `createInvite(id, {role:'player', expiresInHours:72})` returns a revocable invitation. Builder invitations deliberately grant edit access and require explicit owner choice. `revokeInvite(id, inviteId)` prevents new acceptance, not removal of existing members. `worldShareUrl(webOrigin, id, inviteToken?)` generates `/places/:id` on the WEBSITE origin, never an API origin assumption; an ordinary share link grants no access. Never put account tokens/passwords into links.

`joinWorld(id, {invite?, password?})` returns `{allowed, reason?}`. Only request `joinTicket(id)` after allowed; realtime connection remains a host integration. Authentication, server access, moderation, entitlement, published status and ownership checks still apply. Friends/subscription/class admission is not implemented by the current server. Existing player membership survives password changes/invite revocation; private/unpublished denies new reads/tickets. Tickets already issued last up to 60 seconds; this change does not promise eviction of existing sockets.

No method automatically scans/imports/uploads private libraries, voices or model weights. Upload only the explicitly selected portable world; unknown/private asset references require deliberate permitted item mapping and server validation, with no automatic asset submission. Local storage keys, project/library IDs and voice assignments are unchanged. This package requires the matching GenVR account-link backend (migration 0041 plus publication scope allowlist and private read/ticket guard); installing the package alone does not activate a production service.

### Agent MCP publication

The stdio `genvr-world-mcp` now exposes 16 `genvr_*` tools for consent, identity, draft/upload/read, publish/unpublish, access, invitations, share URLs and join/tickets. Configure `GENVR_API_URL` and `GENVR_WEB_URL` with matching API and website origins. Optionally inject `GENVR_ACCOUNT_TOKEN` from the host secure credential store; do not commit it. Without endpoint configuration the tools fail closed and local authoring keeps working.

By default the MCP server lists only consent, identity, read, share-URL and join tools. `confirm:true` is written by the agent, so it is not proof of user approval. Draft creation, upload, publish/unpublish, access changes and invitations are hidden and refused unless the host sets `GENVR_MCP_PUBLICATION=1`, which it should only do when its own UI or MCP client asks the user to approve each call. MCP invitations are player-only; builder invitations grant editing and stay in the host UI through `GenvrClient.createInvite`.

Call `genvr_link_start`, show its user code and verification URI to the user, wait for `interval`, then call `genvr_link_poll`. The device code and issued account token are kept in process memory and never returned in MCP tool output. A process restart requires relinking unless the host supplies securely stored credentials. Call `genvr_identity` before choosing a publication target. Default MCP consent requests read/join, or read/write/publish/join when `GENVR_MCP_PUBLICATION=1`; never item submission.

Publication mutation tools require `confirm:true` reflecting explicit owner intent. `genvr_create_draft` and `genvr_upload_world` also require the exact `localId` of the currently opened LOCAL-FILE session. Live Studio viewport projects are not implicitly selected or exported: use the host's validated explicit project-to-world export or open the intended portable world first. Keep the returned server ID and last version in host metadata without replacing local project IDs. Read the server version before an import, handle 409 without overwriting, and explicitly set private + unpublish before importing updates. No automatic retry creates duplicate drafts. The generic StudioSharing avatar/embed backend remains host-owned; these world APIs do not implement an avatar/film share hosting service.
