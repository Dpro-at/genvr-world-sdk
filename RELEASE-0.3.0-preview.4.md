# 0.3.0-preview.4

New local projects start with one example picture and Arabic, English and German dialogue/caption alternatives. Sound and Captions expose the same language selector. Existing films are preserved. Hosts may disable the example with `filmExample: false` or supply a custom film URL.

The character library opens from Shoot. A new take is required to change the actor in recorded video. Local character storage is enabled by default; hosts can inject their existing scope/storage or disable it. Source-profile language/type labels no longer clutter language choices.

MCP adds `studio_action` operation `dialogue_track` to promote recorded cue audio/text into a language track. Generated example outputs are included; private profiles, optional models and imported character/motion libraries remain external.

Validation: Studio build/typecheck, 24 SDK tests, 10 film playback/speech tests, live fresh-project example and character-library dialog, and packaged MCP smoke passed. Both archives audited and root distribution synchronized. This release is prepared locally and is not published to npm.
