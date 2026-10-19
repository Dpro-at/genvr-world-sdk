# Know every tool, and keep this skill current

The tools grow with every SDK version. Never rely only on this text: discover what the system
offers **each time you start**, then compare it with this skill.

## 1. How an AI agent finds all the tools

1. **MCP tool list.** The host gives the agent the MCP server's tools (`tools/list`). Read every name and
   description; use only listed tools. In Dpro the bundled server is `genvr-local` (Settings → MCP), and
   each agent sees only the tools the owner granted it (the agent's MCP tab). A missing tool means
   "not granted or not available", not "call it anyway".
2. **Capabilities.** `get_studio_capabilities` says what the live connection can do (filming, voice,
   avatarLive, privateLibrary, sharing) and what is missing.
3. **Live session.** `list_studio_sessions` / `select_studio_session`: no session, no live actions.
4. **Editor commands.** `studio_action {operation:{kind:"commands"}}` lists the film editor's commands
   and their argument schemas; `{kind:"inspect"}` shows the current film.
5. **Libraries.** `user_avatar_library list`, `list_avatar_motions`, `avatar_voice voices` / `models`
   return the real characters, motions, voices and installed voice models.
6. **Design guides.** `get_design_guide` serves the world-builder parts; the SDK skills
   (`genvr-world-builder`, `genvr-avatar-presentation`, this one) come with the installed SDK.

## 2. How Dpro connects the pieces

- Dpro hosts Studio in its GenVR page and runs the SDK's live bridge and local voice service on
  127.0.0.1 (same origin, token). The bundled MCP server reaches the open Studio through the live
  connection file; nothing is exposed beyond this computer.
- The owner's private characters/motions stay on the device; the private library is owner-only.
- Publishing to Genvr is a separate, owner-confirmed action in Settings → Connections; filming never
  publishes. Linking the Genvr account never shares a password or token with the agent.
- Tool execution and grants are the owner's gates (execution policy, per-agent MCP grants). Do not try
  to enable, widen or bypass them.

## 3. Keep the skill up to date (every session)

1. Run the discovery steps above and note: new tools, new `studio_action` kinds or commands, changed
   fields, new capabilities, new errors you met.
2. Compare with [tools.md](tools.md), [languages.md](languages.md), [series.md](series.md) and
   [mistakes.md](mistakes.md).
3. If something is new or different and you **verified** it in this session (a real call and its
   result), write it down: add the operation to `tools.md`, the lesson to `mistakes.md`, and keep the
   date and SDK version (`SDK_VERSION` / package version) next to it.
4. Never write untested claims. Mark anything not verified as "not verified".
5. Where to write: the canonical copy is the package's `skills/genvr-film-maker/` (source in
   `corresponding-source/platform/packages/world-sdk/skills/genvr-film-maker/`, both identical). Hosts
   such as Dpro load the installed SDK's copy and update it automatically with each SDK version; a
   host's own edited copy is never overwritten, so propose changes to the package instead.
6. If you cannot edit files (no permission), report the new findings to the owner as a short list:
   what changed, the call that proved it, and the SDK version.
