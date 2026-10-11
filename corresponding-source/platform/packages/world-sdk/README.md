# 3D World SDK 0.3.0-preview.1

Account-link support in this version requires the matching Genvr host routes and database migration0041.
The host implementation is prepared for review; production account linking is not active until that rollout is verified.
No npm publication or account activation is part of this release. Local authoring works independently.

Standalone authoring with the same Genvr world contracts, command engine, Core Library and assistant tools.
No Agent Player dependency or integration. JavaScript is bundled; declaration dependencies are ordinary npm
packages, not private workspace packages. Download the standalone `.tgz` from the Dpro GitHub SDK prerelease,
then `npm install /path/to/3d-world-sdk-0.3.0-preview.1.tgz` (Node 24+). Run `npx genvr-studio` to open
the included Studio at http://127.0.0.1:3029. Bundled Genvr source retains AGPL-3.0-only;
the included asset credits describe their separate licenses. This preview uses the shared engine and
authoring tools and existing website Studio components. `genvr-world-demo` remains the legacy simplified
example on3028; `genvr-studio` is the creation/building/filming application.

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
