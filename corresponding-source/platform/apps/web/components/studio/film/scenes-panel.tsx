'use client';

import { useState } from 'react';
import { ArrowRight, Clapperboard, Info, MapPin, MoreHorizontal, Plus, Trash2, Users, Volume2, Workflow, X } from 'lucide-react';
import { toSeconds, type FilmProject, type Scene } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { sceneSelection, useSceneSelection, useWorkflowOpen } from '../../../lib/video-studio/scene-selection';
import { castSelection } from './cast-selection';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const num = 'w-16 rounded-md border border-ink/10 bg-paper px-1.5 py-1 font-mono text-xs';
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;

function attempt(filming: StudioFilming, id: string, args: unknown) {
  const result = filming.studio.run(id, args);
  if (!result.ok) filming.studio.setMessage(result.reason);
  return result.ok ? (result.result ?? true) : undefined;
}
const mediaName = (project: FilmProject, id: string) => project.media.find((m) => m.id === id)?.name ?? 'missing shot';
const sceneSeconds = (project: FilmProject, scene: Scene) => scene.shots.reduce((n, id) => n + toSeconds(project.media.find((m) => m.id === id)?.duration ?? 0), 0);
const time = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`;

/** Scenes tab (boards 7 and 8): Timeline | Workflow, the scenes in story order; click one to open its sheet on the right. */
export function ScenesList({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, scenes = project.scenes ?? [], chosen = useSceneSelection(), workflow = useWorkflowOpen();
  const off = filming.busy || studio.rendering;
  const [adding, setAdding] = useState(''), [open, setOpen] = useState(false);
  const add = () => { const name = adding.trim(); if (!name) return; const id = attempt(filming, 'scene.add', { name }) as string | undefined;
    if (typeof id === 'string') { setAdding(''); setOpen(false); castSelection.set(null); sceneSelection.set(id); } };
  return <div>
    <div className="p-2"><div role="radiogroup" aria-label="Scenes view" className="flex gap-0.5 rounded-md border border-ink/10 p-0.5">
      {([[false, 'Timeline', Clapperboard], [true, 'Workflow', Workflow]] as const).map(([value, label, Icon]) => <button key={label} type="button" role="radio" aria-checked={workflow === value}
        onClick={() => sceneSelection.setWorkflow(value)} className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1 text-xs font-bold ${workflow === value ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}><Icon className="size-3.5" />{label}</button>)}
    </div></div>
    <section aria-label="Scenes" className="px-2 pb-2">
      <div className="flex items-center gap-1 px-1 pb-1"><span className="flex-1 text-xs font-bold uppercase tracking-wide text-ink/60">Scenes · {scenes.length}</span>
        <button type="button" className={icon} aria-label="Add a scene" title="Add a scene" disabled={off} onClick={() => setOpen(!open)}><Plus className="size-4" /></button>
        <Help text="A scene holds its shots, who is in it, the director's instructions, named spots and its sound. New takes join the chosen scene." /></div>
      {open ? <div className="flex gap-1 px-1 pb-2"><input aria-label="New scene name" autoFocus className={`${input} mt-0`} maxLength={60} placeholder="Scene name" value={adding}
        onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setOpen(false); }} />
        <button type="button" className={button} disabled={!adding.trim()} onClick={add}>Add</button></div> : null}
      {scenes.length ? <ol className="space-y-0.5">{scenes.map((scene, i) => <li key={scene.id}><button type="button" aria-pressed={chosen === scene.id}
        onClick={() => { castSelection.set(null); sceneSelection.set(chosen === scene.id ? null : scene.id); }}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs hover:bg-ink/5 aria-pressed:bg-ink/10 aria-pressed:ring-1 aria-pressed:ring-ink/40">
        <b className="flex size-5 items-center justify-center rounded bg-ink/10 text-[10px]">{i + 1}</b>
        <span className="min-w-0 flex-1"><b className="block truncate">{scene.name}</b><span className="text-ink/55">{scene.shots.length} shot{scene.shots.length === 1 ? '' : 's'} · {time(sceneSeconds(project, scene))}{scene.place ? ` · ${scene.place}` : ''}</span></span>
        <span title={scene.shots.length ? 'filmed' : 'not filmed yet'} className={`size-1.5 rounded-full ${scene.shots.length ? 'bg-green-500' : 'bg-ink/25'}`} />
      </button></li>)}</ol> : <p className="px-1 text-xs text-ink/60">No scenes yet. A scene groups the shots of one place and moment.</p>}
      {chosen && scenes.some((x) => x.id === chosen) ? <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-500">● New takes join “{scenes.find((x) => x.id === chosen)!.name}”</p> : null}
    </section>
  </div>;
}

/** Board 8 / 8b / 8c: the chosen scene's sheet on the right with Who · Lines · Sound. */
export function SceneInspector({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, chosen = useSceneSelection(), off = filming.busy || studio.rendering;
  const scene = project.scenes?.find((x) => x.id === chosen);
  const [tab, setTab] = useState<'who' | 'lines' | 'sound'>('who'), [menu, setMenu] = useState(false);
  if (!scene) return null;
  const set = (patch: Record<string, unknown>) => attempt(filming, 'scene.set', { scene: scene.id, ...patch });
  const cast = project.cast ?? [], lines = (project.lines ?? []).filter((l) => scene.who.some((w) => w.cast === l.cast) && l.episode === scene.episode);
  const selectedMedia = (() => { const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === studio.selected); return clip?.type === 'media' ? clip.media : null; })();
  const cues = scene.shots.flatMap((m) => (project.media.find((x) => x.id === m)?.cues ?? []).map((c) => ({ ...c, shot: m })));
  const spotName = (x: number, z: number) => scene.spots.find((s) => Math.abs(s.x - x) < 0.05 && Math.abs(s.z - z) < 0.05)?.name;
  const remove = () => { if (scene.shots.length && !window.confirm(`Delete scene “${scene.name}”? Its ${scene.shots.length} shots stay in Shots.`)) return;
    if (attempt(filming, 'scene.remove', { scene: scene.id, confirm: true })) sceneSelection.set(null); };
  return <div className="text-ink" aria-label={`Scene ${scene.name}`}>
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-ink/10"><Clapperboard className="size-4" /></span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Scene · {scene.shots.length} shot{scene.shots.length === 1 ? '' : 's'} · {time(sceneSeconds(project, scene))}</div>
        <input aria-label="Scene name" className="w-full bg-transparent text-sm font-bold outline-none focus:ring-1 focus:ring-ink/30" maxLength={60} defaultValue={scene.name} key={scene.id + scene.name}
          onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== scene.name) set({ name }); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div>
      <div className="relative"><button type="button" className={icon} aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal className="size-4" /></button>
        {menu ? <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-ink/10 bg-surface p-1 shadow-xl">
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-ink/10" onClick={() => { setMenu(false); remove(); }}><Trash2 className="size-3.5" />Delete scene</button></div> : null}</div>
      <button type="button" className={icon} aria-label="Close scene" title="Close (Esc)" onClick={() => sceneSelection.set(null)}><X className="size-4" /></button>
    </div>
    <div className="space-y-2 border-b border-ink/10 px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink/60">Place<input aria-label="Scene place" className={input} maxLength={120} defaultValue={scene.place} key={scene.id + 'pl'} onBlur={(e) => { if (e.target.value !== scene.place) set({ place: e.target.value }); }} /></label>
        <label className="text-xs text-ink/60">When<input aria-label="Scene time" className={input} maxLength={60} placeholder="night · light rain" defaultValue={scene.when} key={scene.id + 'wh'} onBlur={(e) => { if (e.target.value !== scene.when) set({ when: e.target.value }); }} /></label>
      </div>
      <label className="block text-xs text-ink/60"><span className="flex items-center gap-1.5">Director's instructions<Help text="Agents read these before they write lines or set moves for this scene." /></span>
        <textarea aria-label="Director's instructions" rows={2} maxLength={2000} className={input} defaultValue={scene.instructions} key={scene.id + 'in'} onBlur={(e) => { if (e.target.value !== scene.instructions) set({ instructions: e.target.value }); }} /></label>
    </div>
    <div role="tablist" className="flex gap-0.5 border-b border-ink/10 p-1.5">
      {([['who', `Who · ${scene.who.length}`, Users], ['lines', `Lines · ${lines.length}`, ArrowRight], ['sound', scene.sound.mode === 'own' ? 'Sound · own' : 'Sound', Volume2]] as const).map(([id, label, Icon]) =>
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold ${tab === id ? 'bg-ink text-paper' : 'text-ink/60 hover:bg-ink/5'}`}><Icon className="size-3.5" />{label}</button>)}
    </div>
    {tab === 'who' ? <div className="divide-y divide-ink/10">
      <section className="space-y-1.5 px-3 py-3">
        {scene.who.map((w, i) => <div key={w.cast + i} className="flex items-center gap-1.5">
          <select aria-label="Character in scene" className={`${input} mt-0 w-28`} value={w.cast} disabled={off} onChange={(e) => set({ who: scene.who.map((x, j) => j === i ? { ...x, cast: e.target.value } : x) })}>
            {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input aria-label="Job in this scene" className={`${input} mt-0 flex-1`} maxLength={200} placeholder="their job in this scene" defaultValue={w.job} key={scene.id + w.cast + i}
            onBlur={(e) => { if (e.target.value !== w.job) set({ who: scene.who.map((x, j) => j === i ? { ...x, job: e.target.value } : x) }); }} />
          <button type="button" className={icon} aria-label="Take out of scene" disabled={off} onClick={() => set({ who: scene.who.filter((_, j) => j !== i) })}><X className="size-3.5" /></button>
        </div>)}
        {cast.length ? <button type="button" className={button} disabled={off || scene.who.length >= 20} onClick={() => { const free = cast.find((c) => !scene.who.some((w) => w.cast === c.id)) ?? cast[0]!; set({ who: [...scene.who, { cast: free.id, job: '' }] }); }}><Plus className="size-3.5" />Character</button>
          : <p className="text-xs text-ink/60">Add characters in the Cast tab first.</p>}
      </section>
      <section className="space-y-1.5 px-3 py-3"><h3 className="flex items-center gap-2 text-xs font-bold"><MapPin className="size-3.5" />Spots<Help text="Named places of this scene (world metres) so cues and agents use exact spots." /></h3>
        {scene.spots.map((spot, i) => <div key={spot.name + i} className="flex items-center gap-1.5 text-xs">
          <input aria-label="Spot name" className={`${input} mt-0 flex-1`} maxLength={40} defaultValue={spot.name} key={scene.id + 'sn' + i + spot.name}
            onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== spot.name) set({ spots: scene.spots.map((x, j) => j === i ? { ...x, name } : x) }); }} />
          <label className="flex items-center gap-1 text-ink/50">x<input aria-label="Spot x" type="number" step="0.1" className={num} defaultValue={spot.x} key={scene.id + 'sx' + i + spot.x} onBlur={(e) => { const x = Number(e.target.value); if (x !== spot.x) set({ spots: scene.spots.map((s, j) => j === i ? { ...s, x } : s) }); }} /></label>
          <label className="flex items-center gap-1 text-ink/50">z<input aria-label="Spot z" type="number" step="0.1" className={num} defaultValue={spot.z} key={scene.id + 'sz' + i + spot.z} onBlur={(e) => { const z = Number(e.target.value); if (z !== spot.z) set({ spots: scene.spots.map((s, j) => j === i ? { ...s, z } : s) }); }} /></label>
          <button type="button" className={icon} aria-label="Delete spot" disabled={off} onClick={() => set({ spots: scene.spots.filter((_, j) => j !== i) })}><X className="size-3.5" /></button>
        </div>)}
        <button type="button" className={button} disabled={off || scene.spots.length >= 20} onClick={() => set({ spots: [...scene.spots, { name: `Spot ${scene.spots.length + 1}`, x: 0, z: 0 }] })}><Plus className="size-3.5" />Spot</button>
      </section>
      <section className="space-y-1 px-3 py-3"><h3 className="text-xs font-bold">Moves in this scene · exact cues</h3>
        {cues.length ? cues.map((c) => <p key={c.shot + c.id} className="font-mono text-[11px] text-ink/70">{c.label} · {c.action === 'none' ? 'say' : c.action} · {toSeconds(c.start).toFixed(1)}–{toSeconds(c.end).toFixed(1)} s
          {c.at ? ` · at ${spotName(c.at.x, c.at.z) ?? ''} (x ${c.at.x.toFixed(1)}, z ${c.at.z.toFixed(1)})` : ''}{c.to?.length ? ` → ${c.to.map((t) => spotName(t.x, t.z) ?? `x ${t.x.toFixed(1)}, z ${t.z.toFixed(1)}`).join(' → ')}` : ''}</p>)
          : <p className="text-xs text-ink/60">The cues of this scene's shots show here once they are recorded.</p>}
      </section>
      <section className="space-y-1 px-3 py-3"><h3 className="text-xs font-bold">Shots · {scene.shots.length}</h3>
        {scene.shots.map((m) => <div key={m} className="flex items-center gap-1.5 text-xs"><span className="flex-1 truncate">{mediaName(project, m)}</span>
          <button type="button" className={icon} aria-label="Take shot out of scene" disabled={off} onClick={() => attempt(filming, 'scene.shot', { scene: scene.id, media: m, remove: true })}><X className="size-3.5" /></button></div>)}
        <button type="button" className={button} disabled={off || !selectedMedia || scene.shots.includes(selectedMedia)} title={selectedMedia ? 'Put the shot selected on the timeline into this scene' : 'Select a shot on the timeline first'}
          onClick={() => selectedMedia && attempt(filming, 'scene.shot', { scene: scene.id, media: selectedMedia })}><Plus className="size-3.5" />Selected shot</button>
      </section>
    </div> : null}
    {tab === 'lines' ? <section className="space-y-1.5 px-3 py-3">
      {lines.length ? lines.map((l) => { const who = cast.find((c) => c.id === l.cast); const lang = Object.keys(l.text)[0];
        return <button key={l.id} type="button" onClick={() => { sceneSelection.set(null); castSelection.set(l.cast); }} className="block w-full rounded-lg border border-ink/10 p-2 text-left text-xs hover:bg-ink/5">
          <span className="flex items-center gap-1.5 text-[10px] text-ink/55"><b className="text-ink">{who?.name}</b><span className={`rounded px-1 font-bold ${l.status === 'approved' ? 'bg-green-500/15 text-green-600' : 'bg-amber-400/20 text-amber-600'}`}>{l.status}</span>
            {Object.keys(l.text).map((k) => <span key={k}>{k.toUpperCase()}</span>)}</span>
          <span dir="auto" className="mt-1 block">{lang ? l.text[lang] : ''}</span></button>; })
        : <p className="text-xs text-ink/60">Lines of the characters in this scene (episode {scene.episode}) show here. Write them in the character's Story &amp; script.</p>}
    </section> : null}
    {tab === 'sound' ? <section className="space-y-3 px-3 py-3 text-xs">
      <div role="radiogroup" aria-label="Scene sound" className="inline-flex rounded-md border border-ink/10 p-0.5">{([['world', 'Same as the world'], ['own', "This scene's own"]] as const).map(([v, t]) =>
        <button key={v} type="button" role="radio" aria-checked={scene.sound.mode === v} disabled={off} onClick={() => set({ sound: { mode: v } })} className={`rounded px-2.5 py-1 font-semibold ${scene.sound.mode === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>{t}</button>)}</div>
      {scene.sound.mode === 'own' ? <>
        {([['ambience', 'Nature and weather'], ['steps', 'Footsteps and effects']] as const).map(([key, label]) => <label key={key} className="block"><span className="flex justify-between"><span>{label}</span><span className="font-mono">{scene.sound[key]}</span></span>
          <input aria-label={label} type="range" min={0} max={100} value={scene.sound[key]} disabled={off} onChange={(e) => set({ sound: { [key]: Number(e.target.value) } })} className="w-full" /></label>)}
        <p className="text-ink/55">Used while takes of this scene record. Rain, wind and birds follow the world's weather; this sets how loud they are.</p>
      </> : <p className="text-ink/55">Takes of this scene use the world's own sound.</p>}
    </section> : null}
  </div>;
}
