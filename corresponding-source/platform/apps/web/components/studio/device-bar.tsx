'use client';

import type { PlayDevice } from '@genvr/contracts';
import { Monitor, RefreshCw, RotateCw, Smartphone, Tablet, Tv, type LucideIcon } from 'lucide-react';
import type { Zoom } from './device-emulator';
import { DEVICE_MODELS, defaultModel, type DeviceKind, type DeviceModel, type Orientation } from './devices';

/** What the studio shows in its viewport: the editing view (no model) or a device emulator. */
export interface PreviewState {
  model: DeviceModel | null;
  orientation: Orientation;
  zoom: Zoom;
  reloadKey: number;
}

export const DEFAULT_PREVIEW: PreviewState = {
  model: null,
  orientation: 'landscape',
  zoom: 'fit',
  reloadKey: 0,
};

const KINDS: Array<{ kind: DeviceKind; label: string; Icon: LucideIcon; device?: PlayDevice }> = [
  { kind: 'desktop', label: 'Edit view', Icon: Monitor },
  { kind: 'tablet', label: 'Tablet', Icon: Tablet, device: 'tablet' },
  { kind: 'phone', label: 'Phone', Icon: Smartphone, device: 'phone' },
  { kind: 'tv', label: 'TV with a controller', Icon: Tv, device: 'tv' },
];

const ZOOMS: Array<{ value: Zoom; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
];

const select =
  'h-8 rounded-lg bg-paper px-2 text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-ink/30';

/** Studio device preview controls: kind, model, orientation, zoom, and reload. */
export function DeviceBar({
  preview,
  onPreview,
  devices = null,
}: {
  preview: PreviewState;
  onPreview: (next: PreviewState) => void;
  /** Devices the place is made for (P9-15); others stay available but look faded. */
  devices?: readonly PlayDevice[] | null;
}) {
  const kind = preview.model?.kind ?? 'desktop';
  const models = DEVICE_MODELS.filter((model) => model.kind === kind);
  const turns = kind === 'phone' || kind === 'tablet';
  return (
    <div className="flex items-center gap-1">
      <div className="flex rounded-lg bg-paper p-0.5" role="group" aria-label="Preview as">
        {KINDS.map((entry) => {
          const unsuited = Boolean(entry.device && devices && !devices.includes(entry.device));
          const label =
            entry.kind === 'desktop'
              ? entry.label
              : `Preview on a ${entry.label}${unsuited ? ' (this place is not made for it)' : ''}`;
          return (
            <button
              key={entry.kind}
              type="button"
              aria-pressed={kind === entry.kind}
              aria-label={label}
              title={label}
              onClick={() => onPreview({ ...preview, model: defaultModel(entry.kind) })}
              className={`flex size-8 items-center justify-center rounded-md ${
                kind === entry.kind ? 'bg-surface text-ink shadow' : 'text-ink/50 hover:text-ink'
              } ${unsuited && kind !== entry.kind ? 'opacity-35' : ''}`}
            >
              <entry.Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
      {preview.model ? (
        <>
          <select
            aria-label="Device model"
            value={preview.model.id}
            onChange={(event) =>
              onPreview({ ...preview, model: DEVICE_MODELS.find((m) => m.id === event.target.value) ?? null })
            }
            className={select}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          {turns ? (
            <button
              type="button"
              onClick={() =>
                onPreview({
                  ...preview,
                  orientation: preview.orientation === 'landscape' ? 'portrait' : 'landscape',
                })
              }
              aria-label={`Turn to ${preview.orientation === 'landscape' ? 'portrait' : 'landscape'}`}
              title={`Turn to ${preview.orientation === 'landscape' ? 'portrait' : 'landscape'}`}
              className="flex size-8 items-center justify-center rounded-lg text-ink/70 hover:bg-ink/5"
            >
              <RotateCw className="size-4" aria-hidden />
            </button>
          ) : null}
          <select
            aria-label="Zoom"
            value={String(preview.zoom)}
            onChange={(event) =>
              onPreview({
                ...preview,
                zoom: event.target.value === 'fit' ? 'fit' : (Number(event.target.value) as Zoom),
              })
            }
            className={select}
          >
            {ZOOMS.map((zoom) => (
              <option key={zoom.label} value={String(zoom.value)}>
                {zoom.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onPreview({ ...preview, reloadKey: preview.reloadKey + 1 })}
            aria-label="Reload the preview (shows saved changes)"
            title="Reload the preview (shows saved changes)"
            className="flex size-8 items-center justify-center rounded-lg text-ink/70 hover:bg-ink/5"
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
