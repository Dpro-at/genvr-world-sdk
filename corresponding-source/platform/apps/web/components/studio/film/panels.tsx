'use client';
import { useState } from 'react';
import { Clapperboard, Film, History, Mic, Palette, Route, Trash2, Type, Volume2, VolumeX } from 'lucide-react';
import type { FilmWorkspace } from '@genvr/contracts';
import { toSeconds, type Media } from '@genvr/film';
import { fitMusicSteps, loudnessSteps } from '../../../lib/video-studio/sound-jobs';
import { stripOf, useJob } from '../../../lib/video-studio/thumbs';
import { SubtitlesSection } from './subtitles-panel';
import type { StudioFilming } from '../../../lib/use-studio-filming';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const input = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const heading = 'flex items-center gap-1.5 px-1 pb-1 text-[11px] font-bold tracking-wide text-ink/60 uppercase';

export const WORKSPACES: { id: FilmWorkspace; label: string; icon: typeof Film; hint: string }[] = [
  { id: 'shoot', label: 'Shoot', icon: Clapperboard, hint: 'Camera, live world, scene cues' },
  { id: 'edit', label: 'Edit', icon: Film, hint: 'Shots, Source and Program, clip settings' },
  { id: 'captions', label: 'Captions', icon: Type, hint: 'Every caption and line of dialogue' },
  { id: 'sound', label: 'Sound', icon: Mic, hint: 'Track and clip volumes' },
  { id: 'colour', label: 'Colour', icon: Palette, hint: 'Looks, colour settings, before / after, waveform' },
  { id: 'story', label: 'Story', icon: Route, hint: 'Scroll page: camera stops, words, flight preview' },
];

