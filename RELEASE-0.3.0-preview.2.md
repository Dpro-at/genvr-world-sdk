# 0.3.0-preview.2

Adds a separate standard robot body with rigid shells, articulated fingers, a screen face and backward-compatible saved character recipes. Existing human bodies remain available. Studio groups motions and facial expressions in the original card grid, with readable categories, counts, search, icons and saved character controls.

Hosts can supply private motion catalogs for per-avatar retargeting and assistant discovery. The film workspace can select supplied motions and facial expressions as actor cues; recording prepares the required motion clips first. Downloaded third-party characters and motion files are not distributed in this package.

MCP adds capability discovery, searchable motion metadata and an adapter for the existing eight platform filming tools. Filming uses an explicitly configured authenticated host and connected Studio session; no account credentials or active service connection are bundled. The standalone file session does not acquire complete live-editor control merely by listing the tools.

This remains a preview. Local FBX character import is opt-in and has known fixture compatibility limitations. Numerical retarget checks do not certify collision clearance or the visual quality of every pose. Account uploads, publishing and voice workflows require separate host configuration and follow-up work.

Private library imports provide a file/folder chooser, searchable character portraits, target selection, progress and diagnostics. The attached-host `user_avatar_library` tool supports discovery, character assignment and playback. Imported characters retain clothing, eyes, hair and all material primitives. Packing removes temporary staging directories after success or failure.
