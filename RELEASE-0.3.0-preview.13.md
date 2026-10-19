# 0.3.0-preview.13

Simpler Avatar Live. The page is now built around the working agent: a header with For me / For my customers, Settings, Share and Close; the live face; the conversation; and a side panel for what the agent is doing. Every choice moved into one Settings window with seven sections (Agent, Look & voice, Background, Display, Where it shows, What it may do, Notifications). Display offers four views with small drawings (Chat + avatar, Video call, Compact, Watch), three sizes, framing and switches for speech, notifications, effects and the side panel. Notifications can be switched per group.

Background → My worlds picks one of the owner's worlds by name; Choose a spot opens it with a dashed frame and a guide figure so the owner sees what will stand behind the agent. The default background is a plain color; the older built-in rooms remain available to `present_avatar`.

The Share dialog was redesigned: who can open the link (anyone, invited people, password), whether visitors only watch or may talk, the link, and website code in three looks (Bubble, Side window, Banner). Without a hosting adapter it states honestly that the result is a local preview.

Host apps can embed the same Settings window. `mountAvatarLive` accepts `agent` and `host` (`voices`, `voiceId`, `onVoice`, `onPrefs`, `onSettings`) and adds `setHost()` and `openSettings()`, so an agent app showing the avatar in its own chat does not need its own avatar settings.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged.

Validation: 65 SDK tests across 15 files, Studio type checking and build, and an archive audit for private assets and local configuration.
