import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';

/**
 * The legal pages (owner N-142, N-146): privacy policy, terms of use and Impressum. Their text lives as Markdown in
 * `content/legal/` and is read when the site is built; this renders the small part of Markdown those files use
 * (headings, paragraphs, lists, tables, links, bold, inline code).
 */
export type LegalDoc = 'privacy' | 'terms' | 'imprint' | 'community';

export function readLegal(doc: LegalDoc): string {
  return readFileSync(join(process.cwd(), 'content', 'legal', `${doc}.md`), 'utf8').replace(/\r\n/g, '\n');
}

/** The first `# ` heading, for the page title. */
export function legalTitle(markdown: string): string {
  return /^# (.+)$/m.exec(markdown)?.[1] ?? 'Genvr';
}

const link = 'font-semibold underline underline-offset-2 hover:text-ink';

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = parts.length;
    if (match[1] && match[2]) {
      const external = /^https?:/.test(match[2]) && !match[2].startsWith('https://genvr.net');
      const href = match[2].replace(/^https:\/\/genvr\.net/, '') || '/';
      parts.push(
        <a
          key={key}
          href={href}
          className={link}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) parts.push(<strong key={key}>{match[3]}</strong>);
    else if (match[4])
      parts.push(
        <code key={key} className="rounded bg-ink/10 px-1.5 py-0.5 text-[0.9em]">
          {match[4]}
        </code>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

function blocks(markdown: string): ReactNode[] {
  const lines = markdown.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('# ')) {
      i++; // The page title is shown by LegalPage.
    } else if (line.startsWith('## ')) {
      out.push(
        <h2 key={i} className="mt-10 mb-3 text-xl font-extrabold">
          {inline(line.slice(3))}
        </h2>,
      );
      i++;
    } else if (line.startsWith('### ')) {
      out.push(
        <h3 key={i} className="mt-6 mb-2 text-lg font-bold">
          {inline(line.slice(4))}
        </h3>,
      );
      i++;
    } else if (line.startsWith('- ')) {
      const start = i;
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) items.push(lines[i++]!.slice(2));
      out.push(
        <ul key={start} className="mb-4 list-disc space-y-1.5 pl-6">
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </ul>,
      );
    } else if (line.startsWith('|')) {
      const start = i;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i]!.trim())) rows.push(cells(lines[i]!));
        i++;
      }
      const [head, ...body] = rows;
      const headed = head?.some(Boolean);
      out.push(
        <div key={start} className="mb-6 overflow-x-auto rounded-2xl border border-ink/10">
          <table className={`w-full text-left text-sm ${(head?.length ?? 0) > 2 ? 'min-w-[40rem]' : ''}`}>
            {headed ? (
              <thead className="bg-ink/5">
                <tr>
                  {head!.map((cell, n) => (
                    <th key={n} className="px-4 py-3 font-bold">
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody className="divide-y divide-ink/10">
              {body.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, n) =>
                    n === 0 && !headed ? (
                      <th key={n} scope="row" className="px-4 py-3 font-semibold text-ink/70">
                        {inline(cell)}
                      </th>
                    ) : (
                      <td key={n} className="px-4 py-3 align-top">
                        {inline(cell)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      const start = i;
      const text: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(#|- |\|)/.test(lines[i]!)) text.push(lines[i++]!);
      out.push(
        <p key={start} className="mb-4">
          {inline(text.join(' '))}
        </p>,
      );
    }
  }
  return out;
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const markdown = readLegal(doc);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 leading-relaxed text-ink/85 sm:py-12">
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {legalTitle(markdown)}
      </h1>
      {blocks(markdown)}
    </main>
  );
}
