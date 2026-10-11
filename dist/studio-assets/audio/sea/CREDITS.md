# Sea sound sources

Real recordings, taken unchanged from Tidewater's audio build (https://github.com/dgreenheck/tidewater, commit
`4811ba48`, `public/audio/`), each released on Freesound under **Creative Commons 0** (public domain dedication: no
attribution required; credited anyway). Each Freesound page was opened again on 2026-10-04 and shows CC0.

Tidewater's processing (their `public/audio/CREDITS.md`): excerpt, trim, fades, loudness normalisation (loop about
-23 LUFS, one-shot slices peak-normalised to -1 dBFS), Opus in Ogg at 64 kb/s; the one-shot files are sprites, the
slice table is in `platform/packages/runtime/src/ocean/surf-sound.ts` (`SURF_BANK`, from their `soundBank.js`).
Genvr adds an AAC copy of each file (`.m4a`, ffmpeg, 80 kb/s mono 48 kHz) for browsers without Ogg Opus (older
Safari); the slices are the same.

| File | Use | Source | Author | Licence | Via |
|---|---|---|---|---|---|
| `surf_crash.ogg`, `surf_crash.m4a` | 7 breaking waves (crash / thump), played per wave at its break point | [Ocean_coast_04_092025_0659AM](https://freesound.org/people/YevgVerh/sounds/827530/), [Big waves hit land.wav](https://freesound.org/people/straget/sounds/412308/) | YevgVerh, straget | CC0 1.0, CC0 1.0 | Tidewater 4811ba48 |
| `surf_wash.ogg`, `surf_wash.m4a` | 6 uprushes (swash running up the sand), close mic | [Gentle small waves lapping on shore.wav](https://freesound.org/people/Alex_hears_things/sounds/352356/) | Alex_hears_things | CC0 1.0 | Tidewater 4811ba48 |
| `surf_backwash.ogg`, `surf_backwash.m4a` | 6 backwash drains (sand fizz), close mic | [Gentle small waves lapping on shore.wav](https://freesound.org/people/Alex_hears_things/sounds/352356/) | Alex_hears_things | CC0 1.0 | Tidewater 4811ba48 |
| `surf_far.ogg`, `surf_far.m4a` | distant surf roar (cliff top), loop | [11ft waves breaking on sandy beach in the distance from the top of the cliff](https://freesound.org/people/chris_dagorne/sounds/426074/) | chris_dagorne | CC0 1.0 | Tidewater 4811ba48 |
