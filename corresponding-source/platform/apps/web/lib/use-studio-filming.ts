'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilmCamera, FilmPhoto, FilmVideo, FilmStudioResult, type FilmPreset, type FilmStudioOperation, type FilmWaypoint } from '@genvr/contracts';
import { findAvatarMotion, motionCategories, avatarMotionEntries, FilmRig, captureFilm, sampleFilmPath, type GenvrRuntime, type RuntimeOptions } from '@genvr/runtime';
import { connectFilming } from './filming';
import { useVideoStudio } from './video-studio/use-video-studio';
import { mediaDuration, render, renderFrame } from './video-studio/render';
import { fitMusicSteps, loudnessSteps } from './video-studio/sound-jobs';
import { SUBTITLE_LANGUAGES, buildSubtitles } from './video-studio/subtitles';
import { filmRoom } from './film-room';
import type { FilmVoiceEvent } from '@genvr/contracts';
import { VOICES, speak } from './video-studio/dubbing';
import { EXPRESSIONS, type AssistantHost } from '@genvr/assistant';
import { fitCaptureViewport } from './video-studio/capture-viewport';
import { SceneSpeech } from './video-studio/scene-speech';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { SCENE_ACTOR, SCENE_FX_ACTIONS, approvalsGained, describe as describeFilm, filmSettings, forExport, isHostOnly, languageStatus, sceneFxSteps, shakeOffset, subtitleLines, toSeconds, toSrt, toVtt, type FilmProject } from '@genvr/film';
import { checkTakeLength, cueToSeconds, validateCues, type SceneCue } from './video-studio/model';

/** One rig and frame stream shared by the studio panel and its optional MCP connection. */
/** Avatar actions that move it (FILM-10b): plain walk and run by the walk itself, crouch walk and sneak with their own clip. */
const WALK_PLAIN = /(^|[.:/])walk$/, WALK_RUN = /(^|[.:/])run$/, WALK_CLIP = /(crouch-walk|sneak)$/;

/** A take with no picture data (FILM-TEST-01 D5): nothing is added or downloaded. */
const EMPTY_TAKE = `The take came out empty, so nothing was saved. Try again; if it repeats, turn off "Record the world's sound".`;

