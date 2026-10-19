# 0.3.0-preview.12

Account-linked world publication. Hosts link a Genvr account through browser consent (`GenvrAccountLink`) and use `GenvrClient` to create private drafts, upload the selected local world, publish or unpublish it, change access (private, friends, invite, public or password), create and revoke invitations, build website share links, join permitted worlds and request short-lived realtime tickets. The new `worlds:join` scope covers joining; existing grants must relink to receive it. The server checks ownership, access, moderation and published status on every call.

The stdio MCP server adds `genvr_*` tools configured by `GENVR_API_URL`, `GENVR_WEB_URL` and an optional `GENVR_ACCOUNT_TOKEN`. By default only consent, identity, read, share-URL and join tools are listed. Draft creation, upload, publish/unpublish, access changes and invitations are exposed only when the host sets `GENVR_MCP_PUBLICATION=1` and asks the user to approve each call, because the `confirm:true` argument is supplied by the agent. MCP invitations are player-only; builder invitations remain a host UI action. Account tokens and device codes stay in process memory and are never returned in tool output.

No method scans or uploads private libraries, voices or model weights, and items are never submitted automatically. Local storage keys, project/library IDs and voice assignments are unchanged. Publication requires the matching Genvr account-link backend; installing the package alone does not activate a production service.

Validation: 65 SDK tests across 15 files, Studio type checking and build, packaged MCP smoke test, and an archive audit for private assets and local configuration.
