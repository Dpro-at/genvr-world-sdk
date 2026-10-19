'use client';

import { useState } from 'react';
import { ArrowRight, Bot, Camera, ChevronDown, Clapperboard, Info, LayoutGrid, Link2, MapPin, Minus, Plus, Undo2, Users, Workflow, X } from 'lucide-react';
import { toSeconds, type FilmProject, type Media, type ShotLink } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { sceneSelection, useWorkflowShot } from '../../../lib/video-studio/scene-selection';
import { stripOf, useJob } from '../../../lib/video-studio/thumbs';
import { castSelection } from './cast-selection';

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

function layout(project: FilmProject) {
  const scenes = project.scenes ?? [], videos = project.media.filter((m) => m.kind === 'video');
  const unplaced = videos.filter((m) => !scenes.some((s) => s.shots.includes(m.id))).map((m) => m.id);
  const lanes = [...scenes.map((s, i) => ({ key: s.id, scene: s.id as string | null, title: s.name, number: i + 1, shots: s.shots })),
    ...(unplaced.length ? [{ key: 'none', scene: null, title: 'Not in a scene', number: 0, shots: unplaced }] : [])];
  const cards: Card[] = [];
  lanes.forEach((lane, l) => lane.shots.forEach((media, i) => cards.push({ media, lane: l, x: LANE_X + LABEL_W + i * (CARD_W + GAP_X), y: TOP + l * (LANE_H + LANE_GAP) + LANE_PAD })));
  const width = Math.max(720, ...cards.map((c) => c.x + CARD_W + 220)), height = TOP + lanes.length * (LANE_H + LANE_GAP) + 40;
  return { lanes, cards, width, height };
}

