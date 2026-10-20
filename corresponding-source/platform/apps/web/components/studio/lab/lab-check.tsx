'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, X } from 'lucide-react';
import { MOTION_STYLES, type MotionCheckCell, type MotionCheckLimits, type MotionStyleId } from '@genvr/contracts';
import { PERSON, mineKey, type LabController } from '../../../lib/motion-lab';
import { LabModeSwitch } from './lab-pose';

/**
 * Board M16 · the Lab's Check mode: every move checked on the Lab body in one style at a time (left: style chips,
 * Check all moves and the moves worst first), and the open move's card with its issues by frame, Show frame, Check
 * again, and the style's limits (right). Every control has a `motion_lab` operation with the same result; an agent's
 * change to a style waits here for the owner.
 */
const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const STYLE_NAMES: Record<MotionStyleId, string> = { realistic: 'Realistic', game: 'Game', anime: 'Anime' };
const CHECK_NAMES: Record<string, string> = { foot_slide: 'Foot slide', ground: 'Ground', joint_limits: 'Joint limits', body_clash: 'Body clash', balance: 'Balance', loop_seam: 'Loop seam', speed_match: 'Speed match' };
const LIMIT_FIELDS: Array<[keyof MotionCheckLimits, string, string]> = [['foot_slide_cm', 'Foot slide', 'cm'], ['ground_cm', 'Ground', 'cm'], ['joint_extra_deg', 'Joint extra', '°'],
  ['body_clash_cm', 'Body clash', 'cm'], ['balance_s', 'Balance', 's'], ['loop_seam_deg', 'Loop seam', '°'], ['speed_match_pct', 'Speed match', '%']];

