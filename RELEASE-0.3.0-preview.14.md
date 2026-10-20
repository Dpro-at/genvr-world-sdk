# 0.3.0-preview.14

Redesigned Studio tabs and a new motion lab. Every change a person can make on a page is also available to agents through MCP and the in-app Assistant, with the same owner rules.

Filming: reorganised sidebars and a fixed scene tools row; film settings, a recording bar and Add and Export menus; a film cast with script lines that wait for approval, and languages; scenes, workflow links and scene sound; shot panel sections, suggestions and a person's own voice takes; series and episodes with a director that agents can drive. Line approval, director approvals and the owner's characters' lines stay the owner's.

Build: grouped tools with keys, a tool options panel, road and wall properties and a right-click menu; agent tools for doors, parts, locks and undo. The eraser outlines its target in red.

Items: one library strip and grid, a placing panel and bar, ways of building, moves tabs and picture tiles; agent tools for looks, names, groups and flags.

World: a parts list and side panel, live lights with presets, sky time, sun and wind, weather strength and a place summary; agent tools for lights, the start point and water.

Avatar: a tabbed dock, a view menu, a right-click menu, favourite moves and undo and redo for character edits; the `avatar_studio` MCP tool, which now also works through the live Studio bridge.

Motion lab: a lab project with a measured course (step, ramp, gap, low wall, window, a street with a timed light and box cars), repeatable fixed-step runs of the lab robot, scores (foot slide, penetration, fall, car hit, time, smoothness), motion versions and a ghost of the best version. The `motion_lab` tool works over MCP and in the Assistant; an agent's request to make a version the best waits for the owner, and agents cannot delete the best version or a version a person made. Changing some run settings keeps the others.

Avatar Live: a full screen button in the page header.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects open as before.

Validation: 68 SDK tests across 16 files, 150 web tests, 100 film tests, Studio type checking and build, a live MCP check against a running Studio, and an archive audit for private assets and local configuration.