/** Switches the panel arrangement inside Filming. */
export function WorkspaceSwitch({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio;
  return <div role="tablist" aria-label="Filming workspace" data-film-id="film.workspace" className="flex rounded-lg bg-ink/5 p-0.5">
    {WORKSPACES.map(({ id, label, icon: Icon, hint }) => <button key={id} role="tab" aria-selected={studio.workspace === id} title={hint}
      data-film-id={`film.workspace.${id}`} disabled={studio.rendering || filming.busy} onClick={() => studio.setWorkspace(id)}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${studio.workspace === id ? 'bg-surface text-ink shadow-sm' : 'text-ink/55 hover:text-ink'}`}>
      <Icon className="size-3.5" />{label}</button>)}
  </div>;
}

/**
 * A small still of a recording: the first picture of its timeline strip (FILM-TEST-01 D6). The strip is made once and
 * kept in this browser; a <video> per recording stayed black (no poster, too many decoders at once).
 */
function Thumb({ media, blob }: { media: Media; blob: Blob | undefined }) {
  const strip = useJob(blob && media.kind === 'video' ? () => stripOf(media.asset, blob, toSeconds(media.duration)) : null, `${media.asset}:${!!blob}`);
  return strip ? <span aria-hidden className="h-10 w-16 shrink-0 rounded bg-black bg-no-repeat"
    style={{ backgroundImage: `url(${strip.url})`, backgroundSize: `${strip.count * 64}px 40px`, backgroundPosition: '0 0' }} />
    : <div className="h-10 w-16 shrink-0 rounded bg-ink/10" />;
}

/** Every recording of the film (the project bin). */
export function ShotsPanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  const used = (media: Media) => studio.project.tracks.reduce((n, t) => n + t.clips.filter((c) => c.type === 'media' && c.media === media.id).length, 0);
  return <section aria-label="Shots" data-film-id="film.shots" className="space-y-1 px-2 pb-3">
    <div className="flex items-center justify-between">
      <h3 className={heading}><Film className="size-3.5" />Shots · {studio.project.media.length}</h3>
      <label className={`${button} cursor-pointer`} data-film-id="film.shots.import" title="Import a sound file (music, ambience, a voice) onto a sound track">
        <Mic className="size-3" />Import sound
        <input type="file" accept="audio/*" className="hidden" disabled={off} onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (file) void studio.addSound(file).catch((error) => studio.setMessage(error instanceof Error ? error.message : 'Could not import the sound.'));
        }} /></label>
    </div>
    {!studio.project.media.length ? <p className="px-1 text-xs text-ink/45">Recordings appear here. Record in the Shoot workspace.</p> : null}
    {studio.project.media.map((media) => <div key={media.id} data-film-id={`film.shots.${media.id}`}
      className={`flex items-center gap-2 rounded-lg border p-1.5 ${studio.source?.media === media.id ? 'border-brand bg-brand/10' : 'border-ink/10'}`}>
      <Thumb media={media} blob={studio.assets.find((a) => a.id === media.asset)?.blob} />
      <div className="min-w-0 flex-1">
        {naming?.id === media.id
          ? <input autoFocus aria-label="Recording name" className={input} value={naming.name} maxLength={120} onChange={(e) => setNaming({ id: media.id, name: e.target.value })}
            onBlur={() => { if (naming.name.trim()) studio.run('media.set', { media: media.id, name: naming.name.trim() }); setNaming(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNaming(null); }} />
          : <button className="block w-full truncate text-left text-xs font-semibold" title="Rename" disabled={off} onClick={() => setNaming({ id: media.id, name: media.name })}>{media.name}</button>}
        <p className="truncate font-mono text-[10px] text-ink/50">{toSeconds(media.duration).toFixed(2)}s · {media.kind === 'audio' ? 'sound' : media.camera?.preset ?? 'gameplay'} · used {used(media)}×</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button className={button} data-film-id={`film.shots.${media.id}.open`} disabled={off} title="Open in the Source monitor"
          onClick={() => { studio.setSource({ media: media.id, in: 0, out: null }); if (studio.workspace !== 'edit') studio.setWorkspace('edit'); }}>Open</button>
        <button className={button} data-film-id={`film.shots.${media.id}.place`} disabled={off} title="Put the whole recording at the playhead (overwrite)"
          onClick={() => studio.run('clip.place', { media: media.id, start: studio.playhead })}>Place</button>
        {!used(media) ? <button className={button} data-film-id={`film.shots.${media.id}.remove`} disabled={off} title="Remove this recording (no clip uses it)"
          aria-label={`Remove ${media.name}`} onClick={() => studio.run('media.remove', { media: media.id })}><Trash2 className="size-3" /></button> : null}
      </div>
    </div>)}
  </section>;
}

/** The labelled undo list; click a line to go back or forward to it. */
export function HistoryPanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, { done, undone } = studio.film.history.labels(), off = studio.rendering || filming.busy;
  return <section aria-label="History" data-film-id="film.history" className="space-y-0.5 px-2 pb-3">
    <h3 className={heading}><History className="size-3.5" />History</h3>
    <button className={`block w-full rounded px-2 py-1 text-left text-xs ${done.length === 0 ? 'bg-brand/15 font-semibold' : 'hover:bg-ink/5'}`} disabled={off}
      data-film-id="film.history.0" onClick={() => studio.run('history.goto', { done: 0 })}>Start</button>
    {[...done, ...undone].map((label, index) => <button key={index} disabled={off} data-film-id={`film.history.${index + 1}`}
      className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${index + 1 === done.length ? 'bg-brand/15 font-semibold' : index >= done.length ? 'text-ink/35 hover:bg-ink/5' : 'hover:bg-ink/5'}`}
      onClick={() => studio.run('history.goto', { done: index + 1 })}>{label}</button>)}
  </section>;
}

