'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft, Bot, Captions, Clapperboard, Film, History, Info, Mic, Palette, Redo2, RotateCcw, Settings2, Sparkles, Type, Undo2, UserRound, Users, Volume2 } from 'lucide-react';
import type { HistoryStep } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const label = 'text-[10px] font-semibold uppercase tracking-wide text-ink/50';
type Filter = 'all' | 'you' | 'agent';

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;

/** The kind of a change, read from its label: shown as a small icon on the avatar (board 24). */
function kindOf(text: string): { icon: typeof Film; name: string } {
  const t = text.toLowerCase();
  if (/voice|dub|speak|take/.test(t)) return { icon: Mic, name: 'voice' };
  if (/colou?r|look|grade/.test(t)) return { icon: Palette, name: 'colour' };
  if (/transition|dissolve|fade|wipe/.test(t)) return { icon: ArrowRightLeft, name: 'transition' };
  if (/caption|subtitle/.test(t)) return { icon: Captions, name: 'caption' };
  if (/line|script|story|title|text/.test(t)) return { icon: Type, name: 'script' };
  if (/sound|music|loud|volume|duck|mute/.test(t)) return { icon: Volume2, name: 'sound' };
  if (/character|cast|rename/.test(t)) return { icon: Users, name: 'cast' };
  if (/effect|shake|vignette|blur/.test(t)) return { icon: Sparkles, name: 'effect' };
  if (/setting|size/.test(t)) return { icon: Settings2, name: 'settings' };
  if (/scene|cue/.test(t)) return { icon: Clapperboard, name: 'scene' };
  return { icon: Film, name: 'shot' };
}
const isAgent = (step: HistoryStep) => !!step.by && step.by !== 'you';
function ago(at: number | undefined, now: number) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}
const dayOf = (at: number | undefined, now: number) => {
  if (!at) return 'Earlier';
  const d = new Date(at), today = new Date(now); today.setHours(0, 0, 0, 0);
  return d >= today ? 'Today' : d.getTime() >= today.getTime() - 86400000 ? 'Yesterday' : d.toLocaleDateString();
};

/** One avatar: who made the change (you or an agent), with the kind of change as a small icon. Agents in amber. */
function Avatar({ step }: { step: HistoryStep }) {
  const agent = isAgent(step), Kind = kindOf(step.label).icon, Who = agent ? Bot : UserRound;
  return <span aria-hidden className={`relative flex size-7 shrink-0 items-center justify-center rounded-full ${agent ? 'bg-amber-400/20 text-amber-500' : 'bg-ink/10 text-ink/70'}`}>
    <Who className="size-3.5" />
    <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-surface ring-1 ring-ink/15"><Kind className="size-2.5 text-ink/70" /></span>
  </span>;
}

/**
 * History tab (board 24): every change, newest first, with who made it (you or an agent through MCP) and when.
 * Undo the last change, or go back to any moment; later changes can still be redone from there.
 */
