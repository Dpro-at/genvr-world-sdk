'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Ghost, Play, RotateCcw, SplitSquareHorizontal, X } from 'lucide-react';
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
  const compared = lab.comparison;
  const cell = move?.startsWith('mine:') ? lab.mineCheck(move)?.cells[style] : move ? (compared?.ours.move === move ? compared.ours : lab.checkReport(style, 999).find((c) => c.move === move)) : undefined;
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
          <LabCompareCard lab={lab} move={move!} style={style} onError={setError} />
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

/**
 * Board M20 · Compare: our move on the character and a private reference (My motions) on a see-through body beside it
 * or over it, on the same clock, with both check scores. Same as `motion_lab compare`.
 */
function LabCompareCard({ lab, move, style, onError }: { lab: LabController; move: string; style: MotionStyleId; onError: (e: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const shown = lab.comparison, compare = lab.view.check.compare;
  const go = (ours: string, ref: string) => { setBusy(true); onError(null); void lab.compare(ours, ref, style, compare?.place ?? 'beside').catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); };
  const isPrivate = move.startsWith('mine:');
  const privates = lab.privateMotions(), ours = lab.checkReport(style, 999).map((c) => c.move).sort();
  if (!shown || !compare) {
    if (isPrivate ? !ours.length : !privates.length) return <p className="text-[11px] text-ink/50">{isPrivate ? 'Check all moves first to compare with one of ours.' : 'Import motions in Avatar › My motions to compare with a reference.'}</p>;
    return (
      <label className="flex h-8 items-center gap-2 rounded-lg border border-ink/15 px-2 text-xs">
        <SplitSquareHorizontal className="size-3.5 shrink-0" /><span className="shrink-0 font-bold">{busy ? 'Comparing…' : 'Compare with'}</span>
        <select aria-label={isPrivate ? 'Compare with one of our moves' : 'Compare with a private motion'} disabled={busy} value="" className="min-w-0 flex-1 bg-transparent outline-none"
          onChange={(e) => { if (e.target.value) go(isPrivate ? e.target.value : move, isPrivate ? move : e.target.value); }}>
          <option value="">{isPrivate ? 'one of our moves…' : 'a private motion…'}</option>
          {isPrivate ? ours.map((m) => <option key={m} value={m}>{m}</option>)
            : privates.map((m) => <option key={m.id} value={mineKey(m.id)}>{m.name} · {m.pack}</option>)}
        </select>
      </label>);
  }
  const ref = lab.mineByKey(compare.ref);
  const cellTone = (v: number | null) => (v === null ? 'text-ink/40' : 'text-coral');
  return (
    <section aria-label="Compare" className="flex flex-col gap-1.5 rounded-lg border border-ink/10 p-2">
      <div className="flex items-center gap-2"><span className={`${label} flex-1`}>Compare · {STYLE_NAMES[style]}</span>
        <button type="button" className="rounded p-1 hover:bg-ink/10" aria-label="Stop comparing" onClick={() => lab.setCheckView({ compare: null })}><X className="size-3.5" /></button></div>
      <div className="grid grid-cols-[1fr_64px_64px] items-end gap-1 text-xs">
        <span className="text-ink/50">Check</span>
        <span className="truncate text-right"><b className="block font-mono text-lg tabular-nums">{shown.ours.score}</b>ours · {compare.ours}</span>
        <span className="truncate text-right text-cyan-600 dark:text-cyan-300"><b className="block font-mono text-lg tabular-nums">{shown.ref.score}</b>ref</span>
        {shown.rows.map((r) => <div key={r.check} className="contents">
          <span className="truncate border-t border-ink/5 py-0.5">{CHECK_NAMES[r.check] ?? r.check}</span>
          <span className={`border-t border-ink/5 py-0.5 text-right font-mono tabular-nums ${cellTone(r.ours)}`}>{r.ours === null ? 'ok' : `${r.ours} ${r.unit}`}</span>
          <span className={`border-t border-ink/5 py-0.5 text-right font-mono tabular-nums ${cellTone(r.ref)}`}>{r.ref === null ? 'ok' : `${r.ref} ${r.unit}`}</span></div>)}
      </div>
      <p className="truncate text-[11px] text-ink/50">Reference: {ref ? `${ref.name} · ${ref.pack}` : compare.ref} · private, on this device</p>
      <div role="radiogroup" aria-label="Where the reference stands" className="grid grid-cols-2 gap-1.5">
        {([['beside', 'Side by side', SplitSquareHorizontal], ['over', 'Ghost over ours', Ghost]] as const).map(([id, name, Icon]) => (
          <button key={id} type="button" role="radio" aria-checked={compare.place === id} onClick={() => lab.setComparePlace(id)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold ${compare.place === id ? 'border-ink bg-ink text-on-brand' : 'border-ink/15 hover:bg-ink/5'}`}><Icon className="size-3.5" />{name}</button>))}
      </div>
    </section>);
}
