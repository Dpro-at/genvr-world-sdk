# Several languages on one picture

Keep **one picture clip**. Each language gets its own voice track and caption track over the same
picture; Sound and Captions → Scene language switches which one plays and is exported.

## Steps (verified)

1. Write one cue per language for the same moment, e.g. `line-ar`, `line-en`, `line-de`, all
   `actor:"self"`, same `start`/`end`.
2. `dialogue_voice` each cue with a saved voice of that language (`avatar_voice voices` shows
   `language`).
3. Close Avatar Live, then `record` one take. The mouth follows the source line that played while
   recording (normally your first language); dubbing does not re-animate the face.
4. `inspect` → find the new picture clip: its **clip id** and `startSeconds`.
5. For each language: `dialogue_track {cue_id, shot_id:<clip id>, language, start:<clip startSeconds>}`.
   Without `start` the tracks land at 0 s — before the shot if it is not the first one.
6. `inspect` again: `film.languages` lists every language with its caption and voice track; every
   track's clip should start at the shot's start.
7. Remove the source cue audio after promotion so it does not play twice (an export whose peak
   reaches 0 dB usually means two voices are mixed).
8. Choose the language (Scene language), then export. The export carries that language's voice
   and captions; shared ambience stays.

## Later scenes

Use `append:true` with a global timeline `start` for the next scene's lines; earlier scenes keep
their sound and captions. Overlapping audio in the same language is refused.

## Language codes

Two- or three-letter codes, optional region (`ar`, `en`, `de`, `pt-BR`). Pick saved voices whose
`language` matches. Arabic and English are the documented generation languages; other languages
depend on the installed model (German generated offline in a Dpro test on 2026-10-19).
