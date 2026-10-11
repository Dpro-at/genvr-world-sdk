'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { CommandPayload } from '@genvr/contracts';
import { Eye, Hammer, Search, Undo2 } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../lib/api';
import { MAP_BUILD_CHANGED } from '../lib/map-build';

/**
 * Real place tool (plan docs/superpowers/plans/2026-10-06-real-place.md, R1): a free map, a square frame in the
 * middle of it, search, and a preview of the real ground. Turning the map turns the frame: the map's up becomes the
 * place's north. `onBuild` gets the plan's commands; the studio applies them as one undo step.
 */

export interface RealArea {
  center: { lat: number; lon: number };
  side: number;
  rotation: number;
  scale: number;
}

interface Match {
  name: string;
  label: string;
  kind: string;
  center: { lat: number; lon: number };
  bounds?: [number, number, number, number];
}

interface Preview {
  ground: { lowest: number; highest: number; grid: number; heights: Array<number | null>; detail: number };
  credits: Array<{ id: string; text: string; url: string }>;
}

export interface RealPlan {
  commands: CommandPayload[];
  stats: {
    ground: { cols: number; rows: number; lowest: number; highest: number; fitted: boolean; missing: number } | null;
    water: { lakes: number; rivers: number; skipped: number } | null;
    roads: { built: number; skipped: number } | null;
    buildings: { built: number; skipped: number; capped: number } | null;
    nature: { areas: number; plants: number; capped: number } | null;
    carried: number;
    refused: Array<{ type: string; reason: string }>;
  };
  credits: Array<{ id: string; text: string; url: string }>;
}

/** One square of a whole town (R3): where it lands in the place and how far it got. */
interface TownSquare {
  x: number;
  z: number;
  state: 'todo' | 'done' | 'failed';
  tries: number;
}

/** A whole town built square by square (R3), kept in this browser so it can be paused and continued. */
interface TownJob {
  name: string;
  center: { lat: number; lon: number };
  at: { x: number; z: number };
  datum: { elevation: number; height: number };
  vertical: number;
  layers: Layers;
  squares: TownSquare[];
  /** Squares across and down, for the progress picture. */
  cols: number;
  rows: number;
}

/** Side of one town square, metres: what one map request and one build step can carry (R3). */
const TOWN_SQUARE = 500;
/** Tries per square before it is marked failed and the town moves on; the wait grows each time. */
const TOWN_TRIES = 5;
const TOWN_RETRY_MS = 20_000;
/** Place height range (MIN_HEIGHT..MAX_HEIGHT) a whole town must fit, with a little room. */
const TOWN_HEIGHTS = { low: -140, room: 580 };

const townKey = (placeId: string) => `genvr.realTown.${placeId}`;
const loadTown = (placeId: string | undefined): TownJob | null => {
  if (!placeId) return null;
  try {
    const raw = window.localStorage.getItem(townKey(placeId));
    return raw ? (JSON.parse(raw) as TownJob) : null;
  } catch {
    return null;
  }
};
const saveTown = (placeId: string, job: TownJob | null) => {
  try {
    if (job) window.localStorage.setItem(townKey(placeId), JSON.stringify(job));
    else window.localStorage.removeItem(townKey(placeId));
  } catch {
    // Private windows may refuse storage: the town still builds, it just cannot be continued after a reload.
  }
};

/** Map degrees of a place point, north up (the same local tangent plane as @genvr/geo createFrame). */
function placeToGeo(center: { lat: number; lon: number }, at: { x: number; z: number }, x: number, z: number) {
  const A = 6378137;
  const E2 = 6.69437999014e-3;
  const RAD = Math.PI / 180;
  const sinLat = Math.sin(center.lat * RAD);
  const w = 1 - E2 * sinLat * sinLat;
  const northPerDegree = ((A * (1 - E2)) / (w * Math.sqrt(w))) * RAD;
  const eastPerDegree = (A / Math.sqrt(w)) * Math.cos(center.lat * RAD) * RAD;
  return { lat: center.lat - (z - at.z) / northPerDegree, lon: center.lon + (x - at.x) / eastPerDegree };
}

/** Metres a town's bounds [south, north, west, east] span (east-west, north-south). */
function boundsSize(bounds: [number, number, number, number]) {
  const [south, north, west, east] = bounds;
  const mid = ((south + north) / 2) * (Math.PI / 180);
  return { width: (east - west) * 111_320 * Math.cos(mid), height: (north - south) * 110_574 };
}

