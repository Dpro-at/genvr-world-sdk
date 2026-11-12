# 0.3.0-preview.18

How a place is played can be set from MCP.

Live Studio tool: `place_play` with `operation` `get` or `set` reads or changes how the open place is played, like Place settings: `view` (`free` 3D or `side` 2D), `moves` for a side place (`double-jump`, `wall-jump`, `dash`), `orientation` (`landscape`, `portrait`, `any`) and `devices` (at least one, kept in the usual order). Moves are refused unless the place is a side place. The change is saved with the place. The live Studio bridge allows the tool, `get_studio_capabilities` lists it, and the world-builder skill describes it.

Build: the assistant package copies its shared display runtime files into its build output, so the package builds from a clean checkout.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
