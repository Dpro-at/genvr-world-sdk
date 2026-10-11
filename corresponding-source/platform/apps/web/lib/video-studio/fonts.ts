import './fonts.css';
import type { TitleFont } from '@genvr/film';

/**
 * Title fonts (FILM-01). All four are under the SIL Open Font License 1.1 and served locally from
 * bundled Latin WOFF2 assets: Nunito (the app font), Merriweather (serif), JetBrains Mono (mono),
 * Bebas Neue (display). Credits: see FONTS.md beside this file.
 */
const FONTS: Record<TitleFont, string> = {
  nunito: 'Genvr Film Nunito',
  serif: 'Genvr Film Merriweather',
  mono: 'Genvr Film JetBrains Mono',
  display: 'Genvr Film Bebas Neue',
};
export const fontFamily = (font: TitleFont) => `"${FONTS[font] ?? FONTS.nunito}"`;
/** Kept for editor roots; face declarations are shared by both browser builds. */
export const FONT_CLASSES = 'genvr-film-fonts';

/** Resolves when a face is ready for canvas drawing (canvas does not wait for fonts by itself). */
export async function fontReady(font: TitleFont, weight: number, size: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.load(`${weight} ${Math.round(size)}px ${fontFamily(font)}`); } catch { /* Falls back to the system face. */ }
}