/** Free base map that allows use in apps (the openstreetmap.org tile servers do not). */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SIDES = [100, 200, 300, 500, 1000, 2000, 4000, 8000];
const LAYERS = [
  ['ground', 'Hills'],
  ['roads', 'Streets'],
  ['paths', 'Footpaths'],
  ['water', 'Water'],
  ['buildings', 'Buildings'],
  ['nature', 'Trees and parks'],
] as const;
type Layers = Record<(typeof LAYERS)[number][0], boolean>;

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(json.message ?? `Request failed (${response.status}).`);
  return json;
}

/** How far a build got, for the panel (REAL-06). `stage` is a short line such as "Building streets". */
export interface BuildProgress {
  signal: AbortSignal;
  report(done: number, total: number, stage: string): void;
}

/** The words for a build step, by the kind of command being applied (REAL-06). */
export function buildStage(type: string): string {
  if (type === 'set_heights' || type === 'paint_terrain') return 'Shaping the ground';
  if (type === 'add_water' || type === 'draw_river') return 'Filling the water';
  if (type === 'add_paving') return 'Paving the squares';
  if (type === 'draw_road') return 'Building the streets';
  if (type === 'draw_wall') return 'Building the houses';
  if (type === 'place_item') return 'Planting the trees';
  return 'Finishing';
}

