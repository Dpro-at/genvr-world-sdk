# 0.3.0-preview.8

Superseded by preview.9 before npm publication. Install `3d-world-sdk@0.3.0-preview.9`.

The Studio now offers quick filming tools for character and saved voice selection, camera presets, follow, lighting and recording. Build and Filming share the same live world. Character controls use visible sections again.

- Persist up to four actor-following or fixed spotlights with shared manual and MCP controls.
- Keep ambience gain independent of character dialogue, with clear Sound controls and dialogue ducking.
- Import, trim, position and fade audio through Sound or MCP.
- Provide a two-shot starter film with Arabic, English and German dialogue/captions and shared ocean ambience for fresh projects; preserve existing saved films.
- Export a full film, selected shot or marked range. Shot export retains overlapping audio, captions and layers.
- Preserve host-owned private character, motion and voice libraries. Optional weights, reference recordings and personal profiles are not bundled.

Validation includes Studio type checking and build, 56 SDK tests, 38 world command tests, nine render tests, a spotlight follow/lifecycle test, live quick-tool recording/voice assignment, and real shot/full-film VP9/Opus exports. Canonical binary/source archives passed privacy and source coverage checks.

Existing recorded footage keeps its original actor, lighting and mouth animation. New actors or lighting require a new take. Multiple imported avatars as independent cast members remain future work. Additional dynamic spotlight shadows are not enabled.

Install `3d-world-sdk@0.3.0-preview.8` with Node.js 24 or newer. Preserve the application's existing storage, library and voice adapters when upgrading.
