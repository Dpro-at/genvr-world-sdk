import { FlaskConical, Play, Square } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { GAME_BASE_MOVES, MADE_TRAVEL_PACE, type GameBaseMove } from '@genvr/contracts';
import type { MadeMovesController } from '../../../apps/web/lib/made-moves';

type Row = Awaited<ReturnType<MadeMovesController['mine']>>[number];

/**
 * Avatar › Moves › My motions, made in the Lab (board M19): each saved version with its score; Preview plays it on this
 * project's avatar; Use in the game puts it on a key 1–8 (once or loop) or instead of a base move (Walk and Run only
 * for a travelling loop that passed the course); Stop using takes it off. The same as avatar_studio move_use.
 */
export function MadeMotionsPanel({ moves }: { moves: MadeMovesController }) {
  useSyncExternalStore(moves.subscribe, moves.getVersion, moves.getVersion);
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [open, setOpen] = useState<string | null>(null);
  const [slot, setSlot] = useState(1), [loop, setLoop] = useState(false), [base, setBase] = useState<GameBaseMove>('Idle');
  const refresh = () => { void moves.mine().then(setRows, (e) => setError(String(e))); };
  useEffect(() => { refresh(); return moves.store.subscribe?.(refresh); }, [moves, moves.getVersion()]);
  const act = (fn: () => unknown) => { setError(''); void Promise.resolve().then(fn).then(refresh, (e) => setError(e instanceof Error ? e.message : String(e))); };
  const latest = rows.filter((row, i) => rows.findIndex((r) => r.name === row.name) === i);
  const why = (row: Row, move: GameBaseMove) => (move === 'Walk' || move === 'Run') && (!row.loop || row.travels < MADE_TRAVEL_PACE || !row.passes_course)
    ? (!row.loop ? 'needs a loop' : row.travels < MADE_TRAVEL_PACE ? 'does not walk' : 'did not pass the course') : move === 'Idle' && !row.loop ? 'needs a loop' : '';
  return (
    <section aria-label="My motions made in the Lab" className="space-y-2 text-ink">
      <h3 className="flex items-center gap-1.5 text-xs font-bold"><FlaskConical size={15} />Made in the Lab<span className="text-ink/50">{latest.length}</span></h3>
      {!latest.length ? <p className="rounded-lg border border-dashed border-ink/20 p-3 text-center text-[11px] text-ink/50">Make a motion in the Lab (Pose and keys), then Save as version: it shows here.</p> : null}
      <ul className="space-y-1.5">
        {latest.map((row) => (
          <li key={row.id} className={`rounded-lg border p-2 ${row.used ? 'border-amber-500/60 bg-amber-500/10' : 'border-ink/10'}`}>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={`Preview ${row.name}`} title="Preview on this project's avatar" onClick={() => act(() => moves.preview(row.id))} className="flex size-8 items-center justify-center rounded-lg bg-ink/5 hover:bg-ink/10"><Play size={14} /></button>
              <div className="min-w-0 flex-1"><b className="block truncate text-xs">{row.name}</b><span className="text-[10px] text-ink/55">v{row.version} · score {row.score}{row.used ? ` · ${row.used.slot !== undefined ? `key ${row.used.slot}` : `replaces ${row.used.replaces}`}` : ''}</span></div>
              {row.used ? <button type="button" title="Stop using in the game" aria-label={`Stop using ${row.name}`} onClick={() => act(() => moves.unuse(row.id))} className="rounded-lg p-1.5 hover:bg-ink/10"><Square size={13} /></button> : null}
              <button type="button" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)} className="rounded-lg border border-ink/15 px-2 py-1 text-[11px] font-bold hover:bg-ink/5">Use in the game</button>
            </div>
            {open === row.id ? (
              <div className="mt-2 grid gap-1.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-20 text-ink/60">On a key</span>
                  <select aria-label="Key" value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="rounded border border-ink/15 bg-paper px-1 py-0.5">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />loop</label>
                  <button type="button" onClick={() => act(() => moves.use(row.id, { slot }, !loop))} className="ml-auto rounded bg-ink px-2 py-0.5 font-bold text-on-brand">Use on key {slot}</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-20 text-ink/60">Instead of</span>
                  <select aria-label="Base move" value={base} onChange={(e) => setBase(e.target.value as GameBaseMove)} className="rounded border border-ink/15 bg-paper px-1 py-0.5">
                    {GAME_BASE_MOVES.map((m) => <option key={m} value={m} disabled={Boolean(why(row, m))}>{m}{why(row, m) ? ` — ${why(row, m)}` : ''}</option>)}
                  </select>
                  <button type="button" disabled={Boolean(why(row, base))} title={why(row, base) || `Use instead of ${base} for this project's avatar`} onClick={() => act(() => moves.use(row.id, { replaces: base }))} className="ml-auto rounded bg-ink px-2 py-0.5 font-bold text-on-brand disabled:opacity-40">Replace {base}</button>
                </div>
                <p className="text-[10px] text-ink/50">Plays on this project&apos;s avatar in Test world and play.{row.shareable ? '' : ' Not shareable, so it stays out of published worlds.'}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
