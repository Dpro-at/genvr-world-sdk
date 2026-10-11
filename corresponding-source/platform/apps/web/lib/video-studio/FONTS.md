# Title fonts (FILM-01)

| Face | Use | Licence | Source |
|---|---|---|---|
| Nunito | default titles (the app font) | SIL Open Font License 1.1 | Google Fonts, bundled Latin WOFF2 via `fonts.css` |
| Merriweather | serif titles | SIL Open Font License 1.1 | Google Fonts, bundled Latin WOFF2 via `fonts.css` |
| JetBrains Mono | mono titles | SIL Open Font License 1.1 | Google Fonts, bundled Latin WOFF2 via `fonts.css` |
| Bebas Neue | display titles | SIL Open Font License 1.1 | Google Fonts, bundled Latin WOFF2 via `fonts.css` |

The original Latin font faces are bundled unmodified in `font-assets/` and loaded through shared `fonts.css` in both the website and standalone Studio (N-297); deployment does not fetch these fonts from Google. Nunito/Merriweather retain variable weights 400–900, JetBrains Mono 400–700 and Bebas Neue 400. Other scripts use fallback fonts. The four WOFF2 files total 181,876 bytes.

`font-assets/provenance.json` records immutable font URLs, SHA256, sizes and the pinned Google Fonts repository commit used for each included OFL licence. The corresponding source CSS is retained as evidence of each family, weight range and Latin subset. Files downloaded 2026-10-10; no subsetting, renaming or modification by Genvr. The OFL allows bundling with the app; fonts are never sold separately. All four `*-OFL.txt` files must ship with redistribution. Updated during N-222/N-223 release repair after the Google loader's font URL extension parser failed twice.
