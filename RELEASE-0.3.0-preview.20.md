# 0.3.0-preview.20

The full editor in a desktop host's narrow window.

`mountStudio` takes `desktopLayout: true`. A desktop host then gets the full editor (tabs, panels and the Lab of a motion lab) in any window with a mouse, also when it is narrower than 1024 px, instead of the phone layout. Side panels keep at most a third of the width each, so the world view stays usable. Without the option the Studio chooses its layout as before.

No method scans or uploads private libraries, voices or model weights. Local storage keys, project and library IDs and voice assignments are unchanged; older projects and layouts open as before.
