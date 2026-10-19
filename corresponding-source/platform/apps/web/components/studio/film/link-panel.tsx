'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Info, LogIn, LogOut, MoreHorizontal, Repeat, Rewind, SkipForward, Sparkles, Trash2, Undo2, X, type LucideIcon } from 'lucide-react';
import { toSeconds, type ShotLink } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { DragNumber } from './drag-number';
import { ContextMenu, type MenuItem } from './context-menu';

const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const seg = (on: boolean) => `inline-flex h-7 flex-1 items-center justify-center rounded px-1.5 text-[11px] font-semibold disabled:opacity-35 ${on ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`;
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

type Kind = ShotLink['kind'];
type Look = ShotLink['look'];
const KINDS: Array<[Kind, string, LucideIcon, string]> = [
  ['continue', 'Continue', ArrowRight, 'Continue: the next shot plays after this one'],
  ['flashback', 'Flashback', Undo2, 'Flashback: jump to another shot, then return'],
  ['back', 'Back to start', Rewind, 'Back: go back to an earlier moment'],
  ['jump', 'Jump to end', SkipForward, 'Jump: skip ahead to a later moment'],
  ['loop', 'Loop', Repeat, 'Loop: play a part again'],
];
const LOOKS: Array<[Look, string]> = [['cut', 'Cut'], ['blur', 'Dream blur'], ['fade', 'Fade'], ['old_film', 'Old film']];

function Fold({ title, icon: Icon, value, open = true, help, children }: { title: string; icon: LucideIcon; value?: ReactNode; open?: boolean; help?: string; children: ReactNode }) {
  return <details open={open} className="group border-b border-ink/10">
    <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold [&::-webkit-details-marker]:hidden">
      <span className="text-ink/45 group-open:rotate-90">›</span><Icon className="size-3.5" />{title}{help ? <Help text={help} /> : null}
      {value !== undefined ? <span className="ml-auto truncate font-normal text-ink/55">{value}</span> : null}</summary>
    <div className="space-y-2 px-3 pb-3">{children}</div>
  </details>;
}

