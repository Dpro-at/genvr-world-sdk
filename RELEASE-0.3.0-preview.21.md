# 0.3.0-preview.21

Icons in the Studio chat's header, the Assistant first, and one-line bars in a narrow window.

The header of the Studio chat shows the agents in this place as small faces (`chat.team`, names in the tooltip), an Open in Chat icon (`chat.openChat()`), and a folder icon: with `chat.openFolder()` it opens the place's folder, and its tooltip shows the path. The words "Open in Chat" and the folder path line are gone from the header. `setChat` accepts `team` too.

With a host's chat, the Assistant tab comes before Properties in the right dock and is the open tab whenever a place opens.

In a narrow window the toolbar and the status bar stay on one line and scroll sideways instead of wrapping or being cut off.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
