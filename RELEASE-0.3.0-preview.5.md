# 0.3.0-preview.5

Filming adds a dedicated Transitions workspace: choose a picture clip, configure its incoming transition, duration/alignment and effect settings, or choose None for a direct cut. Existing transition engine and undo are reused. Creating footage handles may trim adjacent clips; the interface explains this.

Picture opening/ending controls create opacity fades on the selected clip. Zero removes the fade. Applying replaces that clip's opacity animation, preserving other animated properties. Sound fades and title tracks remain independent.

Validation: 33 film engine tests and 9 render/fade tests passed; Studio build/typecheck passed. Live two-clip transition changes, playback, removal and picture fades verified, then original single-scene language example restored. Archives audited, root synchronized and packaged MCP smoke passed. Prepared locally, unpublished.
