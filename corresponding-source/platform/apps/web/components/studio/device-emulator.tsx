'use client';

import { useEffect, useRef, useState } from 'react';
import { screenSize, type DeviceModel, type Orientation } from './devices';

/** `fit` scales the device to the studio viewport; numbers are a fixed zoom. */
export type Zoom = 'fit' | 0.5 | 0.75 | 1;

/**
 * Studio device emulator (P3-06): the real player page runs in a frame with the device's exact
 * screen size (CSS pixels), so layouts, touch controls, and the loading screen look exactly as on
 * that device. Preview mode plays alone (no room, no edits) and uses the saved place; `reloadKey`
 * restarts it after changes. The mouse works like a finger.
 */
export function DeviceEmulator({
  placeId,
  model,
  orientation,
  zoom,
  reloadKey,
  source,
}: {
  placeId: string;
  model: DeviceModel;
  orientation: Orientation;
  zoom: Zoom;
  reloadKey: number;
  source?: string;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSpace((current) =>
        current.width === element.clientWidth && current.height === element.clientHeight
          ? current
          : { width: element.clientWidth, height: element.clientHeight },
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [width, height] = screenSize(model, orientation);
  const outerWidth = width + model.bezel * 2;
  const outerHeight = height + model.bezel * 2;
  const fit = Math.min(1, (space.width - 48) / outerWidth, (space.height - 72) / outerHeight);
  const scale = zoom === 'fit' ? Math.max(0.1, fit) : zoom;
  const src = source ?? `/places/${encodeURIComponent(placeId)}/play?preview=${model.kind}`;

  return (
    <div
      ref={area}
      style={{ gridArea: 'viewport' }}
      className="relative flex min-h-0 min-w-0 items-center justify-center overflow-auto bg-paper"
    >
      <p className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-xs font-bold whitespace-nowrap text-ink/70 shadow">
        {model.name} · {width} × {height} · {Math.round(scale * 100)}%
      </p>
      {space.width > 0 ? (
        // The frame takes its scaled size in the layout; the device inside is drawn at full size.
        <div className="m-auto shrink-0" style={{ width: outerWidth * scale, height: outerHeight * scale }}>
          <div
            className="origin-top-left bg-ink shadow-2xl"
            style={{
              width: outerWidth,
              height: outerHeight,
              padding: model.bezel,
              borderRadius: model.radius + model.bezel,
              transform: `scale(${scale})`,
            }}
          >
            <iframe
              key={`${reloadKey}-${model.id}-${orientation}`}
              title={`${model.name} preview`}
              src={src}
              width={width}
              height={height}
              allow="fullscreen; gamepad; autoplay"
              className="block border-0 bg-paper"
              style={{ width, height, borderRadius: model.radius }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
