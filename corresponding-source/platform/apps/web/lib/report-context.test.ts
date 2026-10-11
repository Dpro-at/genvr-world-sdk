import { describe, expect, it } from 'vitest';
import { noticeLocation, reportContext } from './report-context';

describe('report context privacy and identity', () => {
  it('keeps the world and source play route without access secrets', () => {
    const context = reportContext('/places/exp-123/play?invite=secret&password=hidden#token');
    expect(context).toEqual({ kind: 'place', id: 'exp-123', sourcePath: '/places/exp-123/play' });
    const location = noticeLocation({ ...context, title: 'A game', creator: 'Creator' });
    expect(location).toContain('https://genvr.net/places/exp-123\n');
    expect(location).toContain('Opened from: https://genvr.net/places/exp-123/play');
    expect(location).not.toMatch(/secret|hidden|token/);
  });
  it('rejects external/protocol-relative or unsafe sources', () => {
    for (const source of ['//evil.test', 'https://evil.test/world', '/places/%2fsecret', '/\\evil']) {
      expect(reportContext(source)).toEqual({ kind: 'page', sourcePath: '/' });
    }
  });
  it('preserves IDs and respects notice length even with long labels', () => {
    const location = noticeLocation({
      kind: 'item',
      sourcePath: '/market',
      id: 'core-anime-body',
      title: 'x'.repeat(1000),
      creator: 'y'.repeat(1000),
    });
    expect(location).toContain('Item ID: core-anime-body');
    expect(location.length).toBeLessThanOrEqual(500);
  });
  it('does not interpret a similarly named page as a world', () => {
    expect(reportContext('/placesextra/exp-1')).toEqual({ kind: 'page', sourcePath: '/placesextra/exp-1' });
  });
});