/** Every caption clip and every line of dialogue on the film, in time order. */
export function CaptionsPanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Subtitle languages (FILM-12c): only the shown language's lines are listed here; the others open from the languages above.
  const shownLang = studio.project.tracks.find((t) => t.kind === 'caption' && t.lang && !t.hidden)?.lang;
  const captions = studio.project.tracks.filter((t) => !t.lang || t.lang === shownLang).flatMap((t) => t.clips.flatMap((c) => c.type === 'caption' ? [{ track: t, clip: c }] : []))
    .sort((a, b) => a.clip.start - b.clip.start);
  // Dialogue lines where they show on the film: through each picture clip of their recording.
  const lines = studio.project.tracks.filter((t) => t.kind === 'picture').flatMap((t) => t.clips.flatMap((c) => {
    if (c.type !== 'media') return [];
    const media = studio.project.media.find((m) => m.id === c.media);
    return (media?.cues ?? []).filter((cue) => cue.text && cue.end > c.in && cue.start < c.in + c.duration)
      .map((cue) => ({ key: `${c.id}-${cue.id}`, at: toSeconds(c.start + Math.max(0, cue.start - c.in)), cue, clip: c.id }));
  })).sort((a, b) => a.at - b.at);
  return <section aria-label="Captions" data-film-id="film.captions" className="space-y-3 px-3 pb-3 text-ink">
    <SubtitlesSection filming={filming} />
    <div className="flex items-center justify-between">
      <h3 className={heading}><Type className="size-3.5" />Captions · {captions.length}</h3>
      <button className={button} disabled={off} data-film-id="film.captions.add" onClick={() => studio.run('caption.add', { text: 'New caption' })}>Add at playhead</button>
    </div>
    {!captions.length ? <p className="text-xs text-ink/45">No captions yet.</p> : null}
    {captions.map(({ track, clip }) => <div key={clip.id} data-film-id={`film.captions.${clip.id}`}
      className={`space-y-1 rounded-lg border p-2 ${studio.selected === clip.id ? 'border-brand' : 'border-ink/10'}`}>
      <button className="flex w-full justify-between font-mono text-[10px] text-ink/50" disabled={off}
        onClick={() => { studio.select(clip.id); studio.setPlayhead(toSeconds(clip.start)); }}>
        <span>{track.name} · {toSeconds(clip.start).toFixed(2)}–{toSeconds(clip.start + clip.duration).toFixed(2)}s</span><span>{clip.style}</span></button>
      <textarea aria-label={`Caption ${clip.id}`} className={input} rows={2} maxLength={500} disabled={off} value={drafts[clip.id] ?? clip.text}
        onChange={(e) => setDrafts({ ...drafts, [clip.id]: e.target.value })}
        onBlur={() => { const next = drafts[clip.id]; if (next !== undefined && next !== clip.text) studio.run('clip.set', { clip: clip.id, text: next });
          setDrafts((all) => { const rest = { ...all }; delete rest[clip.id]; return rest; }); }} />
    </div>)}
    <h3 className={heading}><Mic className="size-3.5" />Dialogue · {lines.length}</h3>
    {lines.map(({ key, at, cue, clip }) => <button key={key} disabled={off} className="block w-full rounded-lg border border-ink/10 p-2 text-left text-xs hover:bg-ink/5"
      onClick={() => { studio.select(clip); studio.setPlayhead(at); }}>
      <span className="font-mono text-[10px] text-ink/50">{at.toFixed(2)}s · {cue.label}</span><span className="block break-words">{cue.text}</span></button>)}
    <p className="text-[10px] text-ink/45">Dialogue belongs to its recording; change it in the Shoot workspace (Scene) and re-record for new motion.</p>
  </section>;
}

