# 0.3.0-preview.20

The full editor in a desktop host's narrow window, the host's chat as the place's chat, and the market on its own.

`mountStudio` takes `desktopLayout: true`. A desktop host then gets the full editor (tabs, panels and the Lab of a motion lab) in any window with a mouse, also when it is narrower than 1024 px, instead of the phone layout. Side panels keep at most a third of the width each, so the world view stays usable. Without the option the Studio chooses its layout as before.

Host chat: `chat.history` (the host's earlier lines of this place's chat, oldest first; the latest 40 are kept, each up to 20,000 characters) is shown in the Studio chat before anything is said, and `chat.openChat()` adds Open in Chat, which the host uses to open the same conversation in its own chat. `setChat` accepts `history` too.

Market: `mountMarket(container, { catalog, onAdd, style })` shows the Studio's Items catalog without a world: the same kinds, filters and item details, a look picker, and Add to a place… for free items (paid items are bought on GenVR). `mountStudio(..., { placeItem })` opens a place with that item shown in the Items tab, ready to place.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
