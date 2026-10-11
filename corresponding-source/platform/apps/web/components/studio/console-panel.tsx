'use client';

import type { GenvrRuntime, WorldReport } from '@genvr/runtime';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ResourceDiagnostics } from './resource-diagnostics';

export interface LogEntry {
  id: number;
  at: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

type Tab = 'output' | 'performance' | 'checks' | 'resources';

/** Findings the rest law is about (P2-43): grouped under one line in the Checks tab, since to a
 * creator they are all the same thing — something is not resting on the ground right. */
const REST_CODES = new Set(['floating', 'buried', 'slope']);

/**
 * Studio console (P3-06): the output of the session (saves, rejected edits, room, safety notes)
 * live performance (FPS, draw calls, triangles, objects), and the world checks (P2-12):
 * floating, buried, slope and overlapping items, the spawn point, and the phone budget, each with
 * Show (selects the items) and Fix (one undo step) where a fix is safe; Keep marks a floating
 * item as meant to float (P2-11). Floating, buried and slope findings (P2-43, the rest law) are
 * grouped under one summary line with their own Fix all.
 */
export function ConsolePanel({
  runtime,
  logs,
  onClear,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  logs: LogEntry[];
  onClear: () => void;
}) {
  const [tab, setTab] = useState<Tab>('output');
  const list = useRef<HTMLOListElement>(null);
  const [stats, setStats] = useState({ fps: 0, drawCalls: 0, triangles: 0, objects: 0 });
  const [report, setReport] = useState<WorldReport | null>(null);
  // Checking casts rays for every item, so it runs on demand (opening the tab, Check again, a fix).
  // Debug view (P2-11): red boxes in the world around the items the checks are about.
  const [marking, setMarking] = useState(false);
  const runChecks = () => setReport(runtime.current?.checkWorld() ?? null);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const shown = marking && tab === 'checks' && report ? report.findings : [];
    rt.markItems(
      shown.flatMap((f) => f.instanceIds),
      shown.flatMap((f) => (f.area ? [f.area] : [])),
    );
  }, [marking, tab, report, runtime]);
  useEffect(() => () => runtime.current?.markItems([]), [runtime]);
  useEffect(() => {
    if (tab === 'checks') setReport(runtime.current?.checkWorld() ?? null);
  }, [tab, runtime]);
  const applyFix = (commands: NonNullable<WorldReport['findings'][number]['fix']>) => {
    runtime.current?.applyBatch(commands);
    runChecks();
  };
  const fixable = report?.findings.filter((finding) => finding.fix) ?? [];
  const restFindings = report?.findings.filter((finding) => REST_CODES.has(finding.code)) ?? [];
  const otherFindings = report?.findings.filter((finding) => !REST_CODES.has(finding.code)) ?? [];
  const restFixable = restFindings.filter((finding) => finding.fix);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [logs.length, tab]);

  useEffect(() => {
    if (tab !== 'performance') return;
    const read = () => {
      const current = runtime.current?.stats();
      if (current) setStats(current);
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [tab, runtime]);

  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });
  const findingRow = (finding: WorldReport['findings'][number]) => (
    <li key={finding.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-ink/5">
      <AlertTriangle
        className={`size-3.5 shrink-0 ${finding.level === 'warning' ? 'text-coral' : 'text-ink/40'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate" title={finding.message}>
        {finding.message}
      </span>
      {finding.instanceIds.length > 0 ? (
        <button
          type="button"
          onClick={() => runtime.current?.selectItems(finding.instanceIds)}
          className="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-ink/60 hover:bg-ink/10 hover:text-ink"
        >
          Show
        </button>
      ) : null}
      {finding.code === 'floating' ? (
        <button
          type="button"
          title="It is meant to hang in the air"
          onClick={() =>
            applyFix(
              finding.instanceIds.map((instanceId) => ({
                type: 'set_item_flags',
                params: { instanceId, floats: true },
              })),
            )
          }
          className="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-ink/60 hover:bg-ink/10 hover:text-ink"
        >
          Keep
        </button>
      ) : null}
      {finding.fix ? (
        <button
          type="button"
          onClick={() => applyFix(finding.fix!)}
          className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 font-bold text-on-brand hover:bg-ink/85"
        >
          Fix
        </button>
      ) : null}
    </li>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-ink/10 px-2">
        {(['output', 'performance', 'checks', 'resources'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-2 py-1.5 text-xs font-bold capitalize ${
              tab === id ? 'border-ink text-ink' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {id}
            {id === 'checks' && report && report.findings.length > 0 ? (
              <span className="ml-1 rounded-full bg-ink/10 px-1.5 text-[10px]">{report.findings.length}</span>
            ) : null}
          </button>
        ))}
        <span className="flex-1" />
        {tab === 'output' ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear the output"
            title="Clear"
            className="rounded-md p-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
        {tab === 'checks' ? (
          <>
            {fixable.length > 1 ? (
              <button
                type="button"
                onClick={() => applyFix(fixable.flatMap((finding) => finding.fix!))}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-ink/70 hover:bg-ink/5 hover:text-ink"
              >
                <Wrench className="size-3.5" aria-hidden />
                Fix all ({fixable.length})
              </button>
            ) : null}
            <button
              type="button"
              aria-pressed={marking}
              onClick={() => setMarking((on) => !on)}
              aria-label={marking ? 'Hide the marks in the world' : 'Mark them in the world'}
              title={marking ? 'Hide the marks in the world' : 'Mark them in the world'}
              className={`rounded-md p-1 hover:bg-ink/5 hover:text-ink ${marking ? 'text-ink' : 'text-ink/50'}`}
            >
              {marking ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={runChecks}
              aria-label="Check again"
              title="Check again"
              className="rounded-md p-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
            >
              <RefreshCw className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      {tab === 'resources' ? (
        <ResourceDiagnostics runtime={runtime} />
      ) : tab === 'checks' ? (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 text-xs">
          {report && report.findings.length === 0 ? (
            <li className="flex items-center gap-2 px-1 py-1 text-ink/60">
              <CheckCircle2 className="size-4" aria-hidden />
              No problems found in {report.stats.items.toLocaleString()} items.
            </li>
          ) : null}
          {restFindings.length > 0 ? (
            <li className="flex items-center gap-2 rounded-md px-1 py-1">
              <AlertTriangle className="size-3.5 shrink-0 text-coral" aria-hidden />
              <span className="min-w-0 flex-1 font-bold">
                {restFindings.length} thing{restFindings.length === 1 ? '' : 's'} not resting on the ground.
              </span>
              {restFixable.length > 0 ? (
                <button
                  type="button"
                  onClick={() => applyFix(restFixable.flatMap((finding) => finding.fix!))}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-ink/60 hover:bg-ink/10 hover:text-ink"
                >
                  <Wrench className="size-3.5" aria-hidden />
                  Put them on the ground ({restFixable.length})
                </button>
              ) : null}
            </li>
          ) : null}
          {restFindings.map((finding) => findingRow(finding))}
          {otherFindings.map((finding) => findingRow(finding))}
        </ul>
      ) : tab === 'output' ? (
        <ol ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-xs">
          {logs.length === 0 ? <li className="text-ink/40">No messages yet.</li> : null}
          {logs.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.level === 'error' ? 'text-coral' : entry.level === 'warn' ? 'text-ink' : 'text-ink/70'
              }
            >
              <span className="text-ink/40">{time(entry.at)}</span> {entry.text}
            </li>
          ))}
        </ol>
      ) : (
        <dl className="grid flex-1 grid-cols-2 content-start gap-2 p-3 sm:grid-cols-4">
          {(
            [
              ['FPS', stats.fps],
              ['Draw calls', stats.drawCalls],
              ['Triangles', stats.triangles.toLocaleString()],
              ['Objects', stats.objects.toLocaleString()],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-paper px-3 py-2">
              <dt className="text-xs font-bold text-ink/50">{label}</dt>
              <dd className="font-mono text-lg font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
