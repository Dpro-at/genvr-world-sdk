import { Style } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { READY_STYLES, STYLE_MIXING, STYLE_NOTES } from '../src/index.js';

describe('STYLE_NOTES (MCP get_style_guide)', () => {
  it('has one short paragraph for every style, naming it', () => {
    expect(Object.keys(STYLE_NOTES).sort()).toEqual([...Style.options].sort());
    for (const style of Style.options) {
      const note = STYLE_NOTES[style];
      expect(note.toLowerCase().startsWith(style)).toBe(true);
      expect(note.length).toBeLessThan(600);
    }
    expect(STYLE_MIXING).toContain('accent');
  });

  it('says which styles are ready, as the style coverage does', () => {
    for (const style of Style.options)
      expect(STYLE_NOTES[style].includes('Not a ready style')).toBe(!READY_STYLES.includes(style));
  });
});
