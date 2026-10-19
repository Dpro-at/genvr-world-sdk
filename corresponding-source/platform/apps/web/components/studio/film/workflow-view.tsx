'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, ChevronDown, ChevronUp, ChevronsDownUp, Clapperboard, GripVertical, Search, FolderInput, Info, LayoutGrid, Link2, MapPin, Minus, PanelRight, Plus, Undo2, Users, Workflow, X } from 'lucide-react';
import { filmSettings, toSeconds, type FilmProject, type Media, type ShotLink } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { sceneSelection, useWorkflowShot } from '../../../lib/video-studio/scene-selection';
import { stripOf, useJob } from '../../../lib/video-studio/thumbs';
import { atPointer, type OpenMenu } from './cast-panel';
import { DragNumber } from './drag-number';
import { castSelection } from './cast-selection';
import { ContextMenu, type MenuItem } from './context-menu';
import { sceneMenuItems } from './scenes-panel';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const num = 'w-16 rounded-md border border-ink/10 bg-paper px-1.5 py-1 font-mono text-xs';
const KINDS: Array<[ShotLink['kind'], string]> = [['continue', 'Continue'], ['flashback', 'Flashback'], ['back', 'Back to start'], ['jump', 'Jump to end'], ['loop', 'Loop']];
const LOOKS: Array<[ShotLink['look'], string]> = [['cut', 'Cut'], ['blur', 'Dream blur'], ['fade', 'Fade'], ['old_film', 'Old film']];
const DOTS = ['#8B7CF6', '#38BDF8', '#F59E0B', '#34D399', '#F472B6', '#F87171', '#A3E635', '#FB923C'];
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`;

// Layout of the board (design board 7): lanes stacked, cards in story order, threads drawn between them.
const LANE_X = 16, LABEL_W = 110, CARD_W = 136, CARD_H = 86, GAP_X = 76, LANE_PAD = 16, LANE_H = CARD_H + LANE_PAD * 2, LANE_GAP = 56, TOP = 16;

/** The first frame of a recording as the card's picture (same strip as the Shots tab). */
function CardPicture({ media, blob }: { media: Media; blob: Blob | undefined }) {
  const strip = useJob(blob && media.kind === 'video' ? () => stripOf(media.asset, blob, toSeconds(media.duration)) : null, `${media.asset}:${!!blob}`);
  return strip ? <span aria-hidden className="block h-10 w-full rounded-t-[7px] bg-black bg-no-repeat" style={{ backgroundImage: `url(${strip.url})`, backgroundSize: `${strip.count * 136}px 40px`, backgroundPosition: '0 0' }} />
    : <span aria-hidden className="block h-10 w-full rounded-t-[7px] bg-ink/15" />;
}

type Card = { media: string; x: number; y: number; lane: number };

/** Select the shot's clip on the timeline, move the playhead to it and close Workflow. */
function goToShot(filming: StudioFilming, media: string) {
  const studio = filming.studio, clip = studio.project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'media' && c.media === media);
  if (clip) { studio.select(clip.id); studio.setPlayhead(toSeconds(clip.start)); } else studio.setMessage('This shot is not on the timeline yet; place it from the Shots tab.');
  sceneSelection.setWorkflow(false);
}
function run(filming: StudioFilming, id: string, args: unknown) { const r = filming.studio.run(id, args); if (!r.ok) filming.studio.setMessage(r.reason); }

type Lane = { key: string; scene: string | null; title: string; number: number; shots: string[]; y: number; h: number; folded: boolean };
const FOLDED_H = 46;

/** Board 7b: lanes stacked in story order (one episode at a time in a series); a folded lane is one short row. */
function layout(project: FilmProject, folded: Set<string>, episode: number | null) {
  const all = project.scenes ?? [], videos = project.media.filter((m) => m.kind === 'video');
  const scenes = all.map((s, i) => ({ s, number: i + 1 })).filter(({ s }) => episode === null || s.episode === episode);
  const unplaced = videos.filter((m) => !all.some((s) => s.shots.includes(m.id))).map((m) => m.id);
  const raw = [...scenes.map(({ s, number }) => ({ key: s.id, scene: s.id as string | null, title: s.name, number, shots: s.shots })),
    ...(unplaced.length ? [{ key: 'none', scene: null, title: 'Not in a scene', number: 0, shots: unplaced }] : [])];
  let y = TOP; const lanes: Lane[] = [], cards: Card[] = [];
  raw.forEach((lane, l) => {
    const isFolded = folded.has(lane.key) && lane.shots.length > 0, h = isFolded ? FOLDED_H : LANE_H;
    lanes.push({ ...lane, y, h, folded: isFolded });
    if (!isFolded) lane.shots.forEach((media, i) => cards.push({ media, lane: l, x: LANE_X + LABEL_W + i * (CARD_W + GAP_X), y: y + LANE_PAD }));
    y += h + LANE_GAP;
  });
  const width = Math.max(820, ...cards.map((c) => c.x + CARD_W + 330)), height = y + 40;
  return { lanes, cards, width, height };
}

/** Workflow (boards 7, 7b, 9): a fixed, tidy board — reorder by dragging, links of the chosen shot, fold, map. */
export function WorkflowView({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering, chosen = useWorkflowShot();
  const [zoom, setZoom] = useState(1), [adding, setAdding] = useState<{ from: string | null; to?: string } | null>(null), [menu, setMenu] = useState(false);
  const [context, setContext] = useState<OpenMenu | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set()), [linkMode, setLinkMode] = useState<'selected' | 'all' | 'flashback'>('selected');
  const [query, setQuery] = useState(''), [episode, setEpisode] = useState(1);
  const scroller = useRef<HTMLDivElement>(null), pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null), drag = useRef<{ kind: 'shot' | 'scene' | 'link'; id: string } | null>(null);
  const [view, setView] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const series = filmSettings(project).kind === 'series' && (project.episodes?.length ?? 0) > 0;
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target as HTMLElement | null)?.closest('input,textarea,select')) { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  /** Board 30 · right-click a shot card: go to it, details, move to another scene, link from it, take it out. */
  const shotMenu = (id: string, at: { x: number; y: number }): OpenMenu => {
    const scenes = project.scenes ?? [], scene = scenes.find((s) => s.shots.includes(id));
    const moveTo = (): OpenMenu => ({ at, title: 'Move to scene', items: scenes.length ? scenes.map((s, i): MenuItem => ({ label: `${i + 1} · ${s.name}`, icon: Clapperboard, disabled: off || s.id === scene?.id,
      why: s.id === scene?.id ? 'The shot is already in this scene' : 'Wait for the studio', run: () => run(filming, 'scene.shot', { scene: s.id, media: id }) }))
      : [{ label: 'No scenes yet', icon: Clapperboard, disabled: true, why: 'Add a scene first', run: () => undefined }] });
    return { at, title: media(id)?.name ?? 'Shot', items: [
      { label: 'Go to this shot', icon: ArrowRight, keys: 'Enter', run: () => goToShot(filming, id) },
      { label: 'Show details', icon: PanelRight, run: () => { sceneSelection.set(null); castSelection.set(null); sceneSelection.setShot(id); } },
      'divider',
      { label: 'Move to scene ▸', icon: FolderInput, disabled: off, why: 'Wait for the studio', run: () => setContext(moveTo()) },
      { label: 'Link from here', icon: Link2, disabled: off, why: 'Wait for the studio', run: () => { sceneSelection.setShot(id); setAdding({ from: id }); } },
      'divider',
      { label: 'Take out of scene', icon: X, disabled: off || !scene, why: off ? 'Wait for the studio' : 'The shot is in no scene', run: () => run(filming, 'scene.shot', { scene: scene!.id, media: id, remove: true }) },
    ] };
  };
  const { lanes, cards, width, height } = layout(project, folded, series ? episode : null), links = project.links ?? [];
  const at = (media: string) => cards.find((c) => c.media === media);
  const media = (id: string) => project.media.find((m) => m.id === id);
  const castColour = (castId: string) => DOTS[Math.max(0, (project.cast ?? []).findIndex((c) => c.id === castId)) % DOTS.length]!;
  const right = Math.max(LANE_X + LABEL_W + CARD_W * 2 + GAP_X, ...cards.map((c) => c.x + CARD_W)) + 150;
  // Rule 3 of 7b: only the chosen shot's links are drawn (or all, thin, or the flashbacks); other cards show ↗ counts.
  const drawn = links.filter((l) => linkMode === 'all' || (linkMode === 'flashback' ? l.kind === 'flashback' : !!chosen && (l.from.media === chosen || l.to.media === chosen)));
  const hiddenCount = (m: string) => links.filter((l) => (l.from.media === m || l.to.media === m) && !drawn.includes(l)).length;
  const q = query.trim().toLowerCase();
  const matches = (m: string) => { if (!q) return true; const scene = project.scenes?.find((s) => s.shots.includes(m));
    return (media(m)?.name ?? '').toLowerCase().includes(q) || (scene?.who ?? []).some((w) => (project.cast?.find((c) => c.id === w.cast)?.name ?? '').toLowerCase().includes(q)); };
  const small = zoom < 0.8;
  // Story threads: next shot in the lane, and from the last shot of a scene to the first of the next open scene.
  const threads: Array<{ d: string; label: string; lx: number; ly: number }> = [];
  lanes.forEach((lane, l) => {
    if (lane.folded) return;
    lane.shots.forEach((m, i) => {
      const a = at(m), next = lane.shots[i + 1] ? at(lane.shots[i + 1]!) : undefined;
      if (a && next) threads.push({ d: `M${a.x + CARD_W} ${a.y + CARD_H / 2} H${next.x}`, label: `${clock(toSeconds(media(m)?.duration ?? 0))} → 0:00`, lx: a.x + CARD_W + GAP_X / 2, ly: a.y + CARD_H / 2 });
    });
    const last = lane.shots.at(-1), nextLane = lanes[l + 1], first = nextLane && !nextLane.folded ? nextLane.shots[0] : undefined;
    if (last && first && lane.scene && nextLane?.scene) {
      const a = at(last)!, b = at(first)!, mid = lane.y + lane.h + LANE_GAP / 2;
      threads.push({ d: `M${a.x + CARD_W / 2} ${a.y + CARD_H} V${mid} H${b.x + CARD_W / 2} V${b.y}`, label: `${clock(toSeconds(media(last)?.duration ?? 0))} → 0:00`, lx: (a.x + b.x + CARD_W) / 2, ly: mid });
    }
  });
  const toggleFold = (key: string) => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const foldOthers = () => { const keep = lanes.find((l) => chosen && l.shots.includes(chosen))?.key; setFolded(new Set(lanes.filter((l) => l.key !== keep).map((l) => l.key))); };
  // Drag and drop (7b rule 2 and 5): a card into a lane or onto a card = reorder / move scene; the grip = reorder
  // scenes; the white handle onto a card = new link.
  const dropOn = (lane: Lane, index?: number) => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (d.kind === 'shot' && lane.scene) run(filming, 'scene.shot', { scene: lane.scene, media: d.id, ...(index !== undefined ? { index } : {}) });
    if (d.kind === 'scene' && lane.scene && d.id !== lane.scene) run(filming, 'scene.move', { scene: d.id, index: (project.scenes ?? []).findIndex((s) => s.id === lane.scene) });
  };
  const dropOnCard = (target: string, lane: Lane) => {
    const d = drag.current; if (!d) return;
    if (d.kind === 'link') { drag.current = null; if (d.id !== target) setAdding({ from: d.id, to: target }); return; }
    dropOn(lane, lane.shots.indexOf(target));
  };
  const syncView = () => { const el = scroller.current; if (el) setView({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }); };
  useEffect(syncView, [zoom, width, height]);
  const MAP_W = 150, mapScale = MAP_W / (width * zoom), mapH = Math.min(110, height * zoom * mapScale);
  return <div className="absolute inset-0 z-30 flex flex-col bg-paper text-ink" aria-label="Workflow">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <Workflow className="size-4" /><h2 className="text-sm font-bold">Workflow</h2><span className="rounded-full bg-cyan-700 px-1.5 text-[9px] font-bold uppercase text-cyan-50">New</span>
      <span title="A fixed, tidy board: drag a shot to reorder it or move it to another scene, drag ⋮⋮ to reorder scenes, drag the white handle onto a shot to link them. Drag the background to move around." className="text-ink/45"><Info className="size-3.5" /></span>
      {series ? <div role="radiogroup" aria-label="Episode" className="ml-2 inline-flex rounded-md border border-ink/10 p-0.5">{(project.episodes ?? []).map((ep, i) => <button key={ep.id} type="button" role="radio" aria-checked={episode === i + 1} title={ep.title}
        onClick={() => setEpisode(i + 1)} className={`rounded px-2 py-0.5 text-xs font-semibold ${episode === i + 1 ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>{i ? i + 1 : 'Ep 1'}</button>)}</div> : null}
      <span className="flex-1" />
      <div role="radiogroup" aria-label="Links shown" className="inline-flex rounded-md border border-ink/10 p-0.5">{([['selected', 'Selected', "Only the chosen shot's links"], ['all', 'All', 'Every link, thin'], ['flashback', 'Flashbacks', 'Only flashbacks']] as const).map(([v, t, tip]) =>
        <button key={v} type="button" role="radio" aria-checked={linkMode === v} title={tip} onClick={() => setLinkMode(v)} className={`rounded px-2 py-0.5 text-xs font-semibold ${linkMode === v ? 'bg-ink text-paper' : v === 'flashback' ? 'text-amber-500 hover:bg-ink/10' : 'hover:bg-ink/10'}`}>{v === 'selected' ? <Link2 className="mr-1 inline size-3" /> : null}{t}</button>)}</div>
      <label className="relative" title="Find a shot or a person (/)"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink/45" /><input ref={search} aria-label="Find a shot or a person" placeholder="Find /" value={query} onChange={(e) => setQuery(e.target.value)}
        className="w-28 rounded-md border border-ink/10 bg-paper py-1 pl-7 pr-2 text-xs focus:w-44" /></label>
      <div className="relative"><button type="button" className={button} disabled={off} aria-expanded={menu} onClick={() => setMenu(!menu)}><Plus className="size-3.5" />Add<ChevronDown className="size-3" /></button>
        {menu ? <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-ink/10 bg-surface p-1 shadow-xl">
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10" onClick={() => { setMenu(false); const r = studio.run('scene.add', { name: `Scene ${(project.scenes?.length ?? 0) + 1}`, ...(series ? { episode } : {}) }); if (!r.ok) studio.setMessage(r.reason); }}><Clapperboard className="size-3.5" />Scene</button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10 disabled:opacity-35" disabled={!cards.length} onClick={() => { setMenu(false); setAdding({ from: chosen }); }}><Link2 className="size-3.5" />Link between shots</button>
        </div> : null}</div>
      <button type="button" className={`${icon} border border-ink/10`} aria-label="Fold all except the chosen" title="Fold every scene except the chosen shot's" onClick={foldOthers}><ChevronsDownUp className="size-4" /></button>
      <button type="button" className={`${icon} border border-ink/10`} aria-label="Fit" title="Fit · open all scenes" onClick={() => { setZoom(1); setFolded(new Set()); scroller.current?.scrollTo({ left: 0, top: 0 }); }}><LayoutGrid className="size-4" /></button>
      <div className="flex rounded-md border border-ink/10">
        <button type="button" className={icon} aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}><Minus className="size-4" /></button>
        <button type="button" className={icon} aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}><Plus className="size-4" /></button>
      </div>
    </div>
    {adding ? <LinkForm key={`${adding.from ?? ''}:${adding.to ?? ''}`} filming={filming} from={adding.from} {...(adding.to ? { to: adding.to } : {})} close={() => setAdding(null)} /> : null}
    {context ? <ContextMenu at={context.at} title={context.title} items={context.items} close={() => setContext(null)} /> : null}
    <div className="relative min-h-0 flex-1">
    <div ref={scroller} onScroll={syncView} className="absolute inset-0 cursor-grab overflow-auto active:cursor-grabbing" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '18px 18px', color: 'rgb(127 127 127 / 0.18)' }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,input,[draggable="true"]')) return; const el = scroller.current!; pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const p = pan.current, el = scroller.current; if (!p || !el) return; el.scrollLeft = p.left - (e.clientX - p.x); el.scrollTop = p.top - (e.clientY - p.y); }}
      onPointerUp={() => { pan.current = null; }}>
      <div className="relative origin-top-left text-ink" style={{ width, height, transform: `scale(${zoom})` }}>
        {lanes.map((lane) => { const scene = project.scenes?.find((s) => s.id === lane.scene);
          return <div key={lane.key} className="absolute rounded-xl border border-ink/10 bg-surface/70" style={{ left: LANE_X - 8, top: lane.y, width: right - LANE_X, height: lane.h }}
            onDragOver={(e) => { if (drag.current && drag.current.kind !== 'link') e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(lane); }}>
            <div className={`absolute left-2 flex w-28 items-start gap-1 text-left text-xs ${lane.folded ? 'top-2' : 'top-3'}`}>
              {lane.scene ? <span draggable title="Drag to reorder scenes" onDragStart={(e) => { drag.current = { kind: 'scene', id: lane.scene! }; e.dataTransfer.effectAllowed = 'move'; }} className="mt-1 cursor-grab text-ink/35"><GripVertical className="size-3.5" /></span> : <span className="w-3.5" />}
              <button type="button" className="min-w-0 flex-1 text-left" title={scene ? 'Click = open the scene sheet · right-click = more' : undefined}
                onClick={() => { if (lane.scene) { castSelection.set(null); sceneSelection.set(lane.scene); sceneSelection.setShot(null); } }}
                onContextMenu={(e) => { if (scene) setContext({ at: atPointer(e), title: `${lane.number} · ${scene.name}`, items: sceneMenuItems(filming, scene) }); }}>
                <span className="flex items-center gap-1.5">{lane.number ? <b className="flex size-5 shrink-0 items-center justify-center rounded bg-ink text-[10px] text-paper">{lane.number}</b> : null}<b className="truncate">{lane.title}</b></span>
                <span className="flex items-center gap-1 text-[10px] text-ink/55"><span className={`size-1.5 rounded-full ${lane.shots.length ? 'bg-green-500' : 'bg-ink/25'}`} />{lane.folded ? 'folded · ' : ''}{lane.shots.length ? 'filmed' : 'planned'}</span>
              </button>
            </div>
            {lane.shots.length ? <button type="button" className={`${icon} absolute right-2 top-2`} aria-label={lane.folded ? 'Open this scene' : 'Fold this scene'} title={lane.folded ? 'Open' : 'Fold'} onClick={() => toggleFold(lane.key)}>{lane.folded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</button> : null}
            {lane.folded ? <div className="absolute flex items-center gap-1" style={{ left: LABEL_W + 16, top: 12 }}>{lane.shots.slice(0, 8).map((m) => <span key={m} className="h-5 w-8 rounded bg-ink/15" title={media(m)?.name} />)}
              <span className="ml-2 font-mono text-[10px] text-ink/55">{lane.shots.length} shots · folded</span></div> : null}
            {!lane.shots.length ? <div className="absolute flex items-center justify-center rounded-lg border border-dashed border-ink/25 text-[11px] text-ink/50" style={{ left: LABEL_W, top: LANE_PAD, width: CARD_W, height: CARD_H }}>not filmed yet</div> : null}
            {scene?.place && !lane.folded ? <span className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-ink/45"><MapPin className="size-3" />{scene.place}</span> : null}
          </div>; })}
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={height}>
          {threads.map((t, i) => <path key={i} d={t.d} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} />)}
          {drawn.map((link, i) => { const a = at(link.from.media), b = at(link.to.media); if (!a || !b) return null;
            const flash = link.kind === 'flashback', x = right + 12 + (linkMode === 'all' ? i * 6 : 0);
            const colour = flash ? '#F5B942' : '#38BDF8', top = a.y - 18;
            return <g key={link.id}><path d={`M${a.x + CARD_W * 0.45} ${a.y} V${top} H${x} V${b.y + CARD_H / 2} H${b.x + CARD_W}`} fill="none"
              stroke={colour} strokeWidth={linkMode === 'all' ? 1.2 : 1.8} strokeDasharray={flash || link.kind === 'loop' ? '6 4' : undefined} />
              <circle cx={a.x + CARD_W * 0.45} cy={a.y} r={4} fill={colour} /><circle cx={b.x + CARD_W} cy={b.y + CARD_H / 2} r={4} fill={colour} /></g>; })}
        </svg>
        {threads.map((t, i) => <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-ink/15" style={{ left: t.lx, top: t.ly }}>{t.label}</span>)}
        {linkMode !== 'all' ? drawn.map((link, i) => { const a = at(link.from.media), b = at(link.to.media); if (!a || !b) return null; const flash = link.kind === 'flashback';
          const mid = ((a.y - 18) + (b.y + CARD_H / 2)) / 2 + i * 8;
          return <button key={link.id} type="button" onClick={() => { sceneSelection.setShot(null); sceneSelection.setLink(link.id); }} title="Click = edit this link" className={`absolute -translate-y-1/2 rounded-lg border bg-paper px-2 py-1 text-left font-mono text-[10px] ${flash ? 'border-amber-400 text-amber-500' : 'border-sky-400 text-sky-500'}`}
            style={{ left: right - 50, top: mid }}>
            <b className="block font-sans">{KINDS.find(([k]) => k === link.kind)?.[1]}</b>leaves at {clock(link.from.at)}<br />plays from {clock(link.to.at)}{link.returnAt !== undefined ? <><br />returns at {clock(link.returnAt)}</> : null}</button>; }) : null}
        {cards.map((c) => { const m = media(c.media), scene = project.scenes?.find((s) => s.shots.includes(c.media)), sel = chosen === c.media, lane = lanes[c.lane]!;
          if (!m) return null;
          const more = hiddenCount(c.media), hit = matches(c.media);
          return <div key={c.media} className="absolute" style={{ left: c.x, top: c.y, width: CARD_W, height: CARD_H, opacity: hit ? 1 : 0.3 }}
            onDragOver={(e) => { if (drag.current) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnCard(c.media, lane); }}>
            <button type="button" draggable onDragStart={(e) => { drag.current = { kind: 'shot', id: c.media }; e.dataTransfer.effectAllowed = 'move'; }}
              onClick={() => { sceneSelection.set(null); castSelection.set(null); sceneSelection.setShot(sel ? null : c.media); }}
              onContextMenu={(e) => setContext(shotMenu(c.media, atPointer(e)))} title="Click = details · drag = reorder or move · right-click = more"
              className={`relative block h-full w-full overflow-hidden rounded-lg bg-paper text-left shadow-sm ${sel ? 'border-[3px] border-ink' : 'border border-ink/15 hover:ring-1 hover:ring-ink/40'}`}>
              <CardPicture media={m} blob={studio.assets.find((a) => a.id === m.asset)?.blob} />
              {more ? <span title={`${more} more link${more === 1 ? '' : 's'} — choose the shot to see them`} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 font-mono text-[9px] font-bold text-sky-300">↗{more}</span> : null}
              {small ? null : <><span className="block truncate px-2 pt-1 text-xs font-bold">{m.name}</span>
                <span className="flex items-center gap-1 px-2 font-mono text-[10px] text-ink/55">{toSeconds(m.duration).toFixed(0)} s · {m.camera?.preset ?? 'player'}<span className="flex-1" />
                  {(scene?.who ?? []).slice(0, 4).map((w) => <span key={w.cast} className="size-1.5 rounded-full" style={{ background: castColour(w.cast) }} />)}</span></>}
            </button>
            {sel ? <span draggable title="Drag onto another shot to link them" onDragStart={(e) => { drag.current = { kind: 'link', id: c.media }; e.dataTransfer.effectAllowed = 'link'; }}
              className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-paper bg-ink" /> : null}
          </div>; })}
        {!cards.length && !lanes.length ? <p className="absolute left-6 top-6 text-xs text-ink/60">Record shots and put them in scenes; they appear here in story order.</p> : null}
      </div>
    </div>
    {lanes.length > 2 ? <div aria-label="Map" className="absolute bottom-3 right-3 rounded-lg border border-ink/15 bg-surface/95 p-2 shadow-lg" style={{ width: MAP_W + 16 }}>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-ink/50">Map · {lanes.length} lanes</div>
      <div className="relative cursor-pointer" style={{ width: MAP_W, height: mapH }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(), el = scroller.current; if (!el) return;
        el.scrollTo({ left: (e.clientX - r.left) / mapScale - el.clientWidth / 2, top: (e.clientY - r.top) / mapScale - el.clientHeight / 2 }); }}>
        {lanes.map((l) => <span key={l.key} className="absolute rounded-sm bg-ink/20" style={{ left: 0, top: l.y * zoom * mapScale, width: (right - LANE_X) * zoom * mapScale, height: Math.max(2, l.h * zoom * mapScale) }} />)}
        <span className="absolute rounded-sm border border-ink" style={{ left: view.left * mapScale, top: view.top * mapScale, width: Math.min(MAP_W, view.width * mapScale), height: Math.min(mapH, view.height * mapScale) }} />
      </div></div> : null}
    </div>
  </div>;
}

function LinkForm({ filming, from, to, close }: { filming: StudioFilming; from: string | null; to?: string; close: () => void }) {
  const studio = filming.studio, videos = studio.project.media.filter((m) => m.kind === 'video');
  const [d, setD] = useState({ from: from ?? videos[0]?.id ?? '', fromAt: 0, to: to ?? (videos.find((m) => m.id !== from) ?? videos[0])?.id ?? '', toAt: 0, kind: 'continue' as ShotLink['kind'], returnAt: 0, look: 'cut' as ShotLink['look'] });
  const add = () => { const r = studio.run('link.add', { from: { media: d.from, at: d.fromAt }, to: { media: d.to, at: d.toAt }, kind: d.kind, look: d.look, ...(d.kind === 'flashback' ? { returnAt: d.returnAt } : {}) });
    if (r.ok) close(); else studio.setMessage(r.reason); };
  return <div className="flex flex-wrap items-end gap-2 border-b border-ink/10 bg-surface px-3 py-2 text-xs" aria-label="New link">
    <label>Leave<select aria-label="Leave shot" className={input} value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })}>{videos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <DragNumber label="Leave at" value={d.fromAt} min={0} max={180} step={0.1} unit="s" width="w-32" commit={(v) => setD({ ...d, fromAt: v })} />
    <ArrowRight className="mb-2 size-3.5 text-ink/40" />
    <label>Enter<select aria-label="Enter shot" className={input} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })}>{videos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <DragNumber label="Enter from" value={d.toAt} min={0} max={180} step={0.1} unit="s" width="w-32" commit={(v) => setD({ ...d, toAt: v })} />
    <label>Kind<select aria-label="Link kind" className={input} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ShotLink['kind'] })}>{KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
    {d.kind === 'flashback' ? <DragNumber label="Return at" value={d.returnAt} min={0} max={180} step={0.1} unit="s" width="w-32" commit={(v) => setD({ ...d, returnAt: v })} /> : null}
    <label>Look<select aria-label="Link look" className={input} value={d.look} onChange={(e) => setD({ ...d, look: e.target.value as ShotLink['look'] })}>{LOOKS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
    <button type="button" className={button} onClick={add}>Add link</button>
    <button type="button" className={icon} aria-label="Cancel link" onClick={close}><X className="size-3.5" /></button>
  </div>;
}

/** Board 7 right panel: the shot chosen in Workflow — go to it, who is in it, camera, links in and out, its scene. */
export function WorkflowShotInspector({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, chosen = useWorkflowShot();
  const m = project.media.find((x) => x.id === chosen);
  if (!m) return null;
  const scenes = project.scenes ?? [], sceneIndex = scenes.findIndex((s) => s.shots.includes(m.id)), scene = scenes[sceneIndex];
  const links = project.links ?? [], ins = links.filter((l) => l.to.media === m.id), outs = links.filter((l) => l.from.media === m.id);
  const name = (id: string) => project.media.find((x) => x.id === id)?.name ?? 'missing shot';
  const people = (scene?.who ?? []).map((w) => project.cast?.find((c) => c.id === w.cast)?.name).filter(Boolean);
  const lines = (project.lines ?? []).filter((l) => scene?.who.some((w) => w.cast === l.cast)).length;
  const goTo = () => goToShot(filming, m.id);
  const row = 'flex items-center gap-2 border-b border-ink/10 px-3 py-2 text-xs';
  return <div className="text-ink" aria-label={`Shot ${m.name}`}>
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <span className="block w-9 shrink-0 overflow-hidden rounded-lg"><CardPicture media={m} blob={studio.assets.find((a) => a.id === m.asset)?.blob} /></span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{scene ? `Scene ${sceneIndex + 1} · shot ${scene.shots.indexOf(m.id) + 1}` : 'Not in a scene'}</div>
        <input aria-label="Shot name" title="Click to rename" className="w-full bg-transparent text-sm font-bold outline-none focus:ring-1 focus:ring-ink/30" maxLength={120} defaultValue={m.name} key={m.id + m.name}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.name) { const r = studio.run('media.set', { media: m.id, name: v }); if (!r.ok) studio.setMessage(r.reason); } }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="font-mono text-[10px] text-ink/55">{toSeconds(m.duration).toFixed(0)} s · {m.camera?.preset ?? 'player view'}</span></div>
      <button type="button" className={icon} aria-label="Close shot" title="Close (Esc)" onClick={() => sceneSelection.setShot(null)}><X className="size-4" /></button>
    </div>
    <div className="flex gap-1.5 border-b border-ink/10 p-3"><button type="button" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-bold text-paper" onClick={goTo}><ArrowRight className="size-3.5" />Go to this shot</button>
      <span title="Puts the playhead on this shot and shows the timeline again" className={`${icon} border border-ink/10 text-ink/55`}><Info className="size-4" /></span>
      {scene ? <button type="button" className={icon} aria-label="Open scene sheet" title="Open the scene sheet" onClick={() => { sceneSelection.setShot(null); sceneSelection.set(scene.id); }}><Clapperboard className="size-4" /></button> : null}</div>
    <div className={row}><span className="text-ink/45">›</span><Users className="size-3.5" /><b>In this shot</b><span className="ml-auto text-ink/55">{people.length ? people.join(' · ') : 'nobody yet'}{lines ? ` · ${lines} lines` : ''}</span></div>
    <div className={row}><span className="text-ink/45">›</span><Camera className="size-3.5" /><b>Camera</b><span className="ml-auto text-ink/55">{m.camera?.preset ?? 'player view'} · {toSeconds(m.duration).toFixed(0)} s</span></div>
    <div className="space-y-1 border-b border-ink/10 px-3 py-2 text-xs"><div className="flex items-center gap-2"><span className="text-ink/45">⌄</span><Link2 className="size-3.5" /><b>Links</b><span className="ml-auto text-ink/55">{ins.length + outs.length}</span></div>
      {ins.map((l) => <div key={l.id} role="button" tabIndex={0} title="Edit this link" onClick={() => sceneSelection.setLink(l.id)} className="flex cursor-pointer items-center gap-2 rounded hover:bg-ink/5"><b className="rounded bg-ink/10 px-1 text-[10px]">In</b><span className="flex-1 truncate">{name(l.from.media)}</span><span className="font-mono text-[10px]">{clock(l.from.at)} → {clock(l.to.at)}</span></div>)}
      {outs.map((l) => <div key={l.id} role="button" tabIndex={0} title="Edit this link" onClick={() => sceneSelection.setLink(l.id)} className="flex cursor-pointer items-center gap-2 rounded hover:bg-ink/5"><b className="rounded bg-ink/10 px-1 text-[10px]">Out</b><span className="flex-1 truncate">{name(l.to.media)}</span><span className="font-mono text-[10px]">{clock(l.from.at)} → {clock(l.to.at)}{l.returnAt !== undefined ? ` ↩ ${clock(l.returnAt)}` : ''}</span>
        <button type="button" className={icon} aria-label="Delete link" onClick={() => { const r = studio.run('link.remove', { link: l.id }); if (!r.ok) studio.setMessage(r.reason); }}><X className="size-3" /></button></div>)}
      {!ins.length && !outs.length ? <p className="text-ink/55">No links. Use Add › Link between shots.</p> : null}
    </div>
    <div className="space-y-1.5 px-3 py-2 text-xs"><div className="flex items-center gap-2"><span className="text-ink/45">⌄</span><Clapperboard className="size-3.5" /><b>Scene</b><span className="ml-auto text-ink/55">{scene?.name ?? 'none'}</span></div>
      {scene ? <>
        <input aria-label="Scene name" className={input} maxLength={60} defaultValue={scene.name} key={scene.id + scene.name}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== scene.name) { const r = studio.run('scene.set', { scene: scene.id, name: v }); if (!r.ok) studio.setMessage(r.reason); } }} />
        <label className="flex items-center gap-1.5"><MapPin className="size-3.5 text-ink/50" /><input aria-label="Scene place" className={`${input} mt-0`} maxLength={120} placeholder="Place in the world" defaultValue={scene.place} key={scene.id + 'p' + scene.place}
          onBlur={(e) => { if (e.target.value !== scene.place) { const r = studio.run('scene.set', { scene: scene.id, place: e.target.value }); if (!r.ok) studio.setMessage(r.reason); } }} /></label>
      </> : <select aria-label="Put in a scene" className={input} value="" onChange={(e) => { if (!e.target.value) return; const r = studio.run('scene.shot', { scene: e.target.value, media: m.id }); if (!r.ok) studio.setMessage(r.reason); }}>
        <option value="">Put in a scene…</option>{scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.name}</option>)}</select>}
    </div>
    <p className="px-3 pb-3 text-[10px] text-ink/45"><Undo2 className="mr-1 inline size-3" />Every change here is one undo step.</p>
  </div>;
}