export function useStudioFilming(place: string, runtime: RefObject<GenvrRuntime | null>,
  container: RefObject<HTMLDivElement | null>, log: (text: string) => void,
  editing: () => boolean, storageKey: string | null, platformEnabled = true, voiceService?: AssistantHost['avatarVoice'], filmExample?: string | false) {
  const rig = useRef(new FilmRig());
  const studio = useVideoStudio(place, storageKey, filmExample);
  const latestStudio = useRef(studio); latestStudio.current = studio;
  const voice = useRef(voiceService); voice.current = voiceService;
  const sceneSpeech = useRef<SceneSpeech | null>(null);
  if (!sceneSpeech.current) sceneSpeech.current = new SceneSpeech((actor, shape) => { runtime.current?.setSpeechMouth(actor, shape); });
  const directing = useRef<{ cues: SceneCue[]; start: number; started: Set<string>; activeSelf: string | null; activeFace?: string | null;
    /** FILM-10: the avatar's walk of one cue, the spot it heads for now. */
    walking?: { cue: string; next: number; run: boolean; to: Array<{ x: number; z: number }> } | null } | null>(null);
  /** FILM-10: before a take the avatar goes to the start spot of its first cue, so the take opens there. */
  const prepareCast = async (cues: SceneCue[]) => {
    await sceneSpeech.current!.prepare(cues, latestStudio.current.snapshot().assets);
    const ids = [...new Set(cues.filter(cue => cue.actor === 'self' && cue.action.startsWith('motion:')).map(cue => cue.action))];
    for (const id of ids) if (!(await runtime.current?.prepareSceneAnimation(id))) throw new Error(`Motion is unavailable: ${id}`);
  };
  const placeCast = (cues: SceneCue[]) => {
    const first = [...cues].sort((a, b) => a.start - b.start).find((c) => c.actor === 'self' && c.at);
    if (first?.at) runtime.current?.teleportPlayer({ x: first.at.x, z: first.at.z });
  };
  const frames = useRef(new Set<() => void>());
  const originalFov = useRef(new WeakMap<object, number>());
  const cleanup = useRef<(() => void) | null>(null);
  /** Story panel preview (SCROLL-02): the camera holds this point of the story's flight. */
  const storyPreview = useRef<{ path: FilmWaypoint[]; time: number; cut: boolean } | null>(null);
  const manualFinish=useRef<AbortController|null>(null), manualBegan=useRef(0);
  const [manualRecording,setManualRecording]=useState(false);
  const localBusy = useRef(false), remoteBusy = useRef(false), connecting = useRef(false);
  const epoch = useRef(0), abort = useRef(new AbortController());
  const logger = useRef(log); logger.current = log;
  const isEditing = useRef(editing); isEditing.current = editing;
  const [camera, setCamera] = useState<FilmCamera | null>(null);
  const [output, setOutput] = useState({ seconds: 5, size: '1920x1080', worldSound: true, liveActors: false });
  const outputRef = useRef(output); outputRef.current = output;
  /** Film settings (FILM-A2) drive what is recorded: a change by the person or an agent reaches the next take. */
  const saved = filmSettings(studio.project);
  useEffect(() => {
    setOutput((old) => old.worldSound === saved.worldSound && old.liveActors === saved.roomVoices ? old : { ...old, worldSound: saved.worldSound, liveActors: saved.roomVoices });
  }, [saved.worldSound, saved.roomVoices]);
  useEffect(() => { setOutput((old) => old.seconds === saved.shotSeconds ? old : { ...old, seconds: saved.shotSeconds }); }, [saved.shotSeconds]);
  /**
   * Live actors (FILM-11): when on and in a room, a take tells the room when it starts and stops; each actor's voice
   * that comes back is put under the shot on the actor's own track. `where` gives the shot's film start once it is placed.
   */
  const liveTake = () => {
    if (!outputRef.current.liveActors || !filmRoom.connected) return null;
    const take = crypto.randomUUID();
    return {
      start: () => { filmRoom.sendTake({ action: 'start', take }); },
      cancel: () => { filmRoom.sendTake({ action: 'cancel', take }); },
      /**
       * The picture is done: actors stop and send their voices. They wait until `place` says where the shot sits on
       * the film (the recording is added after it is decoded), then each goes under it.
       */
      stop: () => {
        filmRoom.sendTake({ action: 'stop', take });
        report('Take stopped; waiting for the voices of the actors…');
        let where: (() => number | null) | null = null;
        const waiting: FilmVoiceEvent[] = [];
        const add = (event: FilmVoiceEvent) => {
          const at = where?.() ?? null;
          if (at === null) return;
          void latestStudio.current.addActorVoice(event.name, new Blob([event.audio as BlobPart], { type: event.mime }), at + event.delay / 1000)
            .then(() => report(`Voice of ${event.name} added under the shot.`))
            .catch((error: unknown) => report(`Voice of ${event.name}: ${error instanceof Error ? error.message : 'could not be added'}.`));
        };
        const off = filmRoom.onVoice((event) => { if (event.take !== take) return; if (where) add(event); else waiting.push(event); });
        setTimeout(off, 60_000);
        return { place: (at: () => number | null) => { where = at; for (const event of waiting.splice(0)) add(event); } };
      },
    };
  };
  /** The film start (seconds) of the clip showing a recording: the re-recorded clip, or the newest recording's clip. */
  const shotStart = (replace?: string) => {
    const project = latestStudio.current.snapshot().project;
    const clips = project.tracks.flatMap((t) => t.clips);
    const clip = replace ? clips.find((c) => c.id === replace)
      : clips.find((c) => c.type === 'media' && c.media === [...project.media].reverse().find((m) => m.kind === 'video')?.id);
    return clip ? toSeconds(clip.start) : null;
  };
  /** The world's sound for a take (FILM-08), when the switch is on and the world has started its sound. */
  const worldSound = () => output.worldSound ? runtime.current?.worldSoundStream() ?? null : null;
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose a camera preset, then take a photo or record.');
  const report = (text: string) => { setMessage(text); logger.current(`Filming: ${text}`); };
  const subscribe = (draw: () => void) => { frames.current.add(draw); return () => { frames.current.delete(draw); }; };
  const pauseForPlayback = () => {
    const view = runtime.current, current = epoch.current, paused = view?.isPaused();
    view?.setPaused(true);
    return () => { if (view && runtime.current === view && current === epoch.current) view.setPaused(paused ?? false); };
  };
  const releaseRuntime = () => {
    epoch.current++; abort.current.abort(); cleanup.current?.(); cleanup.current = null;
    sceneSpeech.current?.stop(); directing.current = null; runtime.current?.clearSceneMotions(); runtime.current?.stopSceneAnimation(); runtime.current?.presentExpression('self', 'neutral'); runtime.current?.sceneWalk(null);
    abort.current = new AbortController(); rig.current.reset(); frames.current.clear(); storyPreview.current = null;
    remoteBusy.current = false; localBusy.current = false;
    setConnected(false); setBusy(false); setCamera(null);
  };
  useEffect(() => {
    epoch.current++; abort.current = new AbortController();
    setConnected(false); setBusy(false); setCamera(null);
    localBusy.current = false; remoteBusy.current = false; rig.current.reset();
    const activeAbort = abort.current;
    return () => {
      epoch.current++; activeAbort.abort(); cleanup.current?.(); cleanup.current = null;
      sceneSpeech.current?.dispose(); rig.current.reset(); frames.current.clear();
    };
  }, [place]);
  const prepare = () => { runtime.current?.selectItems([]); runtime.current?.setTool(null); runtime.current?.setMarkersVisible(false); };
  const onFilmFrame: NonNullable<RuntimeOptions['onFilmFrame']> = (view, dt, player) => {
    sceneSpeech.current?.tick();
    const scene = directing.current;
    if (scene) {
      const time = (performance.now() - scene.start) / 1000;
      if (scene.activeSelf && scene.cues.some((c) => c.id === scene.activeSelf && time >= c.end)) {
        runtime.current?.stopSceneAnimation(); scene.activeSelf = null;
      }
      if (scene.activeFace && scene.cues.some(cue => cue.id === scene.activeFace && time >= cue.end)) { runtime.current?.presentExpression('self', 'neutral'); scene.activeFace = null; }
      for (const cue of scene.cues) {
        if (time < cue.start || scene.started.has(cue.id)) continue;
        scene.started.add(cue.id);
        if (time >= cue.end || cue.action === 'none') continue;
        const rt = runtime.current;
        if (cue.actor === 'self' && cue.action.startsWith('face:')) {
          const expression = EXPRESSIONS.find(value => `face:${value}` === cue.action);
          if (expression && rt?.presentExpression('self', expression)) scene.activeFace = cue.id;
          continue;
        }
        if (cue.actor === SCENE_ACTOR) continue; // scene effects: shake below, the rest added to the timeline after the take
        // FILM-10: the avatar starts on its spot and walks its path; walking and running come from the walk itself.
        if (cue.actor === 'self' && cue.at) rt?.teleportPlayer({ x: cue.at.x, z: cue.at.z });
        // Walking actions move the avatar for real (FILM-10b, owner N-054): along its spots, or straight ahead
        // when it has none, never on the spot. Walk and Run take their look from the movement itself.
        const imported = findAvatarMotion(cue.action), categories = imported ? motionCategories(imported.name, imported.category) : [];
        const plainRun = WALK_RUN.test(cue.action), run = plainRun || categories.includes('Running'), moving = WALK_PLAIN.test(cue.action) || run || WALK_CLIP.test(cue.action) || categories.includes('Walking');
        const feet = rt?.localPlayer;
        const path = cue.to?.length ? cue.to : moving && feet
          ? [{ x: feet.x + Math.sin(feet.yaw) * 200, z: feet.z + Math.cos(feet.yaw) * 200 }] : null;
        if (cue.actor === 'self' && path) {
          scene.walking = { cue: cue.id, next: 0, run, to: path }; rt?.sceneWalk(path[0]!, run);
          if (WALK_PLAIN.test(cue.action) || plainRun) continue;
        }
        // Scene objects walk their spots too (FILM-10b); dance, bob, spin and sway play on top.
        if (cue.actor !== 'self' && cue.to?.length && !rt?.sceneTravel(cue.actor, cue.at ?? null, cue.to, run))
          logger.current(`Scene: ${cue.label} cannot walk (only anchored objects without a collider can).`);
        if (cue.actor !== 'self' && (cue.action === 'none' || cue.action === 'run')) continue;
        const played = cue.actor === 'self' ? rt?.playSceneAnimation(cue.action) :
          rt?.sceneMotion(cue.actor, cue.action as 'dance' | 'bob' | 'spin' | 'sway', cue.end - time);
        if (!played) logger.current(`Scene: ${cue.label} cannot perform ${cue.action}.`);
        else if (cue.actor === 'self') scene.activeSelf = cue.id;
      }
    }
    // FILM-10: the walk goes on to the next spot when one is reached, and stops at the cue's end.
    const walk = scene?.walking, walked = walk ? scene!.cues.find((c) => c.id === walk.cue) : undefined;
    if (scene && walk && walked) {
      const time = (performance.now() - scene.start) / 1000, rt = runtime.current, feet = rt?.localPlayer;
      if (feet && walk.next < walk.to.length && Math.hypot(walk.to[walk.next]!.x - feet.x, walk.to[walk.next]!.z - feet.z) < 0.2) {
        walk.next++;
        if (walk.next < walk.to.length) rt?.sceneWalk(walk.to[walk.next]!, walk.run);
      }
      if (time >= walked.end || walk.next >= walk.to.length) {
        rt?.sceneWalk(null); scene.walking = null;
        if (scene.activeSelf === walked.id) { rt?.stopSceneAnimation(); scene.activeSelf = null; }
      }
    }
    const story = storyPreview.current;
    if (story && !rig.current.settings) {
      if (!originalFov.current.has(view)) originalFov.current.set(view, view.fov);
      const shot = sampleFilmPath(story.path, story.time);
      view.position.copy(shot.position);
      view.lookAt(shot.target);
      const fov = shot.fov ?? originalFov.current.get(view)!;
      if (view.fov !== fov) { view.fov = fov; view.updateProjectionMatrix(); }
    } else if (rig.current.settings) {
      if (!originalFov.current.has(view)) originalFov.current.set(view, view.fov);
      rig.current.update(view, dt, player);
    } else if (originalFov.current.has(view)) {
      view.fov = originalFov.current.get(view)!; view.updateProjectionMatrix(); originalFov.current.delete(view);
    }
    // Scene-effect shake (FILM-03b): the filming camera itself shakes, so the take records it.
    if (scene) {
      const time = (performance.now() - scene.start) / 1000;
      for (const cue of scene.cues) if (cue.actor === SCENE_ACTOR && cue.action === 'fx_shake' && time >= cue.start && time < cue.end) {
        const o = shakeOffset(1, time - cue.start, 0.7, 6);
        view.position.x += o.x * 2; view.position.y += o.y * 2; view.rotateZ((o.rotation * Math.PI) / 180);
      }
    }
    const direction = view.position.clone(); view.getWorldDirection(direction);
    const canvas = container.current?.querySelector('canvas');
    if (canvas) rig.current.view = { position: view.position.toArray(), direction: direction.toArray(),
      fov: view.fov, render_width: canvas.width, render_height: canvas.height };
    if (story?.cut) { story.cut = false; rig.current.consumeCut(); return { cut: true, actorVisible: true }; }
    return { cut: rig.current.consumeCut(), actorVisible: Boolean(story || rig.current.settings) };
  };
  /** Shows the story's flight at `time` (stop index, fractions between stops), or gives the camera back. */
  const previewStory = (path: FilmWaypoint[] | null, time = 0, cut = true) => {
    if (!path || path.length === 0) { storyPreview.current = null; return; }
    storyPreview.current = { path, time, cut: cut || !storyPreview.current };
  };
  /** Where the studio camera is now and which way it looks (null before the first frame). */
  const cameraView = () => rig.current.view ?? null;
  const onRendered = () => { for (const draw of [...frames.current]) draw(); };
  const apply = (raw: unknown) => {
    if (localBusy.current || remoteBusy.current) return;
    try {
      const settings = rig.current.set(raw); setCamera(settings); prepare();
      try { localStorage.setItem(`genvr-film-${place}`, JSON.stringify(settings)); } catch { /* Optional storage. */ }
      report(`${settings.preset} camera applied.`);
    } catch (error) { report(error instanceof Error ? error.message : 'Invalid camera settings.'); }
  };
  const preset = (name: FilmPreset) => {
    const p = runtime.current?.playerPosition; if (!p) return;
    const rounded = (point: number[]) => point.map((value) => Math.round(value * 1000) / 1000);
    apply({ preset: name, position: rounded([p.x + (name === 'side' ? 8 : 0), p.y + (name === 'drone' ? 12 : 3), p.z - (name === 'side' ? 0 : 8)]),
      target: rounded([p.x, p.y + 1.5, p.z]), follow_player: ['follow', 'side', 'handheld', 'running'].includes(name) });
  };
  const reset = () => { if (localBusy.current || remoteBusy.current) return;
    rig.current.reset(); runtime.current?.setMarkersVisible(isEditing.current());
    setCamera(null); report('Gameplay camera restored.'); };
  const connect = async () => {
    if (!platformEnabled) { report('Remote filming requires a configured Genvr host.'); return; }
    if (connecting.current || cleanup.current) return;
    const canvas = container.current?.querySelector('canvas'); if (!canvas) return;
    connecting.current = true; const current = epoch.current;
    try {
      const stop = await connectFilming(place, rig.current, canvas, subscribe,
        (text) => { if (current === epoch.current) { report(text); setCamera(rig.current.settings); } },
        () => { if (current === epoch.current) { setConnected(false); cleanup.current = null; setCamera(null);
          runtime.current?.setMarkersVisible(isEditing.current()); } },
        () => !localBusy.current && !latestStudio.current.isRendering(),
        (running, command) => {
          if (current === epoch.current) {
            remoteBusy.current = running; setBusy(running || localBusy.current);
            if (running && command && ['camera', 'photo', 'video'].includes(command.kind)) prepare();
            if (!running && !rig.current.settings && !localBusy.current)
              runtime.current?.setMarkersVisible(isEditing.current());
          }
        }, handleStudio);
      if (current !== epoch.current) { stop(); return; }
      cleanup.current = stop; setConnected(true); remember(true);
    } catch (error) { if (current === epoch.current) report(error instanceof Error ? error.message : 'Connection failed.'); }
    finally { connecting.current = false; }
  };
  /**
   * D9 (FILM-TEST-01): a Studio tab that was connected to MCP connects again after a reload, so an agent does not lose
   * it. Kept in this tab only (sessionStorage): a new tab or window still needs Connect MCP.
   */
  const memoryKey = `genvr-mcp-connected:${place}`;
  const remember = (on: boolean) => { try { if (on) sessionStorage.setItem(memoryKey, '1'); else sessionStorage.removeItem(memoryKey); } catch { /* storage off */ } };
  const connectRef = useRef(connect); connectRef.current = connect;
  useEffect(() => {
    if (!platformEnabled) return;
    let wanted = false;
    try { wanted = sessionStorage.getItem(memoryKey) === '1'; } catch { /* storage off */ }
    if (!wanted) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (cleanup.current || ++tries > 60) { window.clearInterval(timer); return; }
      if (container.current?.querySelector('canvas') && editing()) void connectRef.current();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [place]);
  const actors = () => [{ id: 'self', label: 'My avatar' }, { id: SCENE_ACTOR, label: 'Scene effects' }, ...(runtime.current?.sceneActorIds() ?? [])
    .map((id) => ({ id, label: runtime.current?.itemName(runtime.current.world.instances.find((i) => i.instanceId === id)!.itemId) ?? id }))];
  const actions = [...CORE_ANIMATIONS.map(a => ({ id: a.manifest.id, label: a.manifest.name })),
    ...avatarMotionEntries().map(entry => ({ id: entry.id, label: entry.name.slice(0, 120) })),
    ...EXPRESSIONS.map(expression => ({ id: `face:${expression}`, label: `Face: ${expression}` }))];
  /** A timeline clip's recording and its cues in seconds (for directing and re-recording). */
  const clipShot = (project: FilmProject, clipId: string) => {
    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) throw new Error('Clip not found in this browser project.');
    if (clip.type !== 'media') throw new Error('That clip is not a recording.');
    const media = project.media.find((m) => m.id === clip.media)!;
    return { clip, media, cues: media.cues.map(cueToSeconds) };
  };
  const checkCueActors = (cues: SceneCue[]) => {
    const actorIds = new Set(actors().map((a) => a.id));
    for (const cue of cues) {
      if (cue.actor === 'self' && cue.action.startsWith('face:') && cue.action !== 'face:neutral' && !runtime.current?.supportsAvatarExpression('self')) throw new Error('This character has no facial controls. Choose Standard robot or our human for expression cues.');
      if (!actorIds.has(cue.actor) || (cue.action !== 'none' && !(cue.actor === 'self' ? actions.some((a) => a.id === cue.action)
        : cue.actor === SCENE_ACTOR ? SCENE_FX_ACTIONS.some((a) => a.id === cue.action) : ['dance', 'bob', 'spin', 'sway', 'run'].includes(cue.action))))
        throw new Error('Choose an available scene actor and compatible action.');
    }
  };
  /** The scene-effect cues of a take just added become adjustment layers over it (FILM-03b). */
  const addSceneFx = (cues: SceneCue[]) => {
    const s = latestStudio.current, clip = s.film.project.tracks.flatMap((t) => t.clips).find((c) => c.id === s.film.state.selection[0]);
    if (!clip || !cues.some((c) => c.actor === SCENE_ACTOR)) return;
    // Cues are cut to the take as recorded (a take can come in shorter than planned).
    const length = toSeconds(clip.duration);
    const inside = cues.filter((c) => c.start < length).map((c) => ({ ...c, end: Math.min(c.end, length) }));
    const steps = sceneFxSteps(inside, toSeconds(clip.start), Math.floor(Math.random() * 9999) + 1);
    if (!steps.length) return;
    const result = s.film.batch(steps, { label: 'Scene effects' });
    if (!result.ok) s.setMessage(`The take was added, but its scene effects were not: ${result.failed?.reason ?? 'they could not be placed'}.`);
  };
  /** Script lines changed through MCP always count as an agent's (FILM-B2): they need the owner's approval again. */
  const AGENT_STAMPED = new Set(['line.write', 'line.set', 'line.remove', 'cast.set', 'cast.remove']);
  const byAgent = (id: string, args: unknown) => AGENT_STAMPED.has(id) ? { ...(args as Record<string, unknown>), by: 'agent' } : args;
  /** Undo, redo or a history jump through MCP may not bring back a line approval (only the owner approves). */
  const guardHistory = (id: string, args: unknown = {}) => {
    const film = latestStudio.current.film, target = film.historyTarget(id, args);
    if (target && approvalsGained(film.project, target).length) throw new Error('That step would bring back a line approval; only the owner approves lines. Ask the owner to undo it in the Studio.');
  };
  /** MCP studio operations: the same command session as the editor's buttons and keys. */
  const handleStudio = async (operation: FilmStudioOperation, signal: AbortSignal): Promise<Blob> => {
    const s = latestStudio.current, current = epoch.current, identity = s.identity;
    if (!s.ready || !identity) throw new Error('Wait for the local video project to load.');
    const fresh = () => { if (signal.aborted || current !== epoch.current || identity !== latestStudio.current.identity) throw new Error('Studio operation cancelled.'); };
    const project = s.snapshot().project;
    const must = (id: string, args: unknown = {}) => { const r = s.film.run(id, args); if (!r.ok) throw new Error(r.reason); return r.result; };
    const reply = (extra: Record<string, unknown> = {}) => {
      const now = latestStudio.current, undo = now.film.history.undoLabel, redo = now.film.history.redoLabel;
      return new Blob([JSON.stringify(FilmStudioResult.parse({ film: describeFilm(now.film.project), ...extra,
        ...(undo ? { undo } : {}), ...(redo ? { redo } : {}), actors: actors().slice(0, 1000), actions,
        assets: now.snapshot().assets.map((a) => ({ id: a.id, mime: a.blob.type, bytes: a.blob.size })) }))], { type: 'application/json' });
    };
    fresh();
    switch (operation.kind) {
      case 'lighting': {
        if(operation.lights && !runtime.current?.applyCommand({type:'set_lighting',params:{lights:operation.lights}})) throw new Error('Could not update scene lights.');
        return reply({result:{lights:runtime.current?.world.environment.lighting ?? []}});
      }
      case 'manual_record': throw new Error('Manual recording is handled by the live session.');
      case 'sound_import': {
        const bytes = Uint8Array.from(atob(operation.data), ch => ch.charCodeAt(0));
        if (bytes.length > 8 * 1024 * 1024) throw new Error('MCP audio import supports up to 8 MB; use Sound to import files up to 20 MB.');
        const result = await s.addSound(new File([bytes], operation.name, { type: operation.mime })); fresh();
        await s.flush(); return reply({ result });
      }
      case 'dialogue_voice': {
        if (!voice.current) throw new Error('Connect the local voice service first.');
        const shot = operation.shot_id ? clipShot(project, operation.shot_id) : null;
        const cues = shot?.cues ?? s.plan, cue = cues.find(row => row.id === operation.cue_id);
        if (!cue || !cue.text.trim() || cue.actor === SCENE_ACTOR) throw new Error('Choose a character cue with dialogue text.');
        const library = await voice.current({ action: 'voices', target: 'self' }) as { voices: Array<{ id: string; name: string; model: string; voiceType?: 'male' | 'female' | 'child' }> };
        const profile = library.voices.find(row => row.id === operation.voice_id);
        if (!profile) throw new Error('Choose a saved voice from the voice library.');
        let job = await voice.current({ action: 'speak', model: profile.model, voiceId: profile.id, language: operation.language, text: cue.text, target: cue.actor, preview: false }) as { id: string; status: string; error?: string; result?: { audioId: string; duration: number } };
        while (job.status === 'running') { fresh(); await new Promise(resolve => setTimeout(resolve, 500)); job = await voice.current({ action: 'job', jobId: job.id, target: 'self' }) as typeof job; }
        fresh(); if (job.status !== 'done' || !job.result) throw new Error(job.error ?? 'Dialogue generation failed.');
        const end = cue.start + job.result.duration, limit = shot ? toSeconds(shot.media.duration) : 30;
        if (end > limit) throw new Error(`The generated line ends at ${end.toFixed(1)} s; shorten the text or move its start inside ${limit.toFixed(1)} s.`);
        const audio = await voice.current({ action: 'audio', audioId: job.result.audioId, target: 'self' }) as { data: string };
        fresh();
        const currentProject = latestStudio.current.snapshot().project;
        const currentCues = shot ? clipShot(currentProject, operation.shot_id!).cues : latestStudio.current.plan;
        const currentCue = currentCues.find(row => row.id === cue.id);
        if (!currentCue || JSON.stringify(currentCue) !== JSON.stringify(cue)) throw new Error('The scene cue changed during generation. Generate it again.');
        const bytes = Uint8Array.from(atob(audio.data), ch => ch.charCodeAt(0));
        const asset = latestStudio.current.addAudio(new Blob([bytes], { type: 'audio/wav' }));
        const next = currentCues.map(row => row.id === cue.id ? { ...row, audio: asset, end, voice: { id: profile.id, name: profile.name, language: operation.language, model: profile.model, ...(profile.voiceType ? { voiceType: profile.voiceType } : {}) } } : row);
        if (shot) latestStudio.current.must('cues.set', { media: shot.media.id, cues: next }); else { latestStudio.current.setPlan(next); setOutput(old => ({ ...old, seconds: Math.max(old.seconds, Math.min(30, Math.ceil(end + .25))) })); }
        await latestStudio.current.flush(); report(`${profile.name}: dialogue attached to the scene cue.`);
        return reply({ result: { cue_id: cue.id, audio: asset, duration: job.result.duration, voice: profile.name, language: operation.language } });
      }
      case 'dialogue_track': {
        const shot = clipShot(project, operation.shot_id);
        const cue = shot.cues.find(row => row.id === operation.cue_id);
        const audio = s.snapshot().assets.find(row => row.id === cue?.audio);
        if (!cue?.text.trim() || !audio) throw new Error('Choose a recorded dialogue cue with audio.');
        const start = operation.start ?? cue.start;
        const end = start + cue.end - cue.start;
        await s.addVoice(operation.language, `${operation.language.toUpperCase()} · ${cue.voice?.name ?? cue.label}`, audio.blob, { start, append: operation.append }); fresh();
        const track = s.film.project.tracks.find(row => row.kind === 'sound' && row.lang === operation.language);
        if (!track?.clips[0]) throw new Error('The language sound track was not created.');
        must('subtitles.set', { lang: operation.language, name: operation.language.toUpperCase(), show: true, lines: [...(operation.append ? subtitleLines(project, operation.language) : []), { start, end, text: cue.text }] });
        await s.flush();
        return reply({ result: { language: operation.language, start, end } });
      }
      case 'dialogue_preview': {
        const cues = operation.shot_id ? clipShot(project, operation.shot_id).cues : s.plan;
        const cue = cues.find(row => row.id === operation.cue_id);
        if (!cue?.audio) throw new Error('Generate or attach dialogue audio first.');
        await sceneSpeech.current!.prepare([{ ...cue, start: 0, end: cue.end - cue.start }], s.snapshot().assets); fresh(); sceneSpeech.current!.start();
        return reply({ result: { cue_id: cue.id, playing: true } });
      }
      case 'inspect': return reply();
      case 'commands': return reply({ commands: s.film.list() });
      case 'sound': {
        const snap = s.snapshot();
        const steps = operation.action === 'match_loudness' ? await loudnessSteps(snap.project, snap.assets)
          : await fitMusicSteps(snap.project, snap.assets, operation.clip ?? s.selected ?? '');
        fresh();
        if (!steps.length) throw new Error('No imported sound to measure.');
        const result = s.film.batch(steps, { label: operation.action === 'match_loudness' ? 'Match loudness' : 'Fit music' });
        if (!result.ok) throw new Error(result.failed.reason);
        return reply({ result: result.results });
      }
      case 'subtitles': {
        const snap = s.snapshot();
        const made = await buildSubtitles(snap.project, snap.assets, { spoken: operation.spoken ?? null, languages: operation.languages }, report, signal);
        fresh();
        const result = s.film.batch(made.map((one, i) => ({ id: 'subtitles.set', args: { ...one, show: i === 0 } })), { label: 'Make subtitles' });
        if (!result.ok) throw new Error(result.failed.reason);
        const voiced: string[] = [];
        if (operation.voice) for (const one of made) if (VOICES[one.lang] && one.lines.length) {
          await latestStudio.current.addVoice(one.lang, `Voice · ${one.name}`, await speak(one.lines, one.lang, report, signal)); fresh(); voiced.push(one.lang);
        }
        return reply({ result: made.map((one) => ({ lang: one.lang, lines: one.lines.length, voice: voiced.includes(one.lang) })) });
      }
      case 'ui': {
        if (operation.workspace) s.setWorkspace(operation.workspace);
        const now = latestStudio.current;
        return reply({ ui: { workspace: operation.workspace ?? now.workspace, playhead: now.playhead, selection: now.selection, source: now.source?.media ?? null } });
      }
      case 'command': {
        if (isHostOnly(operation.id)) throw new Error(`${operation.id} runs only inside the Studio.`);
        guardHistory(operation.id, operation.args);
        return reply({ result: must(operation.id, byAgent(operation.id, operation.args)) });
      }
      case 'language': {
        // FILM-B3: fill the gaps Film settings asks for, with the same subtitle and voice jobs as the Captions panel.
        const gaps = languageStatus(project).filter((row) => !operation.languages || operation.languages.includes(row.lang));
        const captions = operation.what === 'voices' ? [] : gaps.filter((row) => row.missing.includes('captions')).map((row) => row.lang);
        const voices = operation.what === 'captions' ? [] : gaps.filter((row) => row.missing.includes('voice')).map((row) => row.lang);
        const done: Array<{ lang: string; made: string }> = [], skipped: Array<{ lang: string; reason: string }> = [];
        if (captions.length) { await handleStudio({ kind: 'subtitles', languages: captions }, signal); fresh(); captions.forEach((lang) => done.push({ lang, made: 'captions' })); }
        for (const lang of voices) {
          if (!VOICES[lang]) { skipped.push({ lang, reason: `No free voice for ${lang} yet; give the characters a saved voice and use dialogue_voice.` }); continue; }
          if (!subtitleLines(latestStudio.current.snapshot().project, lang).length) { skipped.push({ lang, reason: 'Make the captions of this language first.' }); continue; }
          await handleStudio({ kind: 'voice', language: lang }, signal); fresh(); done.push({ lang, made: 'voice' });
        }
        for (const row of gaps) if (row.missing.includes('words')) skipped.push({ lang: row.lang, reason: `${row.lines - row.words} script lines have no words in this language; write them with line.set.` });
        return reply({ result: { done, skipped, status: languageStatus(latestStudio.current.snapshot().project) } });
      }
      case 'batch': {
        const blocked = operation.steps.find((step) => isHostOnly(step.id));
        if (blocked) throw new Error(`${blocked.id} runs only inside the Studio.`);
        const result = s.film.batch(operation.steps.map((step) => ({ ...step, args: byAgent(step.id, step.args) })), { atomic: operation.atomic, ...(operation.label ? { label: operation.label } : {}) });
        return reply({ result: result.results, ...(result.ok ? {} : { failed: result.failed }) });
      }
      case 'frame': {
        const blob = await renderFrame(project, s.snapshot().assets, operation.at, operation.width, operation.height, signal);
        fresh(); return blob;
      }
      case 'split': {
        const { clip } = clipShot(project, operation.shot_id);
        must('clip.split', { clips: [clip.id], at: toSeconds(clip.start) + operation.at - toSeconds(clip.in) });
        return reply();
      }
      case 'remove': must('clip.remove', { clips: [operation.shot_id], ripple: true }); return reply();
      case 'trim': {
        // The first editor's trim set source in/out and the shot list closed up: ripple trims of both edges.
        const { clip } = clipShot(project, operation.shot_id);
        const byStart = operation.in - toSeconds(clip.in), byEnd = (operation.out - operation.in) - (toSeconds(clip.duration) - byStart);
        const steps = [...(Math.abs(byStart) > 1e-6 ? [{ id: 'clip.trim', args: { clip: clip.id, edge: 'start', by: byStart, ripple: true } }] : []),
          ...(Math.abs(byEnd) > 1e-6 ? [{ id: 'clip.trim', args: { clip: clip.id, edge: 'end', by: byEnd, ripple: true } }] : [])];
        if (!steps.length) throw new Error('Nothing to trim.');
        const result = s.film.batch(steps, { label: 'Trim' });
        if (!result.ok) throw new Error(result.failed.reason);
        return reply();
      }
      case 'move': throw new Error('Move a clip with {kind:"command", id:"clip.move", args:{clip, start, track?, mode?}}.');
      case 'undo': guardHistory('edit.undo'); return reply({ result: must('edit.undo') });
      case 'redo': guardHistory('edit.redo'); return reply({ result: must('edit.redo') });
      case 'cues': {
        const shot = operation.shot_id ? clipShot(project, operation.shot_id) : undefined;
        validateCues(operation.cues, shot ? toSeconds(shot.media.duration) : 30);
        checkCueActors(operation.cues);
        if (shot) { must('cues.set', { media: shot.media.id, cues: operation.cues }); s.select(shot.clip.id); }
        s.setPlan(operation.cues);
        return reply();
      }
      case 'voice': {
        if (!VOICES[operation.language]) throw new Error(`No free voice for ${operation.language} yet; voices: ${Object.keys(VOICES).join(', ')}.`);
        const lines = subtitleLines(s.snapshot().project, operation.language);
        if (!lines.length) throw new Error('Make the subtitles of this language first (kind "subtitles").');
        const name = SUBTITLE_LANGUAGES.find((l) => l.code === operation.language)?.native ?? operation.language;
        await s.addVoice(operation.language, `Voice · ${name}`, await speak(lines, operation.language, report, signal)); fresh();
        return reply({ result: { language: operation.language, lines: lines.length } });
      }
      case 'subtitle_file': {
        const lines = subtitleLines(project, operation.language);
        if (!lines.length) throw new Error('No subtitles in that language.');
        return reply({ result: { language: operation.language, format: operation.format, text: operation.format === 'vtt' ? toVtt(lines) : toSrt(lines) } });
      }
      case 'record': {
        s.setWorkspace('shoot'); s.setPreviewing(false);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); fresh();
        const canvas = container.current?.querySelector('canvas'); if (!canvas) throw new Error('World canvas unavailable.');
        if (operation.world_sound !== undefined || operation.live_actors !== undefined) {
          const next = { ...outputRef.current, ...(operation.world_sound !== undefined ? { worldSound: operation.world_sound } : {}),
            ...(operation.live_actors !== undefined ? { liveActors: operation.live_actors } : {}) };
          outputRef.current = next; setOutput(next);
        }
        const shot = operation.shot_id ? clipShot(project, operation.shot_id) : undefined;
        if (operation.gameplay) { rig.current.reset(); setCamera(null); }
        else if (shot) { if (shot.media.camera) rig.current.set(shot.media.camera); else rig.current.reset(); setCamera(shot.media.camera); }
        const releaseViewport = fitCaptureViewport(container.current, operation.settings.width, operation.settings.height);
        let live: ReturnType<typeof liveTake> = null;
        try {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); fresh();
          prepare(); const cues = shot?.cues ?? s.plan, sound = outputRef.current.worldSound ? runtime.current?.worldSoundStream() ?? null : null; await prepareCast(cues); placeCast(cues);
          live = liveTake();
          const blob = await captureFilm(canvas, { kind: 'video', settings: operation.settings }, signal, subscribe, () => {
            if (rig.current.settings?.path) rig.current.set(rig.current.settings);
            live?.start(); sceneSpeech.current?.start();
            directing.current = { cues: [...cues].sort((a, b) => a.start - b.start), start: performance.now(), started: new Set(), activeSelf: null };
          }, (seconds) => { if (current === epoch.current) report(`Recording ${seconds.toFixed(1)} / ${operation.settings.seconds} s…`); }, sound);
          const stopped = live?.stop();
          if (!blob.size) throw new Error(EMPTY_TAKE);
          const duration = await mediaDuration(blob, signal); fresh();
          checkTakeLength(duration, operation.settings.seconds);
          latestStudio.current.addRecording(blob, duration, rig.current.settings, operation.shot_id, cues, !!sound?.getAudioTracks().length);
          stopped?.place(() => shotStart(operation.shot_id));
          if (!operation.shot_id) addSceneFx(cues);
        } catch (error) { live?.cancel(); throw error; }
        finally { releaseViewport(); if (current === epoch.current) { sceneSpeech.current?.stop(); directing.current = null; runtime.current?.clearSceneMotions(); runtime.current?.stopSceneAnimation(); runtime.current?.presentExpression('self', 'neutral'); runtime.current?.sceneWalk(null); } }
        return reply();
      }
      case 'export': {
        // FILM-A3: one language per file, captions on the picture or none, the shot or the marked In/Out.
        if (operation.range === 'marked' && !project.range) throw new Error('Mark In and Out first, or export the full film.');
        const chosen = forExport(project, { language: operation.language, captions: operation.captions });
        const clip = operation.shot_id ? clipShot(project, operation.shot_id).clip : null;
        const range = clip ? {from:toSeconds(clip.start),to:toSeconds(clip.start+clip.duration)}
          : operation.range === 'marked' && project.range ? { from: toSeconds(project.range.in), to: toSeconds(project.range.out) } : undefined;
        const canvas = document.createElement('canvas'); canvas.width = operation.width; canvas.height = operation.height;
        s.setRendering(true);
        const resume = pauseForPlayback();
        try {
          const blob = await render(chosen, s.snapshot().assets, canvas, signal, (seconds) => { if (current === epoch.current) report(`Exporting ${seconds.toFixed(1)} seconds…`); }, true, range?.from ?? 0, undefined, range);
          fresh(); if (!blob || blob.size > 40 * 1024 * 1024) throw new Error('Export exceeds the 40 MB MCP artifact limit.'); report('Film exported with its timeline audio.'); return blob;
        } finally { resume(); if (identity === latestStudio.current.identity) latestStudio.current.setRendering(false); }
      }
    }
  };
  const take = async (kind: 'photo' | 'video', seconds: number, width: number, height: number,
    timeline = false, replace?: string, cues: SceneCue[] = [], manual = false) => {
    if (localBusy.current || remoteBusy.current || latestStudio.current.isRendering()) return;
    const canvas = container.current?.querySelector('canvas'); if (!canvas) return;
    localBusy.current = true; setBusy(true); prepare(); const current = epoch.current;
    let fallbackMessage: string | undefined;
    let live: ReturnType<typeof liveTake> = null;
    const releaseViewport = fitCaptureViewport(container.current, width, height);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      report(kind === 'video' ? `Recording ${seconds} seconds…` : 'Taking photo…');
      const command = kind === 'video'
        ? { kind: 'video' as const, settings: FilmVideo.parse({ width, height, seconds }) }
        : { kind: 'photo' as const, settings: FilmPhoto.parse({ width, height }) };
      const sound = kind === 'video' ? worldSound() : null;
      if (timeline) { await prepareCast(cues); placeCast(cues); }
      live = kind === 'video' && timeline ? liveTake() : null;
      if(manual)manualFinish.current=new AbortController();
      const blob = await captureFilm(canvas, command, abort.current.signal, subscribe, () => {
        if(manual){manualBegan.current=performance.now();setManualRecording(true);}
        live?.start();
        if (timeline) sceneSpeech.current?.start();
        if (timeline) directing.current = { cues: [...cues].sort((a, b) => a.start - b.start), start: performance.now(), started: new Set(), activeSelf: null };
      }, (done) => { if (current === epoch.current) report(`Recording ${done.toFixed(1)} / ${seconds} s…`); }, sound, manual ? manualFinish.current?.signal : undefined);
      if(manual)setManualRecording(false);
      const elapsed=manual ? Math.min(seconds,(performance.now()-manualBegan.current)/1000) : seconds;
      const stopped = live?.stop(); live = null;
      if (current !== epoch.current) return;
      if (!blob.size) throw new Error(EMPTY_TAKE);
      if (kind === 'video' && timeline) {
        try {
          const duration = await mediaDuration(blob, abort.current.signal);
          if (current !== epoch.current) return;
          checkTakeLength(duration, elapsed);
          studio.addRecording(blob, duration, rig.current.settings, replace, cues, !!sound?.getAudioTracks().length);
          stopped?.place(() => shotStart(replace));
          if (!replace) addSceneFx(cues);
          report('Recording added to video editor.'); return;
        } catch (error) {
          if (current !== epoch.current) return;
          fallbackMessage = `${error instanceof Error ? error.message : 'Could not add shot.'} Source recording downloaded.`;
        }
      }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${place}-${Date.now()}.${kind === 'photo' ? 'png' : 'webm'}`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      report(fallbackMessage ?? `${kind === 'photo' ? 'Photo' : 'Silent video'} downloaded.`);
    } catch (error) { live?.cancel(); if (current === epoch.current) report(error instanceof Error ? error.message : 'Capture failed.'); }
    finally { if(manual){manualFinish.current?.abort();manualFinish.current=null;manualBegan.current=0;setManualRecording(false);} releaseViewport(); if (current === epoch.current) {
      localBusy.current = false;
      sceneSpeech.current?.stop(); directing.current = null; runtime.current?.clearSceneMotions(); runtime.current?.stopSceneAnimation(); runtime.current?.presentExpression('self', 'neutral'); runtime.current?.sceneWalk(null);
      setBusy(remoteBusy.current); if (!rig.current.settings) runtime.current?.setMarkersVisible(isEditing.current());
    } }
  };
  const startManual = (limit = 30) => {
    if(!latestStudio.current.ready)throw new Error('Wait for the film project to load.');
    if(localBusy.current||remoteBusy.current||latestStudio.current.isRendering())throw new Error('Wait for the current capture or render.');
    reset();latestStudio.current.setWorkspace('shoot');latestStudio.current.setPreviewing(false);
    const [width,height]=outputRef.current.size.split('x').map(Number);
    void take('video',Math.max(1,Math.min(30,limit)),width!,height!,true,undefined,[],true);
  };
  const endManual = () => {if(!manualFinish.current||!manualBegan.current)throw new Error('Wait for Start scene to begin recording.');manualFinish.current.abort();};
  const runLocalStudioOperation = async (operation: FilmStudioOperation, signal: AbortSignal) => {
    if(operation.kind==='manual_record'){if(operation.action==='start')startManual(operation.seconds);else endManual();return new Blob([JSON.stringify({result:{state:operation.action==='start'?'starting':'finishing'}})],{type:'application/json'});}
    if (localBusy.current || remoteBusy.current || latestStudio.current.isRendering()) throw new Error('Wait for the current capture or render.');
    remoteBusy.current = true; setBusy(true);
    try { return await handleStudio(operation, signal); }
    finally { remoteBusy.current = false; setBusy(localBusy.current); }
  };
  const capturePhoto = async (raw: unknown, signal: AbortSignal) => {
    const canvas = container.current?.querySelector('canvas'); if (!canvas) throw new Error('World canvas unavailable.');
    prepare(); return captureFilm(canvas, { kind: 'photo', settings: FilmPhoto.parse(raw) }, signal, subscribe, () => {}, () => {});
  };
  return { startManual, endManual, manualRecording, assignSavedVoice: async (voiceId: string, target = 'self') => { if (!voice.current) throw new Error('Voice service unavailable.'); return voice.current({ action: 'assign', voiceId, target, projectId: place }); },
    selectedVoice: async (target = 'self') => { if(!voice.current)return ''; const library = await voice.current({action:'voices',target:'self'}) as {assignments?:Record<string,string>}; return library.assignments?.[place+':'+target] ?? ''; },
    previewSavedVoice: async (voiceId: string) => { if (!voice.current) throw new Error('Voice service unavailable.'); return voice.current({ action: 'preview', voiceId, target: 'self' }); }, voiceAvailable: Boolean(voiceService), voiceLibrary: async () => { if (!voice.current) return { voices: [], models: [] }; const [library, catalog] = await Promise.all([voice.current({ action: 'voices', target: 'self' }), voice.current({ action: 'models', target: 'self' })]); return { ...(library as { voices: Array<{ id: string; name: string; language?: string; voiceType?: string; model: string }> }), ...(catalog as { models: Array<{ id: string; languages: string[] }> }) }; }, handleStudio: runLocalStudioOperation, sceneActors: () => actors().filter((a) => a.id !== SCENE_ACTOR), capturePhoto, camera, studio, output, setOutput, busy, connected, message, onFilmFrame, onRendered, releaseRuntime, apply, preset, reset, connect, take,
    previewStory, cameraView,
    actors, actions, pauseForPlayback,
    sceneLights: () => runtime.current?.world.environment.lighting ?? [],
    setSceneLights: (lights: import('@genvr/contracts').SceneLight[]) => { if (!runtime.current?.applyCommand({type:'set_lighting',params:{lights}})) throw new Error('Could not update scene lights.'); },
    /** FILM-10: where the avatar stands now, for a cue's start spot or walk-to spot (world metres, 2 decimals). */
    pickSpot: () => new Promise<{ x: number; z: number } | null>((resolve) => {
      const box = container.current;
      if (!box || !runtime.current) { resolve(null); return; }
      report('Click the ground in the world for this spot (Esc cancels).');
      const done = (spot: { x: number; z: number } | null) => {
        box.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); box.style.cursor = ''; resolve(spot);
      };
      const down = (event: PointerEvent) => {
        event.preventDefault(); event.stopPropagation();
        const p = runtime.current?.groundAt(event.clientX, event.clientY);
        if (!p) report('No ground there; the spot was not changed.');
        done(p ? { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 } : null);
      };
      const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); report('Spot picking cancelled.'); done(null); } };
      box.style.cursor = 'crosshair'; box.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    }),
    avatarSpot: () => { const p = runtime.current?.localPlayer; return p ? { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 } : null; }, isBusy: () => localBusy.current || remoteBusy.current,
    disconnect: () => { cleanup.current?.(); cleanup.current = null; remember(false); report('MCP disconnected.'); },
    load: () => { try { const saved = localStorage.getItem(`genvr-film-${place}`);
      if (saved) apply(JSON.parse(saved)); else report('No saved camera for this world.');
    } catch { report('Saved camera unavailable.'); } } };
}
export type StudioFilming = ReturnType<typeof useStudioFilming>;
