'use client';

import {
  normalizeDevices,
  normalizeMoves,
  PLAY_DEVICES,
  type PlayDevice,
  type PlayOrientation,
  type PlaySettings,
  type PlayView,
  type SideMove,
} from '@genvr/contracts';
import {
  Box,
  BrickWall,
  ChevronsUp,
  FastForward,
  Glasses,
  Monitor,
  PanelsTopLeft,
  RectangleHorizontal,
  RectangleVertical,
  RotateCw,
  Smartphone,
  Tablet,
  Tv,
  type LucideIcon,
} from 'lucide-react';

export const ORIENTATIONS: Array<{ id: PlayOrientation; label: string; Icon: LucideIcon }> = [
  { id: 'landscape', label: 'Landscape', Icon: RectangleHorizontal },
  { id: 'portrait', label: 'Portrait', Icon: RectangleVertical },
  { id: 'any', label: 'Either way', Icon: RotateCw },
];

/** How players see the place (decision 93): normal 3D, or a 2D place seen from the side. */
export const VIEWS: Array<{ id: PlayView; label: string; Icon: LucideIcon }> = [
  { id: 'free', label: '3D', Icon: Box },
  { id: 'side', label: '2D side view', Icon: PanelsTopLeft },
];

/** Extra moves a creator can give a side-view place (decision 95). */
export const SIDE_MOVE_LABELS: Array<{ id: SideMove; label: string; Icon: LucideIcon }> = [
  { id: 'double-jump', label: 'Double jump', Icon: ChevronsUp },
  { id: 'wall-jump', label: 'Wall jump', Icon: BrickWall },
  { id: 'dash', label: 'Dash', Icon: FastForward },
];

export const DEVICES: Record<PlayDevice, { label: string; Icon: LucideIcon; soon?: boolean }> = {
  phone: { label: 'Phone', Icon: Smartphone },
  tablet: { label: 'Tablet', Icon: Tablet },
  computer: { label: 'Computer', Icon: Monitor },
  tv: { label: 'TV with a controller', Icon: Tv },
  vr: { label: 'VR headset', Icon: Glasses, soon: true },
};

const chip = (on: boolean, compact: boolean) =>
  `inline-flex items-center gap-1.5 font-bold transition disabled:opacity-40 ${
    compact ? 'rounded-lg px-2 py-1.5 text-xs' : 'rounded-xl px-3.5 py-2.5 text-sm'
  } ${on ? 'bg-ink text-on-brand' : 'bg-ink/5 text-ink hover:bg-ink/10'}`;

/**
 * How a place is played (P9-15, decision 68): the phone orientation and the devices it suits.
 * Used when creating a place and in the place settings.
 */
export function PlaySettingsPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: PlaySettings;
  onChange: (next: PlaySettings) => void;
  disabled?: boolean;
  /** Smaller chips for the studio's side panel. */
  compact?: boolean;
}) {
  const toggle = (device: PlayDevice) => {
    const on = value.devices.includes(device);
    // At least one device stays chosen.
    if (on && value.devices.length === 1) return;
    onChange({
      ...value,
      devices: normalizeDevices(on ? value.devices.filter((d) => d !== device) : [...value.devices, device]),
    });
  };
  return (
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className={`mb-2 font-bold text-ink/60 ${compact ? 'text-xs' : 'text-sm'}`}>
          Phone screen
        </legend>
        <div className="flex flex-wrap gap-2">
          {ORIENTATIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={value.orientation === entry.id}
              onClick={() => onChange({ ...value, orientation: entry.id })}
              className={chip(value.orientation === entry.id, compact)}
            >
              <entry.Icon className="size-4" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className={`mb-2 font-bold text-ink/60 ${compact ? 'text-xs' : 'text-sm'}`}>
          Players see it
        </legend>
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={value.view === entry.id}
              onClick={() => onChange({ ...value, view: entry.id })}
              className={chip(value.view === entry.id, compact)}
            >
              <entry.Icon className="size-4" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
        {value.view === 'side' && !compact ? (
          <p className="text-sm text-ink/60">
            Players move left and right and jump, like a platform game. You still build in 3D; Test shows the
            side view.
          </p>
        ) : null}
      </fieldset>
      {value.view === 'side' ? (
        <fieldset disabled={disabled} className="flex flex-col gap-2">
          <legend className={`mb-2 font-bold text-ink/60 ${compact ? 'text-xs' : 'text-sm'}`}>
            Extra moves
          </legend>
          <div className="flex flex-wrap gap-2">
            {SIDE_MOVE_LABELS.map((entry) => {
              const on = value.moves.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...value,
                      moves: normalizeMoves(
                        on ? value.moves.filter((move) => move !== entry.id) : [...value.moves, entry.id],
                      ),
                    })
                  }
                  className={chip(on, compact)}
                >
                  <entry.Icon className="size-4" aria-hidden />
                  {entry.label}
                </button>
              );
            })}
          </div>
          {!compact ? (
            <p className="text-sm text-ink/60">
              Thin platforms that hang in the air can always be jumped through from below; players press down
              to drop through them.
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className={`mb-2 font-bold text-ink/60 ${compact ? 'text-xs' : 'text-sm'}`}>Made for</legend>
        <div className="flex flex-wrap gap-2">
          {PLAY_DEVICES.map((device) => {
            const { label, Icon, soon } = DEVICES[device];
            const on = value.devices.includes(device);
            return (
              <button
                key={device}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(device)}
                className={chip(on, compact)}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {soon ? <span className="text-xs opacity-60">later</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** Short line for place pages: "Landscape · Phone, Tablet, Computer" (2D places say so first). */
export function playSummary(play: PlaySettings): string {
  const orientation = ORIENTATIONS.find((entry) => entry.id === play.orientation)?.label ?? '';
  const devices = play.devices.map((device) => DEVICES[device].label).join(', ');
  const screen = orientation === 'Either way' ? 'Any screen' : orientation;
  return `${play.view === 'side' ? '2D side view · ' : ''}${screen} · ${devices}`;
}
