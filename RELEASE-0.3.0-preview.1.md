# Shared Studio 0.3.0-preview.1

GitHub-only preview. npm publication, production account activation/deployment and Agent Player remain deferred.

Includes the website's actual creation/style flow, building tools, environment/settings/avatar panels,
filming, recording, timeline and film export in the installable package. Private local worlds use validated
snapshots and IndexedDB; films use a separate local identity. Optional model/storage services are explicit
adapters, not fake accounts or automatic platform publishing.

Fixes cold-start avatar translation/jump caused by an unprimed Rapier broad phase and the shared phone
filming live-camera overlay and initial Program monitor redraw after reopening. Runtime1024 tests pass (1 skipped), SDK26, world264 and focused physics18 pass.
Independent clean-source build/typechecks, licensed asset inventory and installed desktop/mobile QA recorded
in the platform N296-N303 handoff. This is not exhaustive advanced-film, physical-device or VR certification.

## Run On Another Computer

Install Node24+. Download the installable `.tgz` and verify its SHA256 against SHA256SUMS.txt. In a new folder:

```sh
npm init -y
npm install ./3d-world-sdk-0.3.0-preview.1.tgz
npx genvr-studio
```

Open http://127.0.0.1:3029. Download the separate source archive to rebuild from shared source; its README
has the frozen pnpm recipe. Export both `.genvr-studio` and `.genvrfilm` on the old computer, transfer them,
import the world and open the film file from its Filming workspace. Browser IndexedDB does not sync devices.

Earlier0.2.0 release assets are unchanged. Do not treat this preview as production account-link activation.