/** Board 9: a timed link between two shots (FILM-C2) on the right; every change goes through `link.set`. */
export function LinkPanel({ filming, linkId, onClose }: { filming: StudioFilming; linkId: string; onClose?: () => void }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const link = (project.links ?? []).find((l) => l.id === linkId);
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input,textarea,select')) onClose(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!link) return null;

  const shots = project.media.filter((m) => m.kind !== 'audio');
  const shot = (id: string) => project.media.find((m) => m.id === id);
  const length = (id: string) => Math.min(180, toSeconds(shot(id)?.duration ?? 0));
  const fromName = shot(link.from.media)?.name ?? 'missing shot', toName = shot(link.to.media)?.name ?? 'missing shot';
  const fromLength = length(link.from.media), toLength = length(link.to.media);
  const set = (patch: Record<string, unknown>) => studio.run('link.set', { link: link.id, ...patch });
  const kind = KINDS.find(([k]) => k === link.kind)!;
  const title = link.kind === 'continue' ? `Continue to ${toName}` : link.kind === 'loop' ? `Loop of ${toName}` : `${kind[1]} to ${toName}`;
  const setKind = (next: Kind) => {
    if (next === link.kind) return;
    // A flashback needs the time it returns to; the other kinds do not keep one.
    set({ kind: next, returnAt: next === 'flashback' ? Math.min(link.returnAt ?? link.from.at, fromLength) : null });
  };
  // A new shot keeps the times that fit inside it.
  const setFrom = (media: string) => { const max = length(media); set({ from: { media, at: Math.min(link.from.at, max) }, ...(link.returnAt !== undefined ? { returnAt: Math.min(link.returnAt, max) } : {}) }); };
  const setTo = (media: string) => set({ to: { media, at: Math.min(link.to.at, length(media)) } });
  const items: MenuItem[] = [
    { label: 'Go to the first shot', icon: LogOut, run: () => { const c = project.tracks.flatMap((t) => t.clips).find((x) => x.type === 'media' && x.media === link.from.media); if (c) { studio.select(c.id); studio.setPlayhead(toSeconds(c.start) + link.from.at); } } },
    { label: 'Go to the second shot', icon: LogIn, run: () => { const c = project.tracks.flatMap((t) => t.clips).find((x) => x.type === 'media' && x.media === link.to.media); if (c) { studio.select(c.id); studio.setPlayhead(toSeconds(c.start) + link.to.at); } } },
    'divider',
    { label: 'Delete link', icon: Trash2, danger: true, keys: 'Del', disabled: off, run: () => { if (studio.run('link.remove', { link: link.id }).ok) onClose?.(); } },
  ];
  const shotSelect = (label: string, value: string, change: (id: string) => void) => <select aria-label={label} className={input} value={value} disabled={off} onChange={(e) => change(e.target.value)}>
    {shot(value) ? null : <option value={value}>missing shot</option>}
    {shots.map((m) => <option key={m.id} value={m.id}>{m.name} · {Math.round(toSeconds(m.duration))} s</option>)}
  </select>;

  return <div className="text-xs text-ink" aria-label={`Link ${title}`}>
    <div className="flex items-start gap-2 border-b border-ink/10 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Link · {kind[1]}</div>
        <div className="truncate text-sm font-bold" title={title}>{title}</div>
        <div className="font-mono text-[11px] text-ink/55">leaves {clock(link.from.at)} · plays from {clock(link.to.at)}{link.kind === 'flashback' && link.returnAt !== undefined ? ` · returns ${clock(link.returnAt)}` : ''}</div>
      </div>
      <button type="button" className={icon} aria-label="More" title="More — same menu as right-click" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}><MoreHorizontal className="size-4" /></button>
      {onClose ? <button type="button" className={icon} aria-label="Close" title="Close (Esc)" onClick={onClose}><X className="size-4" /></button> : null}
    </div>
    {menu ? <ContextMenu at={menu} items={items} close={() => setMenu(null)} title={title} /> : null}

    <Fold title="Type" icon={kind[2]} value={kind[1]}>
      <div role="radiogroup" aria-label="Link type" className="grid grid-cols-5 gap-1">
        {KINDS.map(([id, label, Icon, tip]) => <button key={id} type="button" role="radio" aria-checked={link.kind === id} aria-label={label} title={tip} disabled={off}
          className={`flex h-10 items-center justify-center rounded-md border ${link.kind === id ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-paper hover:bg-ink/10'} disabled:opacity-35`}
          onClick={() => setKind(id)}><Icon className="size-4" /></button>)}
      </div>
    </Fold>

    <Fold title="Leaves" icon={LogOut} value={`${fromName} · ${clock(link.from.at)}`}>
      {shotSelect('Leaves shot', link.from.media, setFrom)}
      <DragNumber label="At" value={link.from.at} min={0} max={fromLength} step={0.1} unit="s" width="w-full" disabled={off} title="Drag to change: the time in this shot where the link leaves"
        commit={(at) => set({ from: { media: link.from.media, at } })} />
    </Fold>

    <Fold title="Goes to" icon={LogIn} value={`${toName} · ${clock(link.to.at)}`}>
      {shotSelect('Goes to shot', link.to.media, setTo)}
      <DragNumber label="From" value={link.to.at} min={0} max={toLength} step={0.1} unit="s" width="w-full" disabled={off} title="Drag to change: where the second shot starts playing"
        commit={(at) => set({ to: { media: link.to.media, at } })} />
    </Fold>

    {link.kind === 'flashback' ? <Fold title="Then" icon={Undo2} value={`return at ${clock(link.returnAt ?? link.from.at)}`} help={`After the flashback the film returns to ${fromName} at this time.`}>
      <DragNumber label="Return at" value={link.returnAt ?? link.from.at} min={0} max={fromLength} step={0.1} unit="s" width="w-full" disabled={off}
        commit={(returnAt) => set({ returnAt })} />
    </Fold> : null}

    <Fold title="Look of the jump" icon={Sparkles} value={LOOKS.find(([l]) => l === link.look)?.[1]}>
      <div role="radiogroup" aria-label="Look of the jump" className="flex gap-0.5 rounded-md border border-ink/10 p-0.5">
        {LOOKS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={link.look === id} disabled={off} className={seg(link.look === id)}
          onClick={() => { if (link.look !== id) set({ look: id }); }}>{label}</button>)}
      </div>
    </Fold>
  </div>;
}
