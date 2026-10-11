import { glyphOffsets, type CaptionClip, type TitleFont } from '@genvr/film';

/**
 * Draws one title (FILM-01) into a transparent canvas the size of the frame, centred on the frame's
 * middle; the compositor then places it with the clip's transform. Sizes are in 1080p pixels and
 * scale with the canvas height. `progress` is 0..1 through the clip (end credits scroll with it).
 */
export function drawTitle(canvas: HTMLCanvasElement, clip: CaptionClip, progress: number, family: (font: TitleFont) => string) {
  const ctx = canvas.getContext('2d'); if (!ctx || !clip.title) return;
  const k = canvas.height / 1080, style = clip.title, W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const size = style.size * k, subSize = size * (clip.template === 'card' ? 0.4 : clip.template === 'strip' ? 0.6 : 0.7);
  const font = (px: number, weight = style.weight) => `${weight} ${px}px ${family(style.font)}`;
  const lines = clip.text.split('\n'), subLines = clip.subtitle ? clip.subtitle.split('\n') : [];
  const gap = size * 1.2, subGap = subSize * 1.3;
  const blockH = lines.length * gap + subLines.length * subGap;
  // End credits roll from below the frame to above it over the clip.
  const scroll = clip.template === 'credits' ? (H / 2 + blockH / 2) - progress * (H + blockH) : 0;
  let y = H / 2 - blockH / 2 + gap * 0.8 + scroll;
  const offsets = glyphOffsets(clip.text, (clip.animators ?? []).map((a) => ({ props: a.props, selector: a.selector })));
  ctx.textBaseline = 'alphabetic';

  // Measure every line first (the box needs the whole block).
  ctx.font = font(size);
  const widths = lines.map((line) => [...line].reduce((w, ch) => w + ctx.measureText(ch).width, 0));
  ctx.font = font(subSize, 700);
  const subWidths = subLines.map((line) => ctx.measureText(line).width);
  const blockW = Math.max(0, ...widths, ...subWidths);
  const left = (w: number) => style.align === 'left' ? W / 2 : style.align === 'right' ? W / 2 - w : W / 2 - w / 2;
  const boxLeft = style.align === 'left' ? W / 2 : style.align === 'right' ? W / 2 - blockW : W / 2 - blockW / 2;
  if (style.box) {
    const pad = size * 0.35;
    ctx.globalAlpha = style.box.opacity; ctx.fillStyle = style.box.color;
    ctx.fillRect(boxLeft - pad, H / 2 - blockH / 2 - pad * 0.6 + scroll, blockW + pad * 2, blockH + pad * 1.2);
    ctx.globalAlpha = 1;
  }
  const paint = (text: string, x: number, yy: number) => {
    if (style.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10 * k; ctx.shadowOffsetY = 3 * k; }
    if (style.outline && style.outline.width > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = style.outline.width * 2 * k; ctx.strokeStyle = style.outline.color; ctx.strokeText(text, x, yy); }
    ctx.fillStyle = style.color; ctx.fillText(text, x, yy);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };
  // Main text: glyph by glyph, so each letter can move, turn, scale and fade on its own.
  let index = 0;
  lines.forEach((line) => {
    ctx.font = font(size);
    const glyphs = [...line];
    const tracking = glyphs.map((_, i) => offsets[index + i]?.tracking ?? 0);
    const width = glyphs.reduce((w, ch, i) => w + ctx.measureText(ch).width + tracking[i]! * k, 0);
    let x = left(width);
    glyphs.forEach((ch, i) => {
      const o = offsets[index + i] ?? { opacity: 0, x: 0, y: 0, scale: 0, rotation: 0, tracking: 0 };
      const w = ctx.measureText(ch).width, alpha = Math.min(1, Math.max(0, 1 + o.opacity)), scale = Math.max(0, 1 + o.scale);
      if (alpha > 0 && scale > 0 && ch.trim()) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + w / 2 + o.x * k, y - size * 0.35 + o.y * k);
        ctx.rotate((o.rotation * Math.PI) / 180); ctx.scale(scale, scale);
        paint(ch, -w / 2, size * 0.35);
        ctx.restore();
      }
      x += w + (tracking[i] ?? 0) * k;
    });
    index += glyphs.length + 1; // the newline
    y += gap;
  });
  // Subtitle (role, second line, credits names): drawn as whole lines.
  ctx.font = font(subSize, 700);
  subLines.forEach((line, n) => { paint(line, left(subWidths[n]!), y - gap + subGap); y += subGap; });
}
