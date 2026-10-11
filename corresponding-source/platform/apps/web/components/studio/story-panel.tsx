'use client';

import { SIZE_TIERS, type PlaceStory, type StoryStop } from '@genvr/contracts';
import { sampleFilmPath, type GenvrRuntime, type ToolStatus } from '@genvr/runtime';
import { ArrowDown, ArrowUp, Camera, ExternalLink, Eye, Pause, Play, Trash2 } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { cameraFromView, storyPath } from '../../lib/story';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { useStudioHost } from '../../lib/studio-host';

const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-paper px-3 py-2 text-sm font-bold hover:bg-ink/10 disabled:opacity-40';
const ICON_BUTTON = 'rounded p-1.5 text-ink/70 hover:bg-ink/10 disabled:opacity-30';
const FIELD = 'w-full rounded bg-paper px-2 py-1.5 text-sm text-ink';
const SIDES: StoryStop['side'][] = ['left', 'center', 'right'];
/** Story time per second while the preview plays (one stop every two seconds). */
const PLAY_SPEED = 0.5;

type Drag = { index: number; part: 'position' | 'target' };

/**
 * The place's scroll story (SCROLL-02): stops made from the studio camera, moved on a map seen
 * from above, words for each stop, and a preview of the flight. Every change is one undo step;
 * the assistant's `set_story` tool edits the same story.
 */
