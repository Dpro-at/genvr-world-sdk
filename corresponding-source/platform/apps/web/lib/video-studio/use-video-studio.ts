'use client';
import { useEffect, useRef, useState } from 'react';
import type { FilmCamera, FilmWorkspace } from '@genvr/contracts';
import {
  FilmSession, LIMITS, emptyFilm, filmLength, fromSeconds, migrate, missingAssets, neededAssets, readFilmFile, toSeconds, writeFilmFile,
  type BatchResult, type BatchStep, type Media, type RunResult,
} from '@genvr/film';
import { cueToSeconds, cueToTicks, validateCues, type Asset, type SceneCue } from './model';
import { backupOnce, storage } from './storage';
import { mediaDuration } from './render';

/**
 * The Studio Filming project in this browser: a film (`@genvr/film`) edited only through its
 * command session, the recordings it shows, and the editor's view state.
 */
export function useVideoStudio(place: string, key: string | null, filmExample?: string | false) {
  const [, setVersion] = useState(0);
  const film = useRef<FilmSession>(null as unknown as FilmSession);
  if (!film.current) film.current = new FilmSession(emptyFilm(), () => crypto.randomUUID(), () => setVersion((n) => n + 1));
  const transport = useRef<{play():void;stop():void}|null>(null);
  const [filmPlaying,setFilmPlaying]=useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false), [mode, setMode] = useState<'gameplay' | 'production'>('production');
  const [rendering, updateRendering] = useState(false), [previewing, setPreviewing] = useState(false);
  const renderBusy = useRef(false);
  const setRendering = (value: boolean) => { renderBusy.current = value; updateRendering(value); };
  const [message, setMessage] = useState('Projects stay in this browser.');
  /** FILM-04: which panel arrangement Filming shows; remembered per browser. */
  const [workspace, updateWorkspace] = useState<FilmWorkspace>(() => {
    try {
      // `?tab=story` (the Publish page's link) opens the Story workspace.
      if (new URLSearchParams(window.location.search).get('tab') === 'story') return 'story';
      const saved = localStorage.getItem('genvr-film-workspace');
      return saved === 'edit' || saved === 'captions' || saved === 'sound' || saved === 'transitions' || saved === 'colour' || saved === 'story' ? saved : 'shoot';
    }
    catch { return 'shoot'; }
  });
  const setWorkspace = (next: FilmWorkspace) => {
    updateWorkspace(next);
    try { localStorage.setItem('genvr-film-workspace', next); } catch { /* Optional storage. */ }
  };
  /** The recording open in the Source monitor and its marked part (seconds of the recording). */
  const [source, setSource] = useState<{ media: string; in: number; out: number | null } | null>(null);
  const [guides, setGuides] = useState({ safe: false, thirds: false });
  /** Program shows the picture without Colour effects while held (FILM-07 before / after). */
  const [ungraded, setUngraded] = useState(false);
  /** Peak levels per sound lane while playing (FILM-08 meters). */
  const [levels, setLevels] = useState<Record<string, number>>({});
  /** A film replaced by Open is kept and can be restored (FILM pre-check). */
  const [previous, setPrevious] = useState(false);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void storage(`${key}:before-open`).then((kept) => { if (live) setPrevious(!!kept); }).catch(() => {});
    return () => { live = false; };
  }, [key, filmExample]);
  const [ready, setReady] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [saveable, setSaveable] = useState(false);
  const activeKey = useRef(key); activeKey.current = key;
  const currentAssets = useRef(assets); currentAssets.current = assets;
  const saving = useRef(Promise.resolve());
  /** Sound files picked for a cue that is not saved yet; kept until the cue is saved or the page closes. */
  const pendingAudio = useRef(new Set<string>());
  const project = film.current.project;

  useEffect(() => {
    let cancelled = false; setReady(false); setLoadedKey(null); setSaveable(false); film.current.load(emptyFilm()); setAssets([]);
    if (!key) return;
    void storage(key).then(async (stored) => {
      if (cancelled) return;
      if (stored) {
        const loaded = migrate(stored.project, stored.plan);
        const missing = missingAssets(loaded, stored.assets.map((a) => a.id));
        if (missing.length) throw new Error(`${missing.length} saved recording(s) are missing.`);
        if ((stored.project as { version?: number }).version === 1) {
          await backupOnce(key, stored);
          setMessage('Project moved to the track editor; the old save is kept as a backup.');
        }
        if (cancelled) return;
        film.current.load(loaded); setAssets(stored.assets);
      }
      if (!stored && filmExample) {
        try {
          const response = await fetch(filmExample);
          if (!response.ok) throw new Error('Example unavailable');
          const example = readFilmFile(new Uint8Array(await response.arrayBuffer()));
          if (cancelled) return;
          film.current.load(example.project);
          setAssets(example.assets.map(a => ({ id: a.id, blob: new Blob([a.bytes as BlobPart], { type: a.type }) })));
          setWorkspace('sound');
          setMessage('Example scene ready. Choose a language in Sound or Captions, then Play. Shoot opens your live world.');
        } catch { if (!cancelled) setMessage('Example could not load. Your empty film is ready to use.'); }
      }
      if (cancelled) return;
      setLoadedKey(key); setSaveable(true); setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      setMessage(error instanceof Error && error.message.includes('damaged') ? `${error.message} Nothing was changed in the saved copy.`
        : 'Browser storage unavailable; keep this page open to retain shots.');
      setLoadedKey(key); setReady(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  // Saved after every change; history stays in memory, so a crash loses the undo list, never an edit.
  useEffect(() => {
    if (!ready || !key || !saveable || loadedKey !== key) return;
    const value = { project, assets };
    saving.current = saving.current.catch(() => {}).then(async () => {
      try { await storage(key, value); }
      catch { if (activeKey.current === key) setMessage('Could not save locally. Download your shots before closing this page.'); }
    });
  }, [key, loadedKey, ready, saveable, project, assets]);

  // Media no longer used by the film or its undo history is dropped from the browser.
  useEffect(() => {
    const used = new Set([project, ...film.current.history.past.flatMap((s) => [s.before, s.after]),
      ...film.current.history.future.flatMap((s) => [s.before, s.after])].flatMap((p) => [...neededAssets(p)]));
    const next = assets.filter((a) => used.has(a.id) || pendingAudio.current.has(a.id));
    if (next.length !== assets.length) setAssets(next);
  }, [project, assets]);

  const loaded = () => ready && !!key && loadedKey === key && activeKey.current === key;
  const flush = async () => {
    if (!loaded() || !saveable || !key) return false;
    const value = { project: film.current.project, assets: currentAssets.current };
    const write = saving.current.catch(() => {}).then(async () => { await storage(key, value); });
    saving.current = write;
    try { await write; return value.project === film.current.project && value.assets === currentAssets.current; }
    catch { setMessage('Could not save locally. Download your shots before closing this page.'); return false; }
  };
  const run = (id: string, args: unknown = {}): RunResult => {
    const result = film.current.run(id, args);
    if (!result.ok) setMessage(result.reason);
    return result;
  };
  const batch = (steps: BatchStep[], options?: { label?: string; atomic?: boolean }): BatchResult => {
    const result = film.current.batch(steps, options);
    if (!result.ok) setMessage(`Step ${result.failed.index + 1} (${result.failed.id}): ${result.failed.reason}`);
    return result;
  };
  /** Runs a command and throws its reason; for callers that report errors themselves. */
  const must = (id: string, args: unknown = {}) => {
    const result = film.current.run(id, args);
    if (!result.ok) throw new Error(result.reason);
    return result.result;
  };

  const addRecording = (blob: Blob, seconds: number, camera: FilmCamera | null, replaceClip?: string, cues: SceneCue[] = [], hasSound = false) => {
    if (!loaded()) throw new Error('Wait for your project to load before adding a shot.');
    const total = currentAssets.current.reduce((n, a) => n + a.blob.size, blob.size);
    if (total > LIMITS.mediaBytes) throw new Error('Project media limit is 128 MB; download this recording separately.');
    const asset = crypto.randomUUID(), duration = fromSeconds(seconds);
    const kept = cues.map((c) => ({ ...c, end: Math.min(c.end, seconds) })).filter((c) => c.start < c.end).map(cueToTicks);
    const nextAssets = [...currentAssets.current, { id: asset, blob }];
    currentAssets.current = nextAssets; setAssets(nextAssets);
    const clip = replaceClip ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === replaceClip) : undefined;
    if (clip?.type === 'media') {
      must('media.replace', { media: clip.media, asset, duration, camera, cues: kept, hasSound });
      setMessage('Selected shot re-recorded. Other clips kept their place.');
    } else {
      const media: Media = { id: crypto.randomUUID(), kind: 'video', asset, name: `Shot ${project.media.length + 1}`, duration, camera, cues: kept, ...(hasSound ? { hasSound } : {}) };
      const placed = must('media.add', { media }) as string;
      must('select.set', { clips: [placed] });
      setMessage('Recording added to the timeline.');
    }
    setOpen(true);
  };
  const addAudio = (blob: Blob): string => {
    if (!loaded() || blob.size > 20 * 1024 * 1024 || !blob.type.startsWith('audio/')) throw new Error('Choose an audio file up to 20 MB.');
    if (currentAssets.current.reduce((n, a) => n + a.blob.size, blob.size) > LIMITS.mediaBytes) throw new Error('Project media limit is 128 MB.');
    const id = crypto.randomUUID(), next = [...currentAssets.current, { id, blob }];
    pendingAudio.current.add(id);
    currentAssets.current = next; setAssets(next); return id;
  };

  /** Brings a sound file (music, ambience, a voice) into the film and places it at the playhead on a sound track (FILM-08). */
  const addSound = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) throw new Error('Choose audio up to 20 MB.');
    if (!file.type.startsWith('audio/')) throw new Error('Choose a sound file (mp3, wav, ogg, m4a).');
    const seconds = await mediaDuration(file, new AbortController().signal);
    const asset = addAudio(file);
    const media: Media = { id: crypto.randomUUID(), kind: 'audio', asset, name: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Sound', duration: fromSeconds(seconds), camera: null, cues: [] };
    must('media.add', { media, place: 'none' });
    pendingAudio.current.delete(asset);
    const placed = film.current.run('clip.place', { media: media.id });
    setMessage(placed.ok ? `${media.name} placed on the sound track.` : `${media.name} added to Shots. ${placed.reason}`);
    if (!placed.ok) throw new Error(placed.reason);
    if (typeof placed.result === 'string') film.current.run('select.set', { clips: [placed.result] });
    setWorkspace('sound');
    return { media: media.id, clip: placed.result };
  };

  /** A spoken voice for one language (FILM-12b): its sound file becomes that language's voice track, one undo step. */
  const addVoice = async (lang: string, name: string, blob: Blob, options: { start?: number; append?: boolean } = {}) => {
    const seconds = await mediaDuration(blob, new AbortController().signal);
    const asset = addAudio(blob);
    const media: Media = { id: crypto.randomUUID(), kind: 'audio', asset, name: name.slice(0, 120), duration: fromSeconds(Math.min(seconds, LIMITS.filmSeconds)), camera: null, cues: [] };
    const done = film.current.batch([{ id: 'media.add', args: { media, place: 'none' } }, { id: 'voice.set', args: { lang, name: name.slice(0, 40), media: media.id, ...options } }], { label: `Voice: ${name}` });
    if (!done.ok) throw new Error(done.failed.reason);
    pendingAudio.current.delete(asset);
  };

  /** An actor's voice from a live take (FILM-11): on the actor's own sound track from `start` (film seconds), one undo step. */
  const addActorVoice = async (name: string, blob: Blob, start: number) => {
    const seconds = await mediaDuration(blob, new AbortController().signal);
    const asset = addAudio(blob);
    const media: Media = { id: crypto.randomUUID(), kind: 'audio', asset, name: `${name} (voice)`.slice(0, 120), duration: fromSeconds(Math.min(seconds, LIMITS.filmSeconds)), camera: null, cues: [] };
    const done = film.current.batch([{ id: 'media.add', args: { media, place: 'none' } }, { id: 'actor.voice', args: { media: media.id, name: name.slice(0, 40), start: Math.max(0, start) } }], { label: `Voice of ${name}` });
    if (!done.ok) throw new Error(done.failed.reason);
    pendingAudio.current.delete(asset);
  };

  /** Draft cues for the next recording, in seconds. */
  const plan = project.draft.map(cueToSeconds);
  const setPlan = (value: SceneCue[] | ((previous: SceneCue[]) => SceneCue[])) => {
    const next = typeof value === 'function' ? value(film.current.project.draft.map(cueToSeconds)) : value;
    validateCues(next, LIMITS.filmSeconds);
    must('cues.set', { cues: next });
    for (const cue of next) if (cue.audio) pendingAudio.current.delete(cue.audio);
  };

  /** Downloads the film and its recordings as one `.genvrfilm` file. */
  const downloadFile = async () => {
    const files = await Promise.all(assets.filter((a) => neededAssets(project).has(a.id))
      .map(async (a) => ({ id: a.id, type: a.blob.type, bytes: new Uint8Array(await a.blob.arrayBuffer()) })));
    const data = writeFilmFile(project, files);
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' })), link = document.createElement('a');
    link.href = url; link.download = `${place}.genvrfilm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage('Project file downloaded.');
  };
  /**
   * Opens a `.genvrfilm` file in place of the current film. Loading clears the undo list and the
   * save replaces the stored film, so the current film and its recordings are first kept under their
   * own key in this browser; `restorePrevious` brings them back.
   */
  const openFile = async (file: File) => {
    if (!loaded() || !key) throw new Error('Wait for your project to load.');
    if (file.size > LIMITS.mediaBytes + 16 * 1024 * 1024) throw new Error('That file is larger than the 128 MB project limit.');
    const { project: opened, assets: files } = readFilmFile(new Uint8Array(await file.arrayBuffer()));
    await storage(`${key}:before-open`, { project: film.current.project, assets: currentAssets.current });
    setPrevious(true);
    const nextAssets = files.map((a) => ({ id: a.id, blob: new Blob([a.bytes as BlobPart], { type: a.type }) }));
    setAssets(nextAssets); currentAssets.current = nextAssets; film.current.load(opened);
    setMessage(`Opened ${file.name}. Your previous film is kept; Restore brings it back.`);
  };
  /** Brings back the film that was open before the last `openFile` (it is kept until the next open). */
  const restorePrevious = async () => {
    if (!loaded() || !key) throw new Error('Wait for your project to load.');
    const kept = await storage(`${key}:before-open`);
    if (!kept) { setPrevious(false); throw new Error('There is no previous film to restore.'); }
    const restored = migrate(kept.project);
    setAssets(kept.assets); currentAssets.current = kept.assets; film.current.load(restored);
    setPrevious(false); setMessage('Previous film restored.');
  };

  const selection = film.current.state.selection;
  return {
    transport, filmPlaying, setFilmPlaying,
    identity: key, film: film.current, project, assets, length: toSeconds(filmLength(project)),
    selection, selected: selection.length === 1 ? selection[0]! : null,
    select: (clip: string | null) => { film.current.run('select.set', { clips: clip ? [clip] : [] }); },
    playhead: toSeconds(film.current.state.playhead),
    setPlayhead: (seconds: number) => { film.current.run('playhead.set', { at: Math.max(0, seconds) }); },
    workspace, setWorkspace, source, setSource, guides, setGuides, ungraded, setUngraded, levels, setLevels,
    run, batch, must, open, setOpen, mode, setMode, plan, setPlan, rendering, setRendering, previewing, setPreviewing,
    snapshot: () => ({ project: film.current.project, assets: currentAssets.current }), isRendering: () => renderBusy.current,
    addRecording, addAudio, addSound, addVoice, addActorVoice, downloadFile, openFile, restorePrevious, previous, message, setMessage, ready, flush,
    undoLabel: film.current.history.undoLabel, redoLabel: film.current.history.redoLabel,
  };
}
export type VideoStudio = ReturnType<typeof useVideoStudio>;