function useLab(lab: LabController) { useSyncExternalStore(lab.subscribe, lab.getVersion, lab.getVersion); return lab; }
function tryRun(fn: () => unknown, setError: (e: string | null) => void) { try { fn(); setError(null); } catch (e) { setError(e instanceof Error ? e.message.split('\n')[0]! : String(e)); } }
const tone = (score: number) => (score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-amber-500' : 'bg-coral');
const issueText = (cell: MotionCheckCell) => { const i = cell.issues[0]; return i ? `${CHECK_NAMES[i.check] ?? i.check} ${i.value} ${i.unit}` : 'no issues'; };

export function LabCheckLeft({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const { style, move } = lab.view.check;
  const cells = lab.checkReport(style, 200);
  // Board M20: the private motions (My motions, e.g. Mixamo), checked one by one; the results stay in memory.
  const [source, setSource] = useState<'ours' | 'mine'>('ours'), [query, setQuery] = useState(''), [busy, setBusy] = useState<string | null>(null);
  const mine = lab.privateMotions(query).slice(0, 80);
  const tryOne = (key: string) => { setBusy(key); setError(null); void lab.tryMine(key, style).then(() => lab.setCheckView({ move: key, frame: null }), (e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(null)); };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3">
      <LabModeSwitch lab={lab} />
      <div role="radiogroup" aria-label="Motion style" className="grid grid-cols-3 gap-1">
        {MOTION_STYLES.map((s) => <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => lab.setCheckView({ style: s })}
          className={`rounded-full py-1 text-[11px] font-bold ${style === s ? 'bg-ink text-on-brand' : 'bg-ink/5 hover:bg-ink/10'}`}>{STYLE_NAMES[s]}</button>)}
      </div>
      <div role="radiogroup" aria-label="Moves to check" className="grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-0.5">
        {([['ours', 'Our moves'], ['mine', 'My motions · private']] as const).map(([id, name]) => <button key={id} type="button" role="radio" aria-checked={source === id} onClick={() => setSource(id)}
          className={`rounded-md py-1 text-[11px] font-bold ${source === id ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/10'}`}>{name}</button>)}
      </div>
      {source === 'mine' ? <>
        <p className="text-[11px] text-ink/50">Imported in Avatar › My motions. They stay on this device: compare and learn; never shared or adopted.</p>
        <input aria-label="Search my motions" placeholder={`Search ${lab.privateMotions().length} motions`} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 rounded-lg border border-ink/10 bg-paper px-2 text-xs outline-none" />
        <ul className="flex flex-col gap-0.5" aria-label="My motions">
          {mine.length === 0 ? <li className="text-xs text-ink/50">{lab.privateMotions().length ? 'No match.' : 'No motions yet: import them in Avatar › My motions (drop the folder).'}</li> : null}
          {mine.map((m) => { const key = mineKey(m.id), cell = lab.mineCheck(key)?.cells[style]; return (
            <li key={m.id}><button type="button" aria-pressed={move === key} disabled={busy !== null} onClick={() => tryOne(key)}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs disabled:opacity-60 ${move === key ? 'bg-ink/10 ring-1 ring-ink' : 'hover:bg-ink/5'}`}>
              {cell ? <span className={`size-2 shrink-0 rounded-full ${tone(cell.score)}`} /> : <span className="size-2 shrink-0 rounded-full bg-ink/20" />}
              <b className="min-w-0 flex-1 truncate">{m.name}</b><span className="max-w-[40%] truncate text-[11px] text-ink/50">{busy === key ? 'checking…' : m.pack}</span>
              <b className="w-7 text-right font-mono tabular-nums">{cell?.score ?? ''}</b></button></li>); })}
        </ul></> : <>
      <button type="button" className="flex h-9 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-bold text-on-brand" onClick={() => tryRun(() => lab.checkAll(), setError)}>
        <Play className="size-4" />Check all moves</button>
      <p className="text-[11px] text-ink/50">{lab.data.check ? `Checked ${new Date(lab.data.check.at).toLocaleString()} · on the Standard robot · fixed step 1/60 s` : 'Every move on the Standard robot, in all three styles. Other bodies are checked in the Studio later.'}</p>
      {cells.length ? <>
        <div className="flex items-center gap-2"><span className={`${label} flex-1`}>Moves · worst first</span><span className="text-[11px] text-ink/50">mean {Math.round(cells.reduce((a, c) => a + c.score, 0) / cells.length)}</span></div>
        <ul className="flex flex-col gap-0.5" aria-label="Checked moves">
          {cells.map((cell) => (
            <li key={cell.move}><button type="button" aria-pressed={move === cell.move} onClick={() => lab.setCheckView({ move: cell.move, frame: null })}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs ${move === cell.move ? 'bg-ink/10 ring-1 ring-ink' : 'hover:bg-ink/5'}`}>
              <span className={`size-2 shrink-0 rounded-full ${tone(cell.score)}`} /><b className="min-w-0 flex-1 truncate">{cell.move}</b>
              <span className="truncate text-[11px] text-ink/50">{issueText(cell)}</span><b className="w-7 text-right font-mono tabular-nums">{cell.score}</b></button></li>
          ))}
        </ul></> : null}</>}
      {error ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{error}</p> : null}
    </div>
  );
}