/** Workflow (board 7, 9): scenes as lanes, shots as cards joined by timed threads, links drawn on top. */
export function WorkflowView({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering, chosen = useWorkflowShot();
  const [zoom, setZoom] = useState(1), [adding, setAdding] = useState(false), [menu, setMenu] = useState(false);
  const { lanes, cards, width, height } = layout(project), links = project.links ?? [];
  const at = (media: string) => cards.find((c) => c.media === media);
  const media = (id: string) => project.media.find((m) => m.id === id);
  const castColour = (castId: string) => DOTS[Math.max(0, (project.cast ?? []).findIndex((c) => c.id === castId)) % DOTS.length]!;
  const right = Math.max(LANE_X + LABEL_W + CARD_W, ...cards.map((c) => c.x + CARD_W)) + 64;
  // Story threads: next shot in the lane, and from the last shot of a scene to the first of the next.
  const threads: Array<{ d: string; label: string; lx: number; ly: number }> = [];
  lanes.forEach((lane, l) => {
    lane.shots.forEach((m, i) => {
      const a = at(m)!, next = lane.shots[i + 1] ? at(lane.shots[i + 1]!) : undefined;
      if (next) threads.push({ d: `M${a.x + CARD_W} ${a.y + CARD_H / 2} H${next.x}`, label: `${clock(toSeconds(media(m)?.duration ?? 0))} → 0:00`, lx: a.x + CARD_W + GAP_X / 2, ly: a.y + CARD_H / 2 });
    });
    const last = lane.shots.at(-1), nextLane = lanes[l + 1], first = nextLane?.shots[0];
    if (last && first && lane.scene && nextLane?.scene) {
      const a = at(last)!, b = at(first)!, mid = a.y + CARD_H + LANE_PAD + LANE_GAP / 2;
      threads.push({ d: `M${a.x + CARD_W / 2} ${a.y + CARD_H} V${mid} H${b.x + CARD_W / 2} V${b.y}`, label: `${clock(toSeconds(media(last)?.duration ?? 0))} → 0:00`, lx: (a.x + b.x + CARD_W) / 2, ly: mid });
    }
  });
  return <div className="absolute inset-0 z-30 flex flex-col bg-paper text-ink" aria-label="Workflow">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <Workflow className="size-4" /><h2 className="text-sm font-bold">Workflow</h2>
      <span title="Scenes and their shots in story order, joined by timed threads. Click a shot for its details; links say where the film leaves a shot and enters another." className="text-ink/45"><Info className="size-3.5" /></span>
      <span className="flex-1" />
      <button type="button" className={`${button} !border-sky-500/40`} disabled title="The AI director that makes a whole film comes in the next phase"><Bot className="size-3.5" />Make with AI</button>
      <div className="relative"><button type="button" className={button} disabled={off} aria-expanded={menu} onClick={() => setMenu(!menu)}><Plus className="size-3.5" />Add<ChevronDown className="size-3" /></button>
        {menu ? <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-ink/10 bg-surface p-1 shadow-xl">
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10" onClick={() => { setMenu(false); const r = studio.run('scene.add', { name: `Scene ${(project.scenes?.length ?? 0) + 1}` }); if (!r.ok) studio.setMessage(r.reason); }}><Clapperboard className="size-3.5" />Scene</button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10 disabled:opacity-35" disabled={!cards.length} onClick={() => { setMenu(false); setAdding(true); }}><Link2 className="size-3.5" />Link between shots</button>
        </div> : null}</div>
      <span className="mx-1 h-5 w-px bg-ink/15" />
      <button type="button" className={icon} aria-label="Fit" title="Fit" onClick={() => setZoom(1)}><LayoutGrid className="size-4" /></button>
      <button type="button" className={icon} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}><Minus className="size-4" /></button>
      <button type="button" className={icon} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}><Plus className="size-4" /></button>
      <button type="button" className={icon} aria-label="Close workflow" title="Back to the scene" onClick={() => sceneSelection.setWorkflow(false)}><X className="size-4" /></button>
    </div>
    {adding ? <LinkForm filming={filming} from={chosen} close={() => setAdding(false)} /> : null}
    <div className="min-h-0 flex-1 overflow-auto" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '18px 18px', color: 'rgb(127 127 127 / 0.18)' }}>
      <div className="relative origin-top-left text-ink" style={{ width, height, transform: `scale(${zoom})` }}>
        {lanes.map((lane, l) => { const y = TOP + l * (LANE_H + LANE_GAP), scene = project.scenes?.find((s) => s.id === lane.scene);
          return <div key={lane.key} className="absolute rounded-xl border border-ink/10 bg-surface/70" style={{ left: LANE_X - 8, top: y, width: right - LANE_X, height: LANE_H }}>
            <button type="button" className="absolute left-3 top-3 w-24 text-left text-xs" onClick={() => { if (lane.scene) { castSelection.set(null); sceneSelection.set(lane.scene); sceneSelection.setShot(null); } }}>
              {lane.number ? <b className="mb-1 flex size-5 items-center justify-center rounded bg-paper text-[10px] ring-1 ring-ink/15">{lane.number}</b> : null}
              <b className="block truncate">{lane.title}</b>
              <span className="flex items-center gap-1 text-[10px] text-ink/55"><span className={`size-1.5 rounded-full ${lane.shots.length ? 'bg-green-500' : 'bg-ink/25'}`} />{lane.shots.length ? 'filmed' : 'planned'}</span>
            </button>
            {!lane.shots.length ? <div className="absolute flex items-center justify-center rounded-lg border border-dashed border-ink/25 text-[11px] text-ink/50" style={{ left: LABEL_W, top: LANE_PAD, width: CARD_W, height: CARD_H }}>not filmed yet</div> : null}
            {scene?.place ? <span className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-ink/45"><MapPin className="size-3" />{scene.place}</span> : null}
          </div>; })}
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={height}>
          {threads.map((t, i) => <path key={i} d={t.d} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} />)}
          {links.map((link) => { const a = at(link.from.media), b = at(link.to.media); if (!a || !b) return null;
            const flash = link.kind === 'flashback', x = right + 12;
            return <path key={link.id} d={`M${a.x + CARD_W * 0.45} ${a.y} V${a.y - 18} H${x} V${b.y + CARD_H / 2} H${b.x + CARD_W}`} fill="none"
              stroke={flash ? '#F5B942' : '#38BDF8'} strokeWidth={1.8} strokeDasharray={flash || link.kind === 'loop' ? '6 4' : undefined} />; })}
        </svg>
        {threads.map((t, i) => <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-ink/15" style={{ left: t.lx, top: t.ly }}>{t.label}</span>)}
        {links.map((link, i) => { const a = at(link.from.media); if (!a) return null; const flash = link.kind === 'flashback';
          return <button key={link.id} type="button" onClick={() => sceneSelection.setShot(link.from.media)} className={`absolute rounded-lg border px-2 py-1 text-left font-mono text-[10px] ${flash ? 'border-amber-400 bg-amber-400/10 text-amber-500' : 'border-sky-400 bg-sky-400/10 text-sky-500'}`}
            style={{ left: right + 22, top: TOP + i * 70 + 40 }}>
            <b className="block font-sans">{KINDS.find(([k]) => k === link.kind)?.[1]}</b>leaves at {clock(link.from.at)}<br />plays from {clock(link.to.at)}{link.returnAt !== undefined ? <><br />returns at {clock(link.returnAt)}</> : null}</button>; })}
        {cards.map((c) => { const m = media(c.media), scene = project.scenes?.find((s) => s.shots.includes(c.media)), sel = chosen === c.media;
          if (!m) return null;
          return <button key={c.media} type="button" onClick={() => { sceneSelection.set(null); castSelection.set(null); sceneSelection.setShot(sel ? null : c.media); }}
            className={`absolute overflow-hidden rounded-lg border bg-paper text-left shadow-sm ${sel ? 'border-ink ring-2 ring-ink' : 'border-ink/15 hover:ring-1 hover:ring-ink/40'}`} style={{ left: c.x, top: c.y, width: CARD_W, height: CARD_H }}>
            <CardPicture media={m} blob={studio.assets.find((a) => a.id === m.asset)?.blob} />
            <span className="block truncate px-2 pt-1 text-xs font-bold">{m.name}</span>
            <span className="flex items-center gap-1 px-2 font-mono text-[10px] text-ink/55">{toSeconds(m.duration).toFixed(0)} s · {m.camera?.preset ?? 'player'}<span className="flex-1" />
              {(scene?.who ?? []).slice(0, 4).map((w) => <span key={w.cast} className="size-1.5 rounded-full" style={{ background: castColour(w.cast) }} />)}</span>
          </button>; })}
        {!cards.length ? <p className="absolute left-6 top-6 text-xs text-ink/60">Record shots and put them in scenes; they appear here in story order.</p> : null}
      </div>
    </div>
  </div>;
}

function LinkForm({ filming, from, close }: { filming: StudioFilming; from: string | null; close: () => void }) {
  const studio = filming.studio, videos = studio.project.media.filter((m) => m.kind === 'video');
  const [d, setD] = useState({ from: from ?? videos[0]?.id ?? '', fromAt: 0, to: (videos.find((m) => m.id !== from) ?? videos[0])?.id ?? '', toAt: 0, kind: 'continue' as ShotLink['kind'], returnAt: 0, look: 'cut' as ShotLink['look'] });
  const add = () => { const r = studio.run('link.add', { from: { media: d.from, at: d.fromAt }, to: { media: d.to, at: d.toAt }, kind: d.kind, look: d.look, ...(d.kind === 'flashback' ? { returnAt: d.returnAt } : {}) });
    if (r.ok) close(); else studio.setMessage(r.reason); };
  return <div className="flex flex-wrap items-end gap-2 border-b border-ink/10 bg-surface px-3 py-2 text-xs" aria-label="New link">
    <label>Leave<select aria-label="Leave shot" className={input} value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })}>{videos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>at s<input aria-label="Leave at" type="number" min={0} step="0.1" className={`${num} mt-1 block`} value={d.fromAt} onChange={(e) => setD({ ...d, fromAt: Number(e.target.value) })} /></label>
    <ArrowRight className="mb-2 size-3.5 text-ink/40" />
    <label>Enter<select aria-label="Enter shot" className={input} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })}>{videos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>from s<input aria-label="Enter from" type="number" min={0} step="0.1" className={`${num} mt-1 block`} value={d.toAt} onChange={(e) => setD({ ...d, toAt: Number(e.target.value) })} /></label>
    <label>Kind<select aria-label="Link kind" className={input} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ShotLink['kind'] })}>{KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
    {d.kind === 'flashback' ? <label>returns at s<input aria-label="Return at" type="number" min={0} step="0.1" className={`${num} mt-1 block`} value={d.returnAt} onChange={(e) => setD({ ...d, returnAt: Number(e.target.value) })} /></label> : null}
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
  const goTo = () => { const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'media' && c.media === m.id);
    if (clip) { studio.select(clip.id); studio.setPlayhead(toSeconds(clip.start)); } else studio.setMessage('This shot is not on the timeline yet; place it from the Shots tab.');
    sceneSelection.setWorkflow(false); };
  const row = 'flex items-center gap-2 border-b border-ink/10 px-3 py-2 text-xs';
  return <div className="text-ink" aria-label={`Shot ${m.name}`}>
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-sky-400/30"><Camera className="size-4" /></span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{scene ? `Scene ${sceneIndex + 1} · shot ${scene.shots.indexOf(m.id) + 1}` : 'Not in a scene'}</div>
        <b className="block truncate text-sm">{m.name}</b><span className="font-mono text-[10px] text-ink/55">{toSeconds(m.duration).toFixed(0)} s · {m.camera?.preset ?? 'player view'}</span></div>
      <button type="button" className={icon} aria-label="Close shot" onClick={() => sceneSelection.setShot(null)}><X className="size-4" /></button>
    </div>
    <div className="flex gap-1.5 border-b border-ink/10 p-3"><button type="button" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-paper" onClick={goTo}><ArrowRight className="size-3.5" />Go to this shot</button>
      {scene ? <button type="button" className={icon} aria-label="Open scene sheet" title="Open the scene sheet" onClick={() => { sceneSelection.setShot(null); sceneSelection.set(scene.id); }}><Clapperboard className="size-4" /></button> : null}</div>
    <div className={row}><Users className="size-3.5" /><b>In this shot</b><span className="ml-auto text-ink/55">{people.length ? people.join(' · ') : 'nobody yet'}{lines ? ` · ${lines} lines` : ''}</span></div>
    <div className={row}><Camera className="size-3.5" /><b>Camera</b><span className="ml-auto text-ink/55">{m.camera?.preset ?? 'player view'} · {toSeconds(m.duration).toFixed(0)} s</span></div>
    <div className="space-y-1 border-b border-ink/10 px-3 py-2 text-xs"><div className="flex items-center gap-2"><Link2 className="size-3.5" /><b>Links</b><span className="ml-auto text-ink/55">{ins.length + outs.length}</span></div>
      {ins.map((l) => <div key={l.id} className="flex items-center gap-2"><b className="rounded bg-ink/10 px-1 text-[10px]">In</b><span className="flex-1 truncate">{name(l.from.media)}</span><span className="font-mono text-[10px]">{clock(l.from.at)} → {clock(l.to.at)}</span></div>)}
      {outs.map((l) => <div key={l.id} className="flex items-center gap-2"><b className="rounded bg-ink/10 px-1 text-[10px]">Out</b><span className="flex-1 truncate">{name(l.to.media)}</span><span className="font-mono text-[10px]">{clock(l.from.at)} → {clock(l.to.at)}{l.returnAt !== undefined ? ` ↩ ${clock(l.returnAt)}` : ''}</span>
        <button type="button" className={icon} aria-label="Delete link" onClick={() => { const r = studio.run('link.remove', { link: l.id }); if (!r.ok) studio.setMessage(r.reason); }}><X className="size-3" /></button></div>)}
      {!ins.length && !outs.length ? <p className="text-ink/55">No links. Use Add › Link between shots.</p> : null}
    </div>
    <div className="space-y-1.5 px-3 py-2 text-xs"><div className="flex items-center gap-2"><Clapperboard className="size-3.5" /><b>Scene</b><span className="ml-auto text-ink/55">{scene?.name ?? 'none'}</span></div>
      <select aria-label="Move to scene" className={input} value={scene?.id ?? ''} onChange={(e) => { const target = e.target.value;
        const r = target ? studio.run('scene.shot', { scene: target, media: m.id }) : scene ? studio.run('scene.shot', { scene: scene.id, media: m.id, remove: true }) : { ok: true as const };
        if (!r.ok) studio.setMessage(r.reason); }}>
        <option value="">Not in a scene</option>{scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.name}</option>)}</select>
      {scene?.place ? <p className="flex items-center gap-1 text-ink/55"><MapPin className="size-3" />{scene.place}{scene.when ? ` · ${scene.when}` : ''}</p> : null}
    </div>
    <p className="px-3 pb-3 text-[10px] text-ink/45"><Undo2 className="mr-1 inline size-3" />Every change here is one undo step.</p>
  </div>;
}
