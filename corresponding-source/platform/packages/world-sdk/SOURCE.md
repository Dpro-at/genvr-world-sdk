# Shared Studio corresponding source

This workspace contains the canonical Genvr package sources, shared browser Studio components and their
licensed public assets for the accompanying 3d-world-sdk preview archive. No API server, admin app, account
database or production credentials are included. The API client is a typed optional client, not a server.

Node24+ and pnpm10.24.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @genvr/world-sdk... build
pnpm --filter @genvr/world-sdk typecheck:studio
pnpm --filter @genvr/world-sdk test
pnpm --filter @genvr/world-sdk studio
```

Open http://127.0.0.1:3029. The SDK build bundles the existing web components and canonical runtime, compiles
CSS/workers, and copies assets with source provenance, dependency notices and a SHA256 inventory. The website
uses these same components; there is no copied reduced Studio implementation. `pack:standalone` additionally
needs a Git checkout to enumerate corresponding sources; building and serving do not need Git.

Genvr code is AGPL-3.0-only (LICENSE); included assets/dependencies retain their own documented licenses.
Do not publish this preview to npm, activate account linking or integrate Agent Player without separate approval.