/** Place metres the frame covers on screen per CSS pixel (MapLibre uses 512 px tiles). */
function metresPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export function RealPlacePanel({
  placeId,
  placeSide = 500,
  at = { x: 0, z: 0 },
  onBuild,
  onUndoBuild,
}: {
  /** Without a place the panel only searches and previews. */
  placeId?: string;
  placeSide?: number;
  at?: { x: number; z: number };
  /**
   * Applies the plan. With `progress` (REAL-06) it reports how far it got and stops, taking back what it applied,
   * once `progress.signal` is aborted (the panel's Cancel).
   */
  onBuild?: (plan: RealPlan, area: RealArea, progress?: BuildProgress) => void | Promise<void>;
  /** Takes the last build back (one undo step); returns why it cannot, or null when it did. */
  onUndoBuild?: () => string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [view, setView] = useState({ lat: 52.52, lon: 13.405, zoom: 14, bearing: 0 });
  const [side, setSide] = useState(Math.min(500, placeSide));
  const [gameSize, setGameSize] = useState(false);
  const [layers, setLayers] = useState<Layers>({
    ground: true,
    roads: true,
    paths: true,
    water: true,
    buildings: true,
    nature: true,
  });
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'search' | 'preview' | 'build' | null>(null);
  // True right after a build, so it can be taken back from here.
  const [built, setBuilt] = useState(false);
  // Seconds since Build was pressed: the map servers can take a while for a big area.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (busy !== 'build') return;
    setWaited(0);
    const timer = window.setInterval(() => setWaited((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const [message, setMessage] = useState<string | null>(null);
  // What a running build is doing (REAL-06): "Loading the map", then each build stage with its count.
  const [stage, setStage] = useState<{ text: string; done?: number; total?: number } | null>(null);
  const buildAbort = useRef<AbortController | null>(null);
  // The last picked search result with bounds: offered as a whole town (R3).
  const [townMatch, setTownMatch] = useState<Match | null>(null);
  const [town, setTown] = useState<TownJob | null>(null);
  const [townRunning, setTownRunning] = useState(false);
  const townStop = useRef(false);
  useEffect(() => setTown(loadTown(placeId)), [placeId]);
  // A smaller place keeps the map where it is; only the frame shrinks to fit.
  useEffect(() => setSide((s) => Math.min(s, placeSide)), [placeSide]);
  const scale = gameSize ? 1.5 : 1;
  const area: RealArea = {
    center: { lat: view.lat, lon: view.lon },
    side,
    rotation: Math.round(view.bearing * 10) / 10,
    scale,
  };

  useEffect(() => {
    let cancelled = false;
    void import('maplibre-gl').then(({ Map }) => {
      if (cancelled || !container.current) return;
      const instance = new Map({
        container: container.current,
        style: MAP_STYLE,
        center: [view.lon, view.lat],
        zoom: view.zoom,
        attributionControl: { compact: true },
      });
      const sync = () => {
        const c = instance.getCenter();
        setView({ lat: c.lat, lon: c.lng, zoom: instance.getZoom(), bearing: instance.getBearing() });
      };
      instance.on('move', sync);
      map.current = instance;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is made once; later view changes come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The frame is the area's real size on screen (smaller in game size: the same place metres cover less ground).
  const framePixels = Math.round(side / scale / metresPerPixel(view.lat, view.zoom));

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setBusy('search');
    setMessage(null);
    try {
      const { matches: found } = await call<{ matches: Match[] }>(
        `/v1/real-place/search?q=${encodeURIComponent(query.trim())}`,
      );
      setMatches(found);
      if (!found.length) setMessage('Nothing found. Try a town, a district or a landmark.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }, [query]);

  // The frame takes the chosen place at once, and the map jumps there: with a flight the frame only followed the
  // map's move events, so a map that did not animate (a tab in the background) or a Build pressed mid-flight built
  // the old or a passing spot (a Perchtoldsdorf search built Berlin, R2j).
  const go = (match: Match) => {
    setMatches([]);
    setPreview(null);
    setBuilt(false);
    setTownMatch(match.bounds ? match : null);
    setView((current) => ({ ...current, lat: match.center.lat, lon: match.center.lon, zoom: 15 }));
    map.current?.jumpTo({ center: [match.center.lon, match.center.lat], zoom: 15 });
  };

  const showPreview = async () => {
    setBusy('preview');
    setMessage(null);
    try {
      setPreview(await call<Preview>('/v1/real-place/preview', area));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    if (!placeId) return;
    const cancel = new AbortController();
    buildAbort.current = cancel;
    setBusy('build');
    setMessage(null);
    setStage({ text: 'Loading the map' });
    try {
      const plan = await call<RealPlan>(
        `/v1/experiences/${encodeURIComponent(placeId)}/real-place/plan`,
        { ...area, at, layers: { ...layers, paths: layers.roads && layers.paths } },
        cancel.signal,
      );
      await onBuild?.(plan, area, {
        signal: cancel.signal,
        report: (done, total, text) => setStage({ text, done, total }),
      });
      setBuilt(plan.commands.length > 0);
      const { ground, roads, water, buildings, nature, refused } = plan.stats;
      const parts = [
        ground && `hills${ground.fitted ? ' (lowered to fit the place)' : ''}`,
        roads && `${roads.built} streets and paths`,
        water && `${water.lakes} lakes and ${water.rivers} rivers`,
        buildings && `${buildings.built} buildings${buildings.capped ? ` (${buildings.capped} cut to 300 m)` : ''}`,
        nature && `${nature.areas} parks and fields, ${nature.plants} trees and bushes`,
      ].filter(Boolean);
      const left = (roads?.skipped ?? 0) + (water?.skipped ?? 0) + (buildings?.skipped ?? 0) + refused.length;
      setMessage(
        parts.length
          ? `Built ${parts.join(', ')}.${left ? ` ${left} pieces could not be built.` : ''}`
          : 'Nothing to build.',
      );
    } catch (error) {
      // A cancelled or failed build was taken back; an earlier build stays undoable from here.
      const reason = (error as Error).message;
      if (cancel.signal.aborted && reason !== MAP_BUILD_CHANGED) setMessage('Build cancelled. Nothing was changed.');
      else setMessage(reason);
    } finally {
      buildAbort.current = null;
      setStage(null);
      setBusy(null);
    }
  };

  /** Plans the squares of the picked town and its shared height reference, then starts building them (R3). */
  const startTown = async () => {
    if (!placeId || !townMatch?.bounds) return;
    setMessage(null);
    setBusy('preview');
    try {
      const { width, height } = boundsSize(townMatch.bounds);
      const [south, north, west, east] = townMatch.bounds;
      const center = { lat: (south + north) / 2, lon: (west + east) / 2 };
      // The whole town's height range, once, so every square uses the same reference and fits the place.
      const span = Math.min(8000, Math.max(200, Math.ceil(Math.max(width, height))));
      const range = await call<Preview>('/v1/real-place/preview', { center, side: span, rotation: 0, scale: 1 });
      const relief = Math.max(1, range.ground.highest - range.ground.lowest);
      const vertical = Math.min(1, TOWN_HEIGHTS.room / relief);
      const datum = { elevation: range.ground.lowest, height: relief * vertical <= 430 ? 0 : TOWN_HEIGHTS.low };
      const cols = Math.max(1, Math.ceil(width / TOWN_SQUARE));
      const rows = Math.max(1, Math.ceil(height / TOWN_SQUARE));
      const half = placeSide / 2;
      const squares: TownSquare[] = [];
      for (let j = 0; j < rows; j += 1)
        for (let i = 0; i < cols; i += 1) {
          const x = at.x + (i - (cols - 1) / 2) * TOWN_SQUARE;
          const z = at.z + (j - (rows - 1) / 2) * TOWN_SQUARE;
          // Squares whose middle lies outside the place cannot be built here.
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          squares.push({ x, z, state: 'todo', tries: 0 });
        }
      // From the middle outwards, so the town grows from its centre.
      squares.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
      const job: TownJob = {
        name: townMatch.name,
        center,
        at,
        datum,
        vertical,
        layers: { ...layers, paths: layers.roads && layers.paths },
        squares,
        cols,
        rows,
      };
      saveTown(placeId, job);
      setTown(job);
      const missing = cols * rows - squares.length;
      if (missing)
        setMessage(
          `${townMatch.name} is ${(width / 1000).toFixed(1)} x ${(height / 1000).toFixed(1)} km and this place is ${(placeSide / 1000).toFixed(1)} km: ${missing} of ${cols * rows} squares do not fit. Make the place bigger in Place settings to build all of it.`,
        );
      setBusy(null);
      void runTown(job);
    } catch (error) {
      setBusy(null);
      setMessage((error as Error).message);
    }
  };

  /** Builds the town's squares one after another until all are done or it is paused; each square is one undo step. */
  const runTown = async (start: TownJob) => {
    if (!placeId || townRunning) return;
    townStop.current = false;
    setTownRunning(true);
    let job = start;
    const update = (next: TownJob) => {
      job = next;
      saveTown(placeId, next);
      setTown(next);
    };
    try {
      for (;;) {
        if (townStop.current) break;
        const index = job.squares.findIndex((square) => square.state === 'todo');
        if (index < 0) break;
        const square = job.squares[index]!;
        const area: RealArea = { center: placeToGeo(job.center, job.at, square.x, square.z), side: TOWN_SQUARE, rotation: 0, scale: 1 };
        try {
          const plan = await call<RealPlan>(`/v1/experiences/${encodeURIComponent(placeId)}/real-place/plan`, {
            ...area,
            at: { x: square.x, z: square.z },
            layers: job.layers,
            vertical: job.vertical,
            town: { datum: job.datum },
          });
          await onBuild?.(plan, area);
          update({ ...job, squares: job.squares.map((s, i) => (i === index ? { ...s, state: 'done' } : s)) });
        } catch (error) {
          // The free map servers are often busy: wait a little longer each time, then try the square again.
          const tries = square.tries + 1;
          const failed = tries >= TOWN_TRIES;
          update({
            ...job,
            squares: job.squares.map((s, i) => (i === index ? { ...s, tries, state: failed ? 'failed' : 'todo' } : s)),
          });
          setMessage(
            failed
              ? `One square of ${job.name} could not be built after ${TOWN_TRIES} tries; going on with the others.`
              : `The map servers are busy (${(error as Error).message}); trying again in ${(TOWN_RETRY_MS * tries) / 1000} s.`,
          );
          if (!failed) {
            const until = Date.now() + TOWN_RETRY_MS * tries;
            while (Date.now() < until && !townStop.current) await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    } finally {
      setTownRunning(false);
    }
    const done = job.squares.filter((s) => s.state === 'done').length;
    if (!townStop.current && job.squares.every((s) => s.state !== 'todo'))
      setMessage(`${job.name} is built: ${done} of ${job.squares.length} squares.`);
  };

  const undoBuild = () => {
    const problem = onUndoBuild?.() ?? null;
    setBuilt(false);
    setMessage(problem ?? 'The build was taken back; the place is as it was before.');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Town, district or landmark"
          aria-label="Search a real place"
          className="min-w-0 flex-1 rounded-xl bg-paper px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-xl bg-ink px-3 py-2 text-sm font-bold text-on-brand disabled:opacity-50"
        >
          <Search className="size-4" aria-hidden />
          Find
        </button>
      </form>
      {matches.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-xl bg-paper text-sm">
          {matches.map((m) => (
            <li key={`${m.kind}-${m.center.lat}-${m.center.lon}`}>
              <button type="button" onClick={() => go(m)} className="w-full px-3 py-1.5 text-left hover:bg-surface">
                <span className="font-bold text-ink">{m.name}</span>
                <span className="block truncate text-xs text-ink/60">{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative min-h-64 flex-1 overflow-hidden rounded-2xl">
        {/* Inline: MapLibre's own .maplibregl-map rule sets position: relative. */}
        <div ref={container} style={{ position: 'absolute', inset: 0 }} />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] outline-2 outline-black/60"
          style={{ width: framePixels, height: framePixels }}
        >
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-white drop-shadow">
            N
          </span>
        </div>
      </div>
      <p className="text-xs text-ink/70">Move the map under the frame. Turn it with two fingers or right-drag.</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-sm text-ink">
          Size
          <select
            value={side}
            onChange={(event) => {
              setSide(Number(event.target.value));
              setPreview(null);
            }}
            className="rounded-lg bg-paper px-2 py-1"
          >
            {SIDES.filter((s) => s <= placeSide).map((s) => (
              <option key={s} value={s}>
                {s >= 1000 ? `${s / 1000} km` : `${s} m`}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Size in the game" className="flex gap-1 rounded-xl bg-paper p-1 text-xs">
          {(
            [
              [false, 'Real size'],
              [true, 'Bigger for play'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={gameSize === value}
              onClick={() => {
                setGameSize(value);
                setPreview(null);
              }}
              className={`rounded-lg px-2 py-1 font-bold ${gameSize === value ? 'bg-ink text-on-brand' : 'text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="What to build" className="flex flex-wrap gap-1 text-xs">
        {LAYERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={layers[id]}
            disabled={id === 'paths' && !layers.roads}
            onClick={() => setLayers((current) => ({ ...current, [id]: !current[id] }))}
            className={`rounded-lg px-2 py-1 font-bold disabled:opacity-40 ${layers[id] ? 'bg-ink text-on-brand' : 'bg-paper text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void showPreview()}
          disabled={busy !== null}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-paper px-3 py-2 text-sm font-bold text-ink disabled:opacity-50"
        >
          <Eye className="size-4" aria-hidden />
          {busy === 'preview' ? 'Looking...' : 'Preview'}
        </button>
        {placeId && (
          <button
            type="button"
            onClick={() => void build()}
            disabled={busy !== null}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-ink px-3 py-2 text-sm font-bold text-on-brand disabled:opacity-50"
          >
            <Hammer className="size-4" aria-hidden />
            {busy === 'build' ? 'Building...' : 'Build here'}
          </button>
        )}
      </div>

      {preview && <GroundPreview preview={preview} />}
      {busy === 'build' && (
        <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3">
          <div className="flex items-center gap-2">
            <p role="status" className="flex-1 text-sm text-ink">
              {stage?.text ?? 'Loading the map'}
              {stage?.total ? ` (${stage.done ?? 0} of ${stage.total})` : '...'} {waited} s
              {!stage?.total && waited >= 10 ? ' (big areas and busy map servers can take up to a minute)' : ''}
            </p>
            <button
              type="button"
              onClick={() => buildAbort.current?.abort()}
              className="rounded-xl bg-ink/10 px-3 py-1.5 text-sm font-bold text-ink hover:bg-ink/15"
            >
              Cancel
            </button>
          </div>
          {/* How far the build is: a moving bar while the map loads, then the share of pieces applied. */}
          <div
            role="progressbar"
            aria-label="Build progress"
            aria-valuemin={0}
            aria-valuemax={stage?.total ?? undefined}
            aria-valuenow={stage?.total ? (stage.done ?? 0) : undefined}
            className="h-1.5 overflow-hidden rounded-full bg-ink/10"
          >
            <div
              className={`h-full rounded-full bg-ink transition-[width] duration-300 ${stage?.total ? '' : 'w-1/3 animate-pulse'}`}
              style={stage?.total ? { width: `${Math.max(4, Math.round(((stage.done ?? 0) / stage.total) * 100))}%` } : undefined}
            />
          </div>
        </div>
      )}
      {townMatch?.bounds && !town && (
        <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3 text-sm text-ink">
          <p>
            Build all of <span className="font-bold">{townMatch.name}</span>, square by square (
            {(boundsSize(townMatch.bounds).width / 1000).toFixed(1)} x {(boundsSize(townMatch.bounds).height / 1000).toFixed(1)} km,
            squares of {TOWN_SQUARE} m). It keeps going until the town is done and can be paused.
          </p>
          <button
            type="button"
            onClick={() => void startTown()}
            disabled={!placeId || busy !== null}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-ink px-3 py-2 text-sm font-bold text-on-brand disabled:opacity-50"
          >
            <Hammer className="size-4" aria-hidden />
            Build the whole town
          </button>
        </div>
      )}
      {town && (
        <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3 text-sm text-ink" aria-label="Whole town">
          <p>
            <span className="font-bold">{town.name}</span>:{' '}
            {town.squares.filter((s) => s.state === 'done').length} of {town.squares.length} squares built
            {town.squares.some((s) => s.state === 'failed') ? `, ${town.squares.filter((s) => s.state === 'failed').length} failed` : ''}
            {townRunning ? '...' : '.'}
          </p>
          <div
            className="grid gap-px self-start"
            style={{ gridTemplateColumns: `repeat(${town.cols}, 0.6rem)` }}
            aria-hidden
          >
            {Array.from({ length: town.cols * town.rows }, (_, k) => {
              const x = town.at.x + ((k % town.cols) - (town.cols - 1) / 2) * TOWN_SQUARE;
              const z = town.at.z + (Math.floor(k / town.cols) - (town.rows - 1) / 2) * TOWN_SQUARE;
              const square = town.squares.find((s) => s.x === x && s.z === z);
              const tone = !square ? 'bg-transparent' : square.state === 'done' ? 'bg-ink' : square.state === 'failed' ? 'bg-ink/30' : 'bg-ink/10';
              return <span key={k} className={`size-[0.6rem] rounded-[2px] ${tone}`} />;
            })}
          </div>
          <div className="flex gap-2">
            {townRunning ? (
              <button
                type="button"
                onClick={() => {
                  townStop.current = true;
                }}
                className="flex-1 rounded-2xl bg-surface px-3 py-2 text-sm font-bold text-ink"
              >
                Pause
              </button>
            ) : town.squares.some((s) => s.state === 'todo') ? (
              <button
                type="button"
                onClick={() => void runTown(town)}
                disabled={busy !== null}
                className="flex-1 rounded-2xl bg-ink px-3 py-2 text-sm font-bold text-on-brand disabled:opacity-50"
              >
                Continue
              </button>
            ) : null}
            {!townRunning && (
              <button
                type="button"
                onClick={() => {
                  if (placeId) saveTown(placeId, null);
                  setTown(null);
                }}
                className="rounded-2xl bg-surface px-3 py-2 text-sm font-bold text-ink"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
      {message && <p className="text-sm text-ink">{message}</p>}
      {built && onUndoBuild && busy === null && (
        <button
          type="button"
          onClick={undoBuild}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-paper px-3 py-2 text-sm font-bold text-ink"
        >
          <Undo2 className="size-4" aria-hidden />
          Undo this build
        </button>
      )}
      <p className="text-[11px] text-ink/60">
        Map © OpenStreetMap contributors, OpenFreeMap. Elevation: Terrain Tiles (AWS Open Data).
      </p>
    </div>
  );
}

function GroundPreview({ preview }: { preview: Preview }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { grid, heights, lowest, highest, detail } = preview.ground;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const image = context.createImageData(grid, grid);
    const range = Math.max(1, highest - lowest);
    heights.forEach((h, i) => {
      const v = h === null ? 0 : Math.round(40 + ((h - lowest) / range) * 215);
      image.data.set(h === null ? [200, 0, 0, 255] : [v, v, v, 255], i * 4);
    });
    context.putImageData(image, 0, 0);
  }, [grid, heights, lowest, highest]);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-paper p-2 text-sm text-ink">
      <canvas
        ref={canvas}
        width={grid}
        height={grid}
        className="size-20 rounded [image-rendering:pixelated]"
        aria-label="Height picture of the area, light is high"
      />
      <div>
        <p className="font-bold">
          Ground {Math.round(lowest)} to {Math.round(highest)} m
        </p>
        <p className="text-xs text-ink/70">
          Hills of {Math.round(highest - lowest)} m; detail about {detail} m.
        </p>
      </div>
    </div>
  );
}
