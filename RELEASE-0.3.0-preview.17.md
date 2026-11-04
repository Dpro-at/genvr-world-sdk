# 0.3.0-preview.17

A host's own chat can answer in the Studio and knows which world is open.

Host chat: `mountStudio` takes two new options. `onContext(context)` tells the host which world is open (`projectId`, `name`, `tab`, `look`, `kind`) when a world opens, the tab changes or the world is renamed. `chat` (`folder`, `answerer` with `name`, `detail` and `color`, and an optional `chooseAnswerer()`) makes the Studio chat show the place, its folder and who answers, and the chat then appears on every tab, Filming included. `mountStudio(...).setChat(info)` changes what the chat shows at any time. Pair `chat` with `model` so the host answers; without `chat` the Studio looks and works as before.

Chat model: a `ChatModel` now receives the tools the open place offers as an optional fifth argument, in the usual function format, so a host's own model can call the same tools as the built-in assistant. Tools still run in the Studio as world commands, with the same undo and checks. Models that ignore the argument work unchanged.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
