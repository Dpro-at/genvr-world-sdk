# 0.3.0-preview.11

Avatar Live adds a direct viewer with seven display presets, shared character selection, saved voices, motions, expressions, effects and notifications on the right. Backgrounds include six rooms, color, transparency, image/GIF, video and available saved worlds. World exploration uses an isolated preview: walk with the keyboard, look with the mouse and choose Use this spot without editing the source world.

Share is separate from Avatar Live. Its gallery renders each actual output and supplies individual or selected iframe codes. Selected world IDs and viewpoints are included in embed URLs. Public/private/invite access, passwords and joining require a configured host sharing service; local Studio does not create public account links. Hosts must authorize access to embedded worlds and private libraries.

MCP exposes display settings through present_avatar, available worlds through inspect_studio and host sharing through share_studio. The toolbar test action follows the current workspace. Native idle uses a relaxed finger grip; imported motion data remains unchanged. Facial animation requires a compatible character rig.

Validation: 61 SDK tests across 14 files, Studio type checking and build, runtime frame readback tests, live seven-layout/room checks, saved voice playback and supported mouth animation, nested iframe startup, and keyboard exploration with an unchanged source world. Private assets, voice profiles, model weights and local configuration are excluded from the public package. Preserve host storage adapters, scopes, IDs and assignments when upgrading.

This release rebuilds from a clean output directory, excluding stale generated chunks. Preview.10 was rejected by the npm upload-size limit and was not published.
