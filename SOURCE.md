# Corresponding source — 3d-world-sdk0.2.0

AGPL-3.0-only SDK/shared engine/contracts/tool/runtime source and build configs are in corresponding-source/. They contain no platform account/payment/API/admin implementation or credentials. Public material textures are retained with asset licenses in assets/CREDITS.md. Local authoring needs no login; optional account linking uses configurable endpoints. No Agent Player integration.

Node24+: from corresponding-source run corepack pnpm install --frozen-lockfile, corepack pnpm build, corepack pnpm run pack. Workspace name @genvr/world-sdk is internal; distribution is3d-world-sdk. SDK account-link source independently reviewed in platform commit5adcffc9; shared source baseline9220bf3a.

This GitHub preview includes the archive rebuilt from this independent source workspace: SHA256dd9f546567c1ba20db90154fc0bc400df858ece9eb3860f0b66c099009a65695. The earlier prepared85e490 archive is not this release asset. Source build and all9 SDK tests pass; timestamps/build paths may change archive bytes and bundle chunk names. Verify release checksums rather than assuming byte-identical rebuilds.

Production account-link activation and npm0.2.0 publication are deferred by the owner. npm0.1.1 remains the verified published version. Genvr account-link support requires host routes and migration0041; no live production account-link claim. Local authoring remains usable independently.