export function HistoryTab({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, history = studio.film.history, off = studio.rendering || filming.busy;
  const [filter, setFilter] = useState<Filter>('all'), [chosen, setChosen] = useState<number | null>(null), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  // `done` = how many steps stay done when going back to a step (index into past, then the undone ones after it).
  const past = history.past, undone = [...history.future].reverse();
  const all = [...past.map((step, i) => ({ step, done: i + 1, redo: false })), ...undone.map((step, i) => ({ step, done: past.length + i + 1, redo: true }))];
  const shown = all.filter(({ step }) => filter === 'all' || (filter === 'agent' ? isAgent(step) : !isAgent(step))).reverse();
  const current = all.find((x) => x.done === chosen);
  const goto = (done: number, text: string) => {
    if (!window.confirm(`Go back to the moment ${text}? Later changes can still be redone from History.`)) return;
    const r = studio.run('history.goto', { done }); if (r.ok) setChosen(null);
  };
  const agentCount = all.filter(({ step }) => isAgent(step)).length;
  let lastDay = '';
  return <section aria-label="History" data-film-id="film.history" className="text-ink">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <History className="size-4 text-ink/60" /><b className="flex-1 text-xs">History</b>
      <button type="button" className={icon} aria-label="Undo the last change" title={history.undoLabel ? `Undo ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
        disabled={off || !history.undoLabel} onClick={() => studio.run('edit.undo')}><Undo2 className="size-4" /></button>
      <button type="button" className={icon} aria-label="Redo" title={history.redoLabel ? `Redo ${history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        disabled={off || !history.redoLabel} onClick={() => studio.run('edit.redo')}><Redo2 className="size-4" /></button>
      <Help text="Every change, newest first. Agents' changes (through MCP) show in amber. Click a change to undo it or go back to that moment." />
    </div>
    <div className="px-3 py-2">
      <div role="radiogroup" aria-label="Whose changes" className="flex gap-0.5 rounded-md border border-ink/10 bg-paper p-0.5">
        {([['all', 'All'], ['you', 'You'], ['agent', `Agents${agentCount ? ` · ${agentCount}` : ''}`]] as const).map(([v, text]) => <button key={v} type="button" role="radio" aria-checked={filter === v}
          className={`flex-1 rounded px-2.5 py-1 text-xs font-semibold ${filter === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`} onClick={() => setFilter(v)}>{text}</button>)}
      </div>
    </div>
    <ul className="space-y-0.5 px-2 pb-2">
      {shown.map(({ step, done, redo }) => {
        const day = dayOf(step.at, now), head = day !== lastDay; lastDay = day;
        const agent = isAgent(step), last = done === past.length;
        return <li key={done}>
          {head ? <p className={`${label} px-1 pb-0.5 pt-1.5`}>{day}</p> : null}
          <button type="button" aria-pressed={chosen === done} disabled={off} onClick={() => setChosen(chosen === done ? null : done)}
            data-film-id={`film.history.${done}`}
            className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs hover:bg-ink/5 aria-pressed:bg-ink/10 aria-pressed:ring-1 aria-pressed:ring-ink/30 ${redo ? 'opacity-45' : ''}`}>
            <Avatar step={step} />
            <span className="min-w-0 flex-1"><b className={`block text-[11px] ${agent ? 'text-amber-500' : 'text-ink/70'}`}>{agent ? (step.by === 'agent' ? 'Agent' : step.by) : 'You'}</b>
              <span className="block truncate">{step.label}</span></span>
            <span className="shrink-0 text-right text-[10px] text-ink/50">{last ? <span className="block font-semibold text-ink/70">now</span> : redo ? <span className="block">undone</span> : null}{ago(step.at, now)}</span>
          </button>
        </li>; })}
      {!shown.length ? <li className="px-1 py-2 text-xs text-ink/60">{all.length ? 'No changes by this filter.' : 'No changes yet. Every edit you or an agent make shows here and can be undone.'}</li> : null}
      {filter === 'all' && all.length ? <li><button type="button" disabled={off || past.length === 0} onClick={() => goto(0, 'before the first change')}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs text-ink/60 hover:bg-ink/5 disabled:opacity-60">
        <RotateCcw className="size-3.5" />Start · before the first change</button></li> : null}
    </ul>
    {current ? <div className="space-y-2 border-t border-ink/10 px-3 py-2 text-xs">
      <p className="flex items-center gap-2"><Avatar step={current.step} /><span className="min-w-0 flex-1"><b className="block">{current.step.label}</b>
        <span className="text-ink/55">{isAgent(current.step) ? 'Agent' : 'You'} · {kindOf(current.step.label).name}{current.step.at ? ` · ${new Date(current.step.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{current.redo ? ' · undone' : ''}</span></span></p>
      <div className="flex flex-wrap gap-1">
        {current.done === past.length ? <button type="button" className={button} disabled={off} onClick={() => { const r = studio.run('edit.undo'); if (r.ok) setChosen(null); }}><Undo2 className="size-3.5" />Undo this change</button> : null}
        {current.done !== past.length ? <button type="button" className={button} disabled={off} onClick={() => goto(current.done, `after “${current.step.label}”`)}>
          <RotateCcw className="size-3.5" />{current.redo ? 'Redo up to this change' : 'Go back to this moment'}</button> : null}
      </div>
    </div> : null}
    <p className="px-3 pb-2 text-[10px] text-ink/45">Kind of change = small icon on the avatar. Agents' changes are amber.</p>
  </section>;
}
