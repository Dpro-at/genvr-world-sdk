import { describe, expect, it } from 'vitest';
import { FilmStudioOperation } from '../src/filming.js';

describe('export and live take operations (FILM-A3)', () => {
  it('exports up to 4K, one language, captions on or off, the marked range', () => {
    expect(FilmStudioOperation.parse({ kind: 'export', width: 3840, height: 2160, language: 'ar', captions: 'none', range: 'marked' }))
      .toMatchObject({ width: 3840, height: 2160, language: 'ar', captions: 'none', range: 'marked' });
    expect(FilmStudioOperation.parse({ kind: 'export' })).toMatchObject({ width: 1280, height: 720, captions: 'picture' });
    expect(() => FilmStudioOperation.parse({ kind: 'export', width: 4000 })).toThrow();
    expect(() => FilmStudioOperation.parse({ kind: 'export', language: 'Arabic' })).toThrow();
  });
  it('limits a live take to 30 seconds', () => {
    expect(FilmStudioOperation.parse({ kind: 'manual_record', action: 'start', seconds: 12 })).toMatchObject({ seconds: 12 });
    expect(() => FilmStudioOperation.parse({ kind: 'manual_record', action: 'start', seconds: 31 })).toThrow();
  });
});