/** A volume slider that saves once when released, so one drag is one undo step. */
function Slider({ value, disabled, commit }: { value: number; disabled: boolean; commit: (value: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const done = () => { if (draft !== null && draft !== value) commit(draft); setDraft(null); };
  return <input type="range" min={0} max={2} step={0.05} value={draft ?? value} disabled={disabled} className="w-full"
    onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={done} onKeyUp={done} onBlur={done} />;
}

/** Track mute and solo, and the volume of every clip and dialogue sound. Meters come with FILM-08. */
export function SoundPanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const clips = studio.project.tracks.flatMap((t) => t.clips.flatMap((c) => c.type === 'media' ? [{ track: t, clip: c }] : []));
  return <section aria-label="Sound" data-film-id="film.sound" className="space-y-3 px-3 pb-3 text-ink">
    <h3 className={heading}><Volume2 className="size-3.5" />Tracks</h3>
    {studio.project.tracks.filter((t) => t.kind === 'sound').map((t) => <div key={t.id} className="flex items-center gap-2 text-xs">
      <span className="w-8 font-bold">{t.name}</span>
      <button className={button} disabled={off} aria-pressed={t.muted} data-film-id={`film.sound.${t.id}.mute`} onClick={() => studio.run('track.set', { track: t.id, muted: !t.muted })}>
        {t.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}{t.muted ? 'Muted' : 'Mute'}</button>
      <button className={`${button} ${t.solo ? 'bg-amber-500/30' : ''}`} disabled={off} aria-pressed={t.solo} data-film-id={`film.sound.${t.id}.solo`}
        onClick={() => studio.run('track.set', { track: t.id, solo: !t.solo })}>Solo</button>
    </div>)}
    {Object.keys(studio.levels).length ? <div className="space-y-1" data-film-id="film.sound.meters">{Object.entries(studio.levels).map(([lane, db]) => {
      const name = lane === 'dialogue' ? 'Dialogue' : studio.project.tracks.find((t) => t.id === lane)?.name ?? lane;
      const width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
      return <div key={lane} className="flex items-center gap-2 text-[10px]"><span className="w-14 truncate">{name}</span>
        <div className="h-2 flex-1 rounded bg-ink/10"><div className={`h-2 rounded ${db > -3 ? 'bg-red-500' : db > -12 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${width}%` }} /></div>
        <span className="w-10 text-right font-mono">{db.toFixed(0)} dB</span></div>; })}</div> : null}
    <h3 className={heading}><Volume2 className="size-3.5" />Ducking</h3>
    {(() => { const d = studio.project.ducking ?? { on: true, amount: 10, fade: 0.3 };
      return <div className="space-y-1 text-xs" data-film-id="film.sound.ducking">
        <label className="flex items-center gap-2 text-ink/60"><input type="checkbox" disabled={off} checked={d.on} onChange={(e) => studio.run('sound.duck', { on: e.target.checked })} />Music and ambience go down under dialogue</label>
        <label className="block text-ink/60">Down by {d.amount} dB<input type="range" min={0} max={30} step={1} defaultValue={d.amount} key={`a${d.amount}`} disabled={off || !d.on} className="w-full"
          onPointerUp={(e) => studio.run('sound.duck', { amount: Number(e.currentTarget.value) })} /></label>
      </div>; })()}
    <div className="flex flex-wrap gap-1">
      <button className={button} disabled={off} data-film-id="film.sound.match" onClick={() => void loudnessSteps(studio.project, studio.assets).then((steps) => {
        if (!steps.length) { studio.setMessage('No imported sound to measure.'); return; }
        studio.batch(steps, { label: 'Match loudness' }); studio.setMessage(`Loudness matched on ${steps.length} clip(s).`);
      }).catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Could not measure the sound.'))}>Match loudness</button>
      <button className={button} disabled={off || !studio.selected} data-film-id="film.sound.fit" title="Cut the selected music clip to the film length on beats"
        onClick={() => void fitMusicSteps(studio.project, studio.assets, studio.selected ?? '').then((steps) => { studio.batch(steps, { label: 'Fit music' }); })
          .catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Could not fit the music.'))}>Fit music to film</button>
    </div>
    <h3 className={heading}><Film className="size-3.5" />Clips</h3>
    {!clips.length ? <p className="text-xs text-ink/45">No clips yet.</p> : null}
    {clips.map(({ track, clip }) => <div key={clip.id} className="space-y-1 rounded-md border border-ink/10 p-2 text-xs" data-film-id={`film.sound.clip.${clip.id}`}>
      <span className="flex justify-between text-ink/60"><span className="truncate">{track.name} · {clip.name ?? studio.project.media.find((m) => m.id === clip.media)?.name}</span><span className="font-mono">{Math.round(clip.volume * 100)}%</span></span>
      <Slider value={clip.volume} disabled={off || track.locked} commit={(volume) => studio.run('clip.set', { clip: clip.id, volume })} />
      {track.kind === 'sound' ? <div className="grid grid-cols-3 gap-1">
        <select aria-label="Sound type" className="rounded border border-ink/10 bg-paper px-1 py-0.5" disabled={off || track.locked} value={clip.soundType ?? 'music'}
          onChange={(e) => studio.run('clip.soundType', { clip: clip.id, type: e.target.value })}>
          <option value="dialogue">Dialogue</option><option value="music">Music</option><option value="effects">Effects</option><option value="ambience">Ambience</option></select>
        <label className="flex items-center gap-1 text-ink/60">In<input aria-label="Fade in seconds" type="number" min={0} max={10} step={0.1} disabled={off || track.locked} className="w-12 rounded border border-ink/10 bg-paper px-1"
          defaultValue={toSeconds(clip.fade?.in ?? 0)} key={`i${clip.fade?.in}`} onBlur={(e) => studio.run('clip.fade', { clip: clip.id, in: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-1 text-ink/60">Out<input aria-label="Fade out seconds" type="number" min={0} max={10} step={0.1} disabled={off || track.locked} className="w-12 rounded border border-ink/10 bg-paper px-1"
          defaultValue={toSeconds(clip.fade?.out ?? 0)} key={`o${clip.fade?.out}`} onBlur={(e) => studio.run('clip.fade', { clip: clip.id, out: Number(e.target.value) })} /></label>
      </div> : null}
    </div>)}
    <p className="text-[10px] text-ink/45">Studio recordings are silent for now (the world's sound is not recorded yet); volumes, fades and ducking apply to dialogue sounds and imported audio.</p>
  </section>;
}
