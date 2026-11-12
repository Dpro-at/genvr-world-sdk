# 0.3.0-preview.19

A host with its own place list keeps it.

`mountStudio` takes `onHome()`. With it, My projects first saves the open place as before, then calls `onHome()` instead of showing the Studio's own project page; a Studio mounted with `onHome` never shows that page (an open error is shown alone). `openLab: true` opens the owner's motion lab at once, made the first time, like the Motion lab button. Without these options the Studio looks and works as before.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
