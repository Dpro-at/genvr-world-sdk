# Corresponding Source: 3d-world-sdk 0.3.0-preview.1

The `corresponding-source/` workspace contains the canonical Genvr runtime, SDK, shared Studio UI,
workers, fonts and licensed assets. It does not include an API server, admin app, account database,
production credentials or Agent Player integration. Follow its README for Node24+/pnpm10.24 locked
installation, dependency-first build, tests and Studio startup. Shared components are used by the website
and this package; changes belong in the canonical sources and package build, not a second UI.

Both the installable archive and corresponding-source archive are prerelease assets with SHA256SUMS.txt.
Source is independently reviewed and rebuildable; build paths/timestamps may change archive bytes and
chunk names, so no byte-identical-rebuild claim is made. Genvr code is AGPL-3.0-only; bundled dependencies
and assets retain their included notices. npm publication, production deployment/account activation
and Agent Player remain deferred. Local projects and films need no Genvr account.
