# 0.3.0-preview.9

Manual filming now has Start scene and End scene in the viewport toolbar. Start uses the live mouse/keyboard camera and records free character movement without replaying draft movement cues. End finalizes the actual take and adds it to the timeline. A visible 30-second limit safely ends a take automatically. Timed cinematic takes remain available separately.

The same controls are exposed through MCP studio_action manual_record start/stop. Saved character voice selection, lighting, camera presets, follow, language tracks, independent ambience gain and shot/full-film export from preview.8 are included.

Production packaging omits generated JavaScript debug maps, and the teaching film uses optimized VP9 video and lossless FLAC audio. All world resources remain bundled. Corresponding source remains in GitHub and the source archive. Local rebuilds retain previous release archives.

Validation: 56 SDK tests, Studio type checking/build, manual-finish/cancel/timer and spotlight tests, real UI keyboard movement and early-stop take (4.192 seconds, 5.38 metres), MCP start/stop take (1.353 seconds), and browser FLAC decoding. Temporary test takes were removed without replacing the saved film or libraries. Earlier preview.8 checks include 38 world command tests, nine render tests and real selected-shot/full-film VP9/Opus exports.

Private characters, motions, voice profiles, reference recordings and optional model weights remain outside the public package. Preserve existing host adapters and storage scopes when upgrading. Multiple imported avatars as an independent scene cast remain future work; existing recorded footage requires a new take to change actor or lighting.
