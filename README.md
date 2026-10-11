# 3D World SDK 0.1.1 (preview)

Standalone authoring with the same Genvr world contracts, command engine, Core Library and assistant tools.
No Agent Player dependency or integration. JavaScript is bundled; declaration dependencies are ordinary npm
packages, not private workspace packages. Download the standalone `.tgz` from the Dpro GitHub SDK prerelease,
then `npm install /path/to/3d-world-sdk-0.1.1.tgz` (Node 24+). Run `npx genvr-world-demo` to open the
included local example at http://127.0.0.1:3028. Registry preview installation: `npm install 3d-world-sdk@preview`. Bundled Genvr source retains AGPL-3.0-only;
the included asset credits describe their separate licenses. This preview uses the shared engine and
authoring tools; its demo is a simplified host, not the complete Genvr Studio interface.

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
| World and room design | Authoring tools, local save/open, undo/redo, optional 3D preview | Full Studio editor UI if needed |
| Games | Environments and validated game/rule/script authoring data | Game execution, player controls and authoritative server hosting |
| Films | Create the locations, props and environment for a film | Genvr Filming workspace or a host camera/recording/timeline/export implementation |
| Avatars | Worlds can use host-supplied, licensed character assets through runtime/asset adapters | Avatar creation UI, rig/assets, animation and account persistence |
| Meetings and social rooms | Build the room and save/publish its world | Multiplayer, participants, voice/video, permissions and a server |

The preview does not include the complete Genvr filming editor, avatar designer, multiplayer service
or meeting application. A downloaded local world is not automatically a playable game, recorded film
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

The local model and file adapters need no Genvr account. Full offline rendering uses procedural library looks
and embedded creator-owned models. Some library looks, realistic materials, avatar assets and decoder files
refer to host-served assets: hosts must provide the licensed asset paths; the SDK does not redistribute the
entire platform asset library. The example uses blocky procedural benches and a read-only preview.
Copy the package's `assets/materials` directory into your host's public `/materials` path for the two eager
textures; the demo server does this mapping automatically. See `assets/CREDITS.md`.

Format 1 stores creation settings plus a bounded command journal (500 commands, 8 MB total, 2000 instances),
with optional embedded item files. Import replays commands server-side into an owned private draft, refuses
stale versions and forces the target ID/access/version. Raw external world snapshots and raster terrain field
pages are unsupported in this preview. Terrain and voxel edits made through supported commands round trip.
Paths/polygons are limited to 128 points, with a cumulative conservative terrain work budget checked before
replay. A package's size tier cannot be changed through its journal; create a new package at that tier instead.
Undo/redo uses validated earlier journal snapshots, not raw terrain restoration commands. Very large builds
may hit these preview limits; they are refused without replacing the saved local world or target draft.
Multiplayer/server scripts need a server host; the preview is not a multiplayer server or script executor.

In this repository: `pnpm --filter @genvr/world-sdk... build`, then
`pnpm --filter @genvr/world-sdk demo` (http://127.0.0.1:3028). Production credentials/cookies require an allowed
host origin; the demo never fabricates a production session. `pnpm --filter @genvr/world-sdk pack:standalone`
produces the independent archive in `dist`. No npm registry publication is performed.

Version policy: release when shared runtime/tools/contracts used by the SDK change; unrelated account,
payment or site UI updates do not require a SDK release. Consumers pin a version. Package format changes
need an explicit migration, never silent reinterpretation. This 0.x preview may change APIs between minor
versions; users must retain their original saved files.

Publication authentication uses the existing Genvr session, not MCP tokens. An external website requires
an allowed origin and compatible browser cookie policy; the SDK does not change server CORS/auth defaults.
Server hosts can inject an authenticated fetch implementation. If an import commits but its response is lost,
read the target world's latest version with `client.readWorld(id)` before retrying: a stale retry returns409
and never overwrites it.
