/** Notice context contains public identifiers, never invite/password/auth query strings. */
export type ReportContext = {
  sourcePath: string;
  kind: 'place' | 'item' | 'page';
  id?: string;
  title?: string;
  creator?: string;
};

export function reportContext(path: string): ReportContext {
  const sourcePath = path.split(/[?#]/)[0] ?? '/';
  const safePath = /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(sourcePath) ? sourcePath : '/';
  const place = /^\/places\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(safePath);
  return place
    ? { sourcePath: safePath, kind: 'place', id: place[1] }
    : { sourcePath: safePath, kind: 'page' };
}

export function noticeLocation(context: ReportContext): string {
  const source = `https://genvr.net${context.sourcePath}`;
  const target = context.kind === 'place' ? `https://genvr.net/places/${context.id}` : source;
  // Keep the canonical identifier before optional labels so it survives the API's 500-character limit.
  return [
    target,
    context.id ? `${context.kind === 'place' ? 'Place/game' : 'Item'} ID: ${context.id}` : '',
    source !== target ? `Opened from: ${source}` : '',
    context.title ? `Name: ${context.title.slice(0, 120)}` : '',
    context.creator ? `Creator: ${context.creator.slice(0, 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);
}