export function LabCheckRight({ lab }: { lab: LabController }) {
  useLab(lab);
  const [error, setError] = useState<string | null>(null);
  const { style, move, frame } = lab.view.check;
  const privateMotion = move?.startsWith('mine:') ? lab.mineByKey(move) : undefined;
  const cell = move?.startsWith('mine:') ? lab.mineCheck(move)?.cells[style] : move ? lab.checkReport(style, 999).find((c) => c.move === move) : undefined;
  const limits = lab.data.styles[style].limits, pending = lab.data.style_pending;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      {pending ? (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs">
          <span className="flex-1">{pending.by} asks to change the {STYLE_NAMES[pending.style]} style:{' '}
            {Object.entries({ ...pending.params, ...pending.limits }).map(([key, value]) => {
              const now = (lab.data.styles[pending.style].params as Record<string, unknown>)[key] ?? (lab.data.styles[pending.style].limits as Record<string, unknown>)[key];
              return <b key={key} className="mr-1 font-mono">{key} {JSON.stringify(now)} → {JSON.stringify(value)}</b>; })}</span>
          <button type="button" className="flex items-center gap-1 rounded bg-ink px-2 py-1 font-bold text-on-brand" onClick={() => tryRun(() => lab.confirmPendingStyle(PERSON, JSON.stringify(pending)), setError)}><Check className="size-3.5" />Apply</button>
          <button type="button" className="rounded px-2 py-1 font-bold hover:bg-ink/10" onClick={() => lab.rejectPendingStyle()}>No</button>
        </div>) : null}
      {cell ? (
        <section aria-label={`${cell.move} card`} className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><div className="flex-1"><div className={label}>Move card · {STYLE_NAMES[style]}</div><b className="text-sm">{privateMotion ? `${privateMotion.name} · ${privateMotion.pack}` : cell.move} · Standard robot</b>{privateMotion ? <div className="text-[11px] text-ink/50">Private reference · on this device · pace {lab.mineCheck(move!)?.pace.speed ?? 0} m/s</div> : null}</div>
            <b className="font-mono text-2xl tabular-nums">{cell.score}</b>
            <button type="button" className="rounded p-1.5 hover:bg-ink/10" aria-label="Close the card" onClick={() => lab.setCheckView({ move: null, frame: null })}><X className="size-4" /></button></div>
          <span className={label}>Issues · worst first</span>
          {cell.issues.length === 0 ? <p className="text-xs text-ink/50">No issue within the {STYLE_NAMES[style]} limits.</p> : null}
          <ul className="flex flex-col gap-0.5" aria-label="Issues">
            {cell.issues.slice(0, 12).map((issue, i) => (
              <li key={i}><button type="button" aria-pressed={frame === issue.from} title="Show this frame" onClick={() => lab.setCheckView({ frame: issue.from })}
                className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs ${frame === issue.from ? 'bg-ink/10' : 'hover:bg-ink/5'}`}>
                <b className="flex-1 truncate">{CHECK_NAMES[issue.check] ?? issue.check}</b><span className="font-mono text-[11px] text-ink/50">frames {issue.from}–{issue.to}</span>
                <span className="font-mono tabular-nums">{issue.value} {issue.unit}</span><span className="text-[11px] text-ink/50">/ {issue.limit}</span></button></li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink/15 text-xs font-bold hover:bg-ink/5" onClick={() => lab.setCheckView({ frame: frame === null ? 0 : null })}>
              <Play className="size-3.5" />{frame === null ? 'Hold frame 0' : 'Play'}</button>
            <button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink/15 text-xs font-bold hover:bg-ink/5" onClick={() => (move?.startsWith('mine:') ? void lab.tryMine(move, style).catch((e: unknown) => setError(String(e))) : tryRun(() => lab.checkMove(cell.move, style), setError))}>
              <RotateCcw className="size-3.5" />Check again</button>
          </div>
          <p className="text-[11px] text-ink/50">Compare (board M4) comes later.</p>
        </section>
      ) : move?.startsWith('mine:') ? <button type="button" className="h-8 rounded-lg border border-ink/15 text-xs font-bold hover:bg-ink/5" onClick={() => void lab.tryMine(move, style).catch((e: unknown) => setError(String(e)))}>Check it in {STYLE_NAMES[style]}</button>
        : <p className="text-xs text-ink/50">{lab.data.check ? 'Pick a move to open its card.' : 'Check all moves first.'}</p>}
      <section aria-label={`${STYLE_NAMES[style]} limits`} className="flex flex-col gap-1.5">
        <span className={label}>{STYLE_NAMES[style]} limits · proposals you can change</span>
        <div className="grid grid-cols-1 gap-1.5">
          {LIMIT_FIELDS.map(([key, name, unit]) => (
            <label key={key} className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-ink/10 bg-paper px-2 text-xs">
              <span className="shrink-0 text-[10px] font-black uppercase text-ink/50">{name}</span>
              <input type="number" step={key === 'balance_s' ? 0.05 : 0.5} aria-label={`${name} limit`} className="min-w-0 flex-1 bg-transparent text-right font-mono tabular-nums outline-none"
                value={limits[key] ?? ''} placeholder="not scored"
                onChange={(e) => { const v = e.target.value.trim() === '' ? null : Number(e.target.value); if (v === null && key !== 'balance_s') return; if (v !== null && !Number.isFinite(v)) return;
                  tryRun(() => lab.setStyle(style, { limits: { [key]: v } as Partial<MotionCheckLimits> }, PERSON), setError); }} />
              <span className="shrink-0 text-[10px] text-ink/50">{unit}</span>
            </label>
          ))}
        </div>
      </section>
      {error ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{error}</p> : null}
    </div>
  );
}
