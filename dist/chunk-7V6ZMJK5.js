// ../../apps/web/lib/video-studio/fonts.ts
var FONTS = {
  nunito: "Genvr Film Nunito",
  serif: "Genvr Film Merriweather",
  mono: "Genvr Film JetBrains Mono",
  display: "Genvr Film Bebas Neue"
};
var fontFamily = (font) => `"${FONTS[font] ?? FONTS.nunito}"`;
var FONT_CLASSES = "genvr-film-fonts";
async function fontReady(font, weight, size) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`${weight} ${Math.round(size)}px ${fontFamily(font)}`);
  } catch {
  }
}

export {
  fontFamily,
  FONT_CLASSES,
  fontReady
};
//# sourceMappingURL=chunk-7V6ZMJK5.js.map
