# 0.3.0-preview.22

A host's own chat builds in the open place.

MCP: with a live Studio connected (`GENVR_STUDIO_CONNECTION`) and no local world opened, the place's building tools (the same tools the Studio assistant uses) are sent to the place open in the Studio. The Studio runs them with its usual undo and checks, switching to Build when needed. The live bridge lets these tools through only to a Studio session that says it takes them (`worldTools`). Without a live Studio, the tools work on a local world file as before.

Studio chat: `chat.send(text, { onDelta, onTool }, signal)` makes the Studio chat send each message to the host's own chat and show its streamed reply and tool lines. While nothing is being answered, the panel shows the host's conversation as it is (`chat.history`), also lines written in the host's own chat window. Without `send`, the Studio runs its own assistant as before.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
