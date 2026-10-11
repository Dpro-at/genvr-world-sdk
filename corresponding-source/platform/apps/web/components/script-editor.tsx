'use client';

import type { PlaceScript, WorldDocument } from '@genvr/contracts';
import type { WorldFinding } from '@genvr/validator';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  Info,
  Save,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../lib/api';
import { scriptEngine } from '../lib/script-engine';
import {
  describeRequest,
  filterLog,
  indent,
  lineCount,
  logTime,
  offsetOf,
  remoteChange,
  replayFailureNote,
  replayLines,
  scriptChecks,
  syntaxFinding,
  type LogLine,
} from '../lib/scripts-edit';

/** Height of one line in the editor (px); the line numbers use the same. */
const LINE_PX = 20;

type Pane = { kind: 'log' } | { kind: 'replay'; busy: boolean; lines: string[]; note: string | null };

/**
 * The plain code editor of one place script (P2-10, spec 11), desktop only, as a full window like a program: a
 * monospace text area with line numbers, Tab indents two spaces, Ctrl+S saves (one `set_script`, one undo step), Esc
 * closes. Beside it the script's Checks (click to jump to the line) and the place's script log from its open rooms, or
 * a replay of the room's last match through the sandbox in this browser. No highlighting and no editor library (spec 2).
 */
