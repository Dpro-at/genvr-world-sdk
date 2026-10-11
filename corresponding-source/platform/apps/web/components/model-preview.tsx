'use client';

import type { ItemFacts, ItemViewer } from '@genvr/runtime';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Id the local preview uses (never stored). */
const PREVIEW_ID = 'preview.local-model';

/** Items larger than this on a side are probably not in meters (e.g. made in centimeters). */
const HUGE = 50;
/** ...and smaller than this probably in kilometers or scaled down by mistake. */
const TINY = 0.05;

/**
 * A 3D look at a model file before it is sent (P4-10): the reviewers' item viewer with the local
 * file, drag to turn and scroll to zoom, with its size in meters and triangles, so a model in the
 * wrong units is caught before review. A chosen sound can be heard with each loop of the
 * animation, the way it plays in worlds.
 */
export function ModelPreview({
  file,
  sound,
  onMoves,
}: {
  file: File;
  /** A sound chosen for the model (plays each time its animation starts again). */
  sound?: File | null;
  /** Tells whether the model has an animation (only moving models can have a sound). */
  onMoves?: (moves: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<ItemViewer | null>(null);
  const [facts, setFacts] = useState<ItemFacts | null>(null);
  const [failed, setFailed] = useState(false);
  const [hearing, setHearing] = useState(false);
  const movesRef = useRef(onMoves);
  movesRef.current = onMoves;

  useEffect(() => {
    let cancelled = false;
    let viewer: ItemViewer | null = null;
    const url = URL.createObjectURL(file);
    setFacts(null);
    setFailed(false);
    setViewer(null);
    void (async () => {
      const { createItemViewer } = await import('@genvr/runtime');
      if (cancelled || !container.current) return;
      try {
        viewer = await createItemViewer({
          container: container.current,
          itemId: PREVIEW_ID,
          background: getComputedStyle(document.body).backgroundColor,
          viewCube: false,
          // The viewer loads packages; this one is the local file only.
          fetchPackage: async () =>
            ({
              id: PREVIEW_ID,
              manifest: { id: PREVIEW_ID, name: file.name, entry: { model: 'model.glb' }, audio: {} },
              files: [{ path: 'model.glb', url, size: file.size, contentType: 'model/gltf-binary' }],
            }) as never,
        });
        if (cancelled) return viewer.dispose();
        if (!viewer.facts) setFailed(true);
        setFacts(viewer.facts);
        setViewer(viewer);
        movesRef.current?.(viewer.animations.length > 0);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      viewer?.dispose();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // The sound plays in time with the movement, as in worlds (a bounce per loop).
  useEffect(() => {
    if (!viewer || !sound || !hearing) return;
    const url = URL.createObjectURL(sound);
    const player = new Audio(url);
    const replay = () => {
      player.currentTime = 0;
      void player.play().catch(() => undefined);
    };
    const stop = viewer.onAnimationLoop(replay);
    return () => {
      stop();
      player.pause();
      URL.revokeObjectURL(url);
    };
  }, [viewer, sound, hearing]);
  useEffect(() => setHearing(false), [sound]);

  const largest = facts ? Math.max(...facts.size) : 0;
  const meters = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 100) / 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* The canvas is out of the flow so the preview can shrink with the page (phones). */}
        <div
          ref={container}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-paper ring-1 ring-ink/10 [&>canvas]:absolute [&>canvas]:inset-0"
          role="img"
          aria-label="3D preview of the model: drag to turn, scroll to zoom"
        />
        {sound && viewer && viewer.animations.length > 0 ? (
          <button
            type="button"
            aria-pressed={hearing}
            onClick={() => setHearing((on) => !on)}
            title={hearing ? 'Turn the sound off' : 'Hear the sound with the animation'}
            aria-label={hearing ? 'Turn the sound off' : 'Hear the sound with the animation'}
            className="absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-surface/90 text-ink ring-1 ring-ink/10 hover:bg-surface"
          >
            {hearing ? (
              <Volume2 className="size-4" aria-hidden />
            ) : (
              <VolumeX className="size-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      {failed ? (
        <p className="text-sm font-semibold text-coral">
          This file cannot be shown. Is it a glTF binary (.glb)?
        </p>
      ) : facts ? (
        <>
          <p className="text-xs text-ink/60">
            {meters(facts.size[0])} x {meters(facts.size[1])} x {meters(facts.size[2])} m ·{' '}
            {facts.triangles.toLocaleString('en')} triangles
          </p>
          {largest > HUGE || largest < TINY ? (
            <p className="rounded-xl bg-sun/25 px-3 py-2 text-xs font-semibold text-ink/80">
              {largest > HUGE
                ? `It is ${Math.round(largest)} m across. Models are measured in meters; was it made in centimeters?`
                : 'It is very small. Models are measured in meters; check its scale.'}
            </p>
          ) : null}
        </>
      ) : (
        <p className="animate-pulse text-xs text-ink/50">Loading the preview…</p>
      )}
    </div>
  );
}