export function StoryPanel({
  runtime,
  status,
  placeId,
  filming,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  placeId: string;
  filming: StudioFilming;
}) {
  const host = useStudioHost();
  const world = runtime.current?.world;
  const saved = world?.story;
  const savedKey = JSON.stringify(saved ?? null);
  const [draft, setDraft] = useState<PlaceStory>(() => saved ?? { stops: [] });
  const [selected, setSelected] = useState(0);
  const [time, setTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const drag = useRef<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  // Undo, redo and the assistant change the stored story: show what is stored.
  useEffect(() => {
    if (!drag.current) setDraft(saved ?? { stops: [] });
  }, [savedKey, status]);
  // The camera goes back to the studio when the panel closes.
  useEffect(() => () => filming.previewStory(null), [filming]);

  const stops = draft.stops;
  const path = useMemo(() => storyPath(stops), [stops]);

  const commit = (next: PlaceStory) => {
    setDraft(next);
    const story = next.stops.length === 0 && !next.title ? null : next;
    if (JSON.stringify(story) === JSON.stringify(saved ?? null)) return;
    const ok = runtime.current?.applyCommand({ type: 'set_story', params: { story } });
    if (!ok) setMessage('The story could not be saved.');
  };
  const changeStop = (index: number, change: Partial<StoryStop>, save = true) => {
    const next = { ...draft, stops: stops.map((stop, i) => (i === index ? { ...stop, ...change } : stop)) };
    if (save) commit(next);
    else setDraft(next);
  };

  const show = (at: number | null, cut = true) => {
    setTime(at);
    filming.previewStory(at === null || stops.length === 0 ? null : path, at ?? 0, cut);
  };
  // Playing walks the flight from where the slider is to the last stop.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let at = time ?? 0;
    const tick = (now: number) => {
      at = Math.min(stops.length - 1, at + ((now - last) / 1000) * PLAY_SPEED);
      last = now;
      setTime(at);
      filming.previewStory(path, at, false);
      if (at >= stops.length - 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const fromCamera = () => {
    filming.previewStory(null);
    setTime(null);
    const view = filming.cameraView();
    if (!view) {
      setMessage('The camera is not ready yet.');
      return null;
    }
    return cameraFromView(view);
  };
  const addStop = () => {
    const camera = fromCamera();
    if (!camera) return;
    if (stops.length >= 32) return setMessage('A story holds at most 32 stops.');
    const at = Math.min(stops.length, selected + 1);
    const stop: StoryStop = {
      camera,
      title: `Stop ${stops.length + 1}`,
      side: stops.length % 2 ? 'right' : 'left',
    };
    commit({ ...draft, stops: [...stops.slice(0, at), stop, ...stops.slice(at)] });
    setSelected(at);
    setMessage('Stop added from the camera. Fly on and add the next one.');
  };
  const useView = (index: number) => {
    const camera = fromCamera();
    if (camera) changeStop(index, { camera: { ...camera, ease: stops[index]!.camera.ease } });
  };
  const moveStop = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= stops.length) return;
    const next = [...stops];
    [next[index], next[to]] = [next[to]!, next[index]!];
    commit({ ...draft, stops: next });
    setSelected(to);
  };
  const removeStop = (index: number) => {
    commit({ ...draft, stops: stops.filter((_, i) => i !== index) });
    setSelected(Math.max(0, Math.min(selected, stops.length - 2)));
  };

  // The map seen from above: the place's square, its items, and every stop's camera and target. It
  // frames what is built and the saved stops (not the one being dragged, so it holds still meanwhile).
  const half = world ? SIZE_TIERS[world.sizeTier].sideMeters / 2 : 250;
  const frame = useMemo(() => {
    const points = [
      ...(world?.instances ?? []).map(
        (item) => [item.transform.position[0], item.transform.position[2]] as const,
      ),
      ...(saved?.stops ?? [])
        .flatMap((stop) => [stop.camera.position, stop.camera.target])
        .map(([x, , z]) => [x, z] as const),
    ];
    if (points.length === 0) return { x: -half, z: -half, size: half * 2 };
    const xs = points.map(([x]) => x);
    const zs = points.map(([, z]) => z);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const size = Math.max(80, maxX - minX, maxZ - minZ) * 1.2;
    return { x: (minX + maxX) / 2 - size / 2, z: (minZ + maxZ) / 2 - size / 2, size };
  }, [world?.instances, savedKey, half]);
  const curve = useMemo(() => {
    if (path.length < 2) return '';
    const points: string[] = [];
    for (let t = 0; t <= path.length - 1 + 1e-6; t += 0.05) {
      const { position } = sampleFilmPath(path, t);
      points.push(`${position.x.toFixed(1)},${position.z.toFixed(1)}`);
    }
    return points.join(' ');
  }, [path]);
  const items = (world?.instances ?? []).slice(0, 2000);
  const toWorld = (event: ReactPointerEvent) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.round(point.x * 10) / 10, z: Math.round(point.y * 10) / 10 };
  };
  const onMove = (event: ReactPointerEvent) => {
    const current = drag.current;
    const at = current && toWorld(event);
    if (!current || !at) return;
    const stop = stops[current.index]!;
    const [, y] = stop.camera[current.part];
    changeStop(current.index, { camera: { ...stop.camera, [current.part]: [at.x, y, at.z] } }, false);
    if (time !== null) filming.previewStory(storyPath(stops), time, false);
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    commit(draft);
  };
  const dot = 'cursor-grab touch-none';
  const scale = frame.size / 170;

  const stop = stops[selected];
  return (
    <div className="space-y-3 px-3 pb-3 text-ink" data-status={status.tool ?? ''}>
      <p className="text-xs text-ink/60">
        Tell this place as a scroll page: fly the camera, add a stop, and write what visitors read there.
      </p>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        Story name
        <input
          className={FIELD}
          value={draft.title ?? ''}
          maxLength={120}
          placeholder="Name of the page"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          onBlur={() => commit({ ...draft, title: draft.title?.trim() || undefined })}
        />
      </label>
      <button className={`${BUTTON} w-full`} onClick={addStop}>
        <Camera className="size-4" aria-hidden /> Add stop from camera
      </button>

      <svg
        ref={svg}
        viewBox={`${frame.x} ${frame.z} ${frame.size} ${frame.size}`}
        className="aspect-square w-full rounded-lg bg-paper"
        role="img"
        aria-label="Story map seen from above"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <rect
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={scale}
        />
        {items.map((item) => (
          <circle
            key={item.instanceId}
            cx={item.transform.position[0]}
            cy={item.transform.position[2]}
            r={scale * 0.9}
            fill="currentColor"
            fillOpacity={0.25}
          />
        ))}
        {curve && (
          <polyline
            points={curve}
            fill="none"
            stroke="currentColor"
            strokeWidth={scale * 1.2}
            strokeOpacity={0.7}
          />
        )}
        {stops.map((entry, index) => {
          const [px, , pz] = entry.camera.position;
          const [tx, , tz] = entry.camera.target;
          const active = index === selected;
          const start = (part: Drag['part']) => (event: ReactPointerEvent) => {
            event.stopPropagation();
            (event.target as Element).setPointerCapture?.(event.pointerId);
            drag.current = { index, part };
            setSelected(index);
          };
          return (
            <g key={index}>
              <line
                x1={px}
                y1={pz}
                x2={tx}
                y2={tz}
                stroke="currentColor"
                strokeOpacity={0.4}
                strokeWidth={scale * 0.8}
                strokeDasharray={`${scale * 3} ${scale * 2}`}
              />
              <circle
                className={dot}
                cx={tx}
                cy={tz}
                r={scale * 3}
                fill="none"
                stroke="currentColor"
                strokeWidth={scale}
                onPointerDown={start('target')}
              >
                <title>{`Stop ${index + 1}: where it looks`}</title>
              </circle>
              <circle
                className={dot}
                cx={px}
                cy={pz}
                r={scale * (active ? 6.5 : 5)}
                fill="currentColor"
                onPointerDown={start('position')}
              >
                <title>{`Stop ${index + 1}: camera`}</title>
              </circle>
              <text
                x={px}
                y={pz}
                dy={scale * 2.2}
                textAnchor="middle"
                fontSize={scale * 6}
                fontWeight={700}
                className="pointer-events-none fill-paper"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-ink/60">
        Drag a filled dot to move a camera, a ring to change where it looks.
      </p>

      {stops.length >= 2 && (
        <div className="flex items-center gap-2">
          <button
            className={ICON_BUTTON}
            aria-label={playing ? 'Pause the flight' : 'Play the flight'}
            onClick={() => {
              if (!playing && (time === null || time >= stops.length - 1)) show(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
          <input
            type="range"
            aria-label="Story preview"
            min={0}
            max={stops.length - 1}
            step={0.01}
            value={time ?? 0}
            onChange={(event) => {
              setPlaying(false);
              show(Number(event.target.value), false);
            }}
            className="min-w-0 flex-1"
          />
          {time !== null && (
            <button
              className="text-xs font-bold underline"
              onClick={() => {
                setPlaying(false);
                show(null);
              }}
            >
              Done
            </button>
          )}
        </div>
      )}

      <ol className="space-y-1.5">
        {stops.map((entry, index) => (
          <li key={index} className={`rounded-lg ${index === selected ? 'bg-paper' : ''}`}>
            <div className="flex items-center gap-1 px-1.5 py-1">
              <button
                className="min-w-0 flex-1 truncate text-left text-sm font-bold"
                onClick={() => setSelected(index)}
              >
                {index + 1}. {entry.title || 'Untitled'}
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Look from stop ${index + 1}`}
                onClick={() => {
                  setSelected(index);
                  show(index);
                }}
              >
                <Eye className="size-4" aria-hidden />
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Move stop ${index + 1} up`}
                disabled={index === 0}
                onClick={() => moveStop(index, -1)}
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Move stop ${index + 1} down`}
                disabled={index === stops.length - 1}
                onClick={() => moveStop(index, 1)}
              >
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Remove stop ${index + 1}`}
                onClick={() => removeStop(index)}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {stop && (
        <div className="space-y-2 rounded-lg border border-ink/10 p-2">
          <p className="text-xs font-bold text-ink/70">Stop {selected + 1}</p>
          <input
            className={FIELD}
            aria-label="Small line above the title"
            placeholder="Small line above the title"
            maxLength={60}
            value={stop.kicker ?? ''}
            onChange={(event) => changeStop(selected, { kicker: event.target.value }, false)}
            onBlur={() => changeStop(selected, { kicker: stop.kicker?.trim() || undefined })}
          />
          <input
            className={FIELD}
            aria-label="Title"
            placeholder="Title"
            maxLength={120}
            value={stop.title}
            onChange={(event) => changeStop(selected, { title: event.target.value }, false)}
            onBlur={() => changeStop(selected, { title: stop.title.trim() })}
          />
          <textarea
            className={`${FIELD} min-h-16`}
            aria-label="Text"
            placeholder="A sentence or two"
            maxLength={600}
            value={stop.text ?? ''}
            onChange={(event) => changeStop(selected, { text: event.target.value }, false)}
            onBlur={() => changeStop(selected, { text: stop.text?.trim() || undefined })}
          />
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Side of the words">
            {SIDES.map((side) => (
              <button
                key={side}
                aria-pressed={stop.side === side}
                className={`rounded px-2 py-1 text-xs font-bold capitalize ${stop.side === side ? 'bg-ink text-paper' : 'bg-paper hover:bg-ink/10'}`}
                onClick={() => changeStop(selected, { side })}
              >
                {side}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-xs font-bold text-ink/70">
            Height of the camera (m)
            <input
              type="number"
              className={`${FIELD} w-24`}
              step="any"
              value={stop.camera.position[1]}
              onChange={(event) => {
                const [x, , z] = stop.camera.position;
                changeStop(
                  selected,
                  { camera: { ...stop.camera, position: [x, Number(event.target.value), z] } },
                  false,
                );
              }}
              onBlur={() => commit(draft)}
            />
          </label>
          <button className={`${BUTTON} w-full`} onClick={() => useView(selected)}>
            <Camera className="size-4" aria-hidden /> Use the camera view here
          </button>
        </div>
      )}

      {host.platform && (stops.length >= 2 ? (
        <a
          className={`${BUTTON} w-full`}
          href={`/showcase?place=${placeId}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="size-4" aria-hidden /> Open the story page
        </a>
      ) : (
        <p className="text-xs text-ink/60">Add at least two stops to make the page.</p>
      ))}
      {message && (
        <p className="text-xs text-ink/60" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