export function ScriptEditor({
  placeId,
  doc,
  script,
  lines,
  rooms,
  busy,
  onSave,
  onRemove,
  onClose,
}: {
  placeId: string;
  /** The saved place, for the Checks and the replay (its game, zones and spawn points). */
  doc: WorldDocument;
  /** The saved script; a change from elsewhere arrives here. */
  script: PlaceScript;
  /** The place's script log from its open rooms. */
  lines: LogLine[];
  /** Open rooms of the place (0: none, so no log). */
  rooms: number;
  busy: boolean;
  /** Saves the text and name; true when saved. */
  onSave: (source: string, name: string) => Promise<boolean>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState(script.source);
  const [draft, setDraft] = useState(script.source);
  const [name, setName] = useState(script.name);
  /** Another builder's text while this one has unsaved changes. */
  const [theirs, setTheirs] = useState<string | null>(null);
  const [findings, setFindings] = useState<WorldFinding[]>([]);
  const [onlyThis, setOnlyThis] = useState(true);
  const [pane, setPane] = useState<Pane>({ kind: 'log' });
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const logBox = useRef<HTMLOListElement>(null);
  /** The selection to restore after an indent changed the text (React puts the caret at the end otherwise). */
  const pendingSelection = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (!selection || !area.current) return;
    pendingSelection.current = null;
    area.current.setSelectionRange(selection[0], selection[1]);
  }, [draft]);
  const dirty = draft !== base || name.trim() !== script.name;

  // The saved script changed elsewhere (another builder, the assistant, an undo).
  useEffect(() => {
    const change = remoteChange({ base, draft }, script);
    if (change === 'take') {
      setBase(script.source);
      setDraft(script.source);
      setTheirs(null);
    } else if (change === 'conflict') setTheirs(script.source);
    setName((current) => (current.trim() === script.name || !dirty ? script.name : current));
    // Only a new saved text decides; typing does not.
  }, [script.source, script.name]);

  // Checks of the text being written: the validator at once, the syntax through the sandbox (loaded on first use).
  useEffect(() => {
    let stale = false;
    const timer = window.setTimeout(() => {
      const found = scriptChecks(doc, script.id, draft);
      setFindings(found);
      void scriptEngine
        .compileCheck(draft)
        .then((compiled) => {
          if (stale) return;
          const syntax = syntaxFinding({ id: script.id, name: script.name }, compiled);
          setFindings(syntax ? [syntax, ...found] : found);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [doc, script.id, script.name, draft]);

  const shownLog = filterLog(lines, onlyThis ? script.name : null);
  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [shownLog.length, pane.kind]);

  const save = async () => {
    const trimmed = name.trim();
    if (busy || !trimmed || !dirty) return;
    const sent = draft;
    if (await onSave(sent, trimmed)) {
      setBase(sent);
      setTheirs(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
      return;
    }
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const target = event.currentTarget;
      const next = indent(target.value, target.selectionStart, target.selectionEnd, event.shiftKey);
      pendingSelection.current = [next.start, next.end];
      setDraft(next.value);
    }
  };

  const jump = (line: number, column = 1) => {
    const target = area.current;
    if (!target) return;
    const at = offsetOf(target.value, line, column);
    target.focus();
    target.setSelectionRange(at, at);
    target.scrollTop = Math.max(0, (line - 4) * LINE_PX);
  };

  const replay = async () => {
    setPane({ kind: 'replay', busy: true, lines: [], note: null });
    try {
      const { data } = await api.GET('/v1/experiences/{id}/scripts/recording', {
        params: { path: { id: placeId } },
      });
      const recording = data?.recording ?? null;
      if (!recording || recording.events.length === 0) {
        setPane({
          kind: 'replay',
          busy: false,
          lines: [],
          note: 'No match recorded yet. Play the place in a room first (Test in the studio).',
        });
        return;
      }
      const scripts = (doc.scripts ?? []).map((one) =>
        one.id === script.id ? { ...one, source: draft } : one,
      );
      const result = await scriptEngine.dryRun({ doc, scripts, only: script.id, recording });
      setPane({
        kind: 'replay',
        busy: false,
        lines: replayLines(result, script.name),
        note: `${recording.events.length} events of the last match replayed with this text. ${
          result.requested.length === 1 ? '1 action' : `${result.requested.length} actions`
        } asked for. Nothing was saved.`,
      });
    } catch (error) {
      setPane({ kind: 'replay', busy: false, lines: [], note: replayFailureNote(error) });
    }
  };

  const total = lineCount(draft);

  /** Close; unsaved text is lost only after asking. */
  const close = () => {
    if (!dirty || window.confirm('Close without saving? The unsaved text is lost.')) onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  // Esc closes the window wherever the focus is.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Script ${script.name}`}
      className="fixed inset-0 z-50 flex bg-paper p-3 text-ink xl:p-5"
    >
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink/10">
        <header className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
          <ScrollText className="size-4 shrink-0 text-ink/60" aria-hidden />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            aria-label="Script name"
            className="w-72 min-w-0 rounded-lg bg-transparent px-1.5 py-1 text-sm font-black outline-none focus:bg-paper focus:ring-2 focus:ring-ink/20"
          />
          <span className="text-xs font-bold text-ink/40" aria-live="polite">
            {dirty ? 'Not saved' : 'Saved'}
          </span>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty || !name.trim()}
            title="Save (Ctrl+S). Saving restarts the match in open rooms."
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-on-brand disabled:opacity-30"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </button>
          <a
            href={`/places/${placeId}/play`}
            target="_blank"
            rel="noreferrer"
            title="Open the studio; Test there runs the saved text"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-paper px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/10"
          >
            Test in the studio
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remove this script"
            title="Remove this script"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-coral hover:bg-coral/10 disabled:opacity-30"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close the editor"
            title="Close (Esc)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink/60 hover:bg-ink/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {theirs !== null ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 bg-paper px-3 py-2 text-xs font-bold">
            <AlertTriangle className="size-4 shrink-0 text-coral" aria-hidden />
            <span className="flex-1">Changed by another builder while you were writing.</span>
            <button
              type="button"
              onClick={() => {
                setBase(theirs);
                setDraft(theirs);
                setTheirs(null);
              }}
              className="rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-ink/10 hover:bg-ink/5"
            >
              Load theirs
            </button>
            <button
              type="button"
              onClick={() => {
                // Saving now wins, as an ordinary later change.
                setBase(theirs);
                setTheirs(null);
              }}
              className="rounded-lg bg-ink px-2.5 py-1.5 text-on-brand"
            >
              Keep mine
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 font-mono text-[13px] leading-5">
            <div
              ref={gutter}
              aria-hidden
              className="w-12 shrink-0 overflow-hidden border-r border-ink/10 py-2 pr-2 text-right text-ink/35 select-none"
            >
              {Array.from({ length: total }, (_, index) => (
                <div key={index} className="h-5">
                  {index + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={area}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onScroll={(event) => {
                if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              autoFocus
              aria-label={`Source of ${script.name}`}
              className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 whitespace-pre text-ink outline-none [scrollbar-width:thin] [tab-size:2]"
            />
          </div>

          <aside className="flex w-[26rem] shrink-0 flex-col border-l border-ink/10">
            <div
              className="max-h-[45%] shrink-0 overflow-y-auto border-b border-ink/10 px-3 py-2 [scrollbar-width:thin]"
              aria-live="polite"
            >
              <h4 className="pb-1 text-xs font-black tracking-wide text-ink/50 uppercase">Checks</h4>
              {findings.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
                  <CheckCircle2 className="size-3.5 text-mint" aria-hidden />
                  Nothing found in this script.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {findings.map((finding) => {
                    const line = finding.script?.line;
                    const Icon = finding.level === 'warning' ? AlertTriangle : Info;
                    return (
                      <li key={finding.id}>
                        <button
                          type="button"
                          disabled={!line}
                          onClick={() => line && jump(line, finding.script?.column)}
                          className="flex w-full items-start gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold text-ink/80 enabled:hover:bg-ink/5"
                        >
                          <Icon
                            className={`mt-0.5 size-3.5 shrink-0 ${finding.level === 'warning' ? 'text-coral' : 'text-ink/50'}`}
                            aria-hidden
                          />
                          <span>
                            {line ? <span className="font-black">Line {line}: </span> : null}
                            {finding.message}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 px-3 pt-2">
                {pane.kind === 'log' ? (
                  <>
                    <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">Log</h4>
                    <div
                      className="ml-auto flex rounded-lg bg-paper p-0.5"
                      role="group"
                      aria-label="Log lines"
                    >
                      {(
                        [
                          [true, 'This script'],
                          [false, 'All'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={onlyThis === value}
                          onClick={() => setOnlyThis(value)}
                          className={`rounded-md px-2 py-1 text-xs font-bold ${onlyThis === value ? 'bg-ink text-on-brand' : 'text-ink/60 hover:text-ink'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">
                      Replay of the last match
                    </h4>
                    <button
                      type="button"
                      onClick={() => setPane({ kind: 'log' })}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-ink/70 hover:bg-ink/5 hover:text-ink"
                    >
                      <ScrollText className="size-3.5" aria-hidden />
                      Back to the log
                    </button>
                  </>
                )}
              </div>
              <ol
                ref={logBox}
                className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5 [scrollbar-width:thin]"
                aria-live="polite"
              >
                {pane.kind === 'replay' ? (
                  <>
                    {pane.busy ? <li className="font-sans font-bold text-ink/50">Replaying…</li> : null}
                    {pane.note ? <li className="pb-1 font-sans font-bold text-ink/50">{pane.note}</li> : null}
                    {pane.lines.map((text, index) => (
                      <li key={index} className={text.includes(', refused') ? 'text-coral' : 'text-ink/80'}>
                        {text}
                      </li>
                    ))}
                  </>
                ) : shownLog.length === 0 ? (
                  <li className="font-sans font-bold text-ink/50">
                    {rooms === 0
                      ? 'No room is open. The log fills while people play or test the place.'
                      : 'Nothing logged yet.'}
                  </li>
                ) : (
                  shownLog.map((line, index) => (
                    <li
                      key={`${line.at}-${index}`}
                      className={
                        line.level === 'error' || line.level === 'off'
                          ? 'text-coral'
                          : line.level === 'log'
                            ? 'text-ink/80'
                            : 'text-ink/55'
                      }
                    >
                      <span className="text-ink/35">{logTime(line.at)} </span>
                      {onlyThis || !line.script ? '' : `${line.script}: `}
                      {line.line && line.script === script.name ? (
                        <button
                          type="button"
                          onClick={() => jump(line.line!)}
                          className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                        >
                          line {line.line}
                        </button>
                      ) : line.line ? (
                        `line ${line.line}`
                      ) : null}
                      {line.line ? ' ' : ''}
                      {line.text}
                    </li>
                  ))
                )}
              </ol>
              {pane.kind === 'log' ? (
                <div className="border-t border-ink/10 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void replay()}
                    title="Run the room's last match again with this text, here in the browser; nothing is saved"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-ink/70 hover:bg-ink/5 hover:text-ink"
                  >
                    <History className="size-3.5" aria-hidden />
                    Replay last match with this text
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
