'use client';

import type { AvatarLook, PlaceAvatar, PlaceAvatarMode } from '@genvr/contracts';
import { AVATAR_BODIES, PLAYER_BODIES } from '@genvr/core-library';
import { CORE_ACCESSORIES, CORE_CLOTHING } from '@genvr/core-library';
import { AvatarSketch } from './avatar-sketch';
import { Check, Minimize2, Shirt, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ColorPicker, LookPreview, WearGrid, type LookChange } from './avatar-panel';
import { PlaceCharacters } from './place-characters';

const MODES: Array<{ id: PlaceAvatarMode; title: string; hint: string; Icon: LucideIcon }> = [
  { id: 'player', title: 'Their own look', hint: 'Everyone wears what they picked.', Icon: UserRound },
  {
    id: 'player-limited',
    title: 'Own look, no big extras',
    hint: 'Capes, wings, backpacks, and party hats are left out.',
    Icon: Minimize2,
  },
  {
    id: 'place',
    title: 'Your outfit',
    hint: 'Everyone wears the outfit you make here and keeps their own skin and hair.',
    Icon: Shirt,
  },
];

/**
 * Avatar rules of a place (task P2-21), in the place settings: players' own looks, own looks
 * without large extras, or one outfit for everyone. Changes save shortly after the last one and
 * apply to players who join from then on (and to everyone in rooms they join).
 */
export function PlaceAvatarSettings({
  value,
  onSave,
  view = 'free',
}: {
  value: PlaceAvatar;
  onSave: (avatar: PlaceAvatar) => void;
  /** Side-view (2D) places may also use the flat 2D body (decision 93). */
  view?: 'free' | 'side';
}) {
  const [avatar, setAvatar] = useState(value);
  // The 2D body is offered in side-view places (and kept visible while chosen).
  const bodies = AVATAR_BODIES.filter((body) => !body.flat || view === 'side' || value.body === body.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  }, [onSave]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = (next: PlaceAvatar, wait = 600) => {
    setAvatar(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.current(next), wait);
  };
  const changeOutfit: LookChange = (update) =>
    setAvatar((current) => {
      const next = { ...current, outfit: update(current.outfit) };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save.current(next), 600);
      return next;
    });
  const outfit: AvatarLook = avatar.outfit;

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Avatars in this place" className="grid gap-2 sm:grid-cols-3">
        {MODES.map((mode) => {
          const on = avatar.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => change({ ...avatar, mode: mode.id }, 0)}
              className={`relative flex flex-col items-start gap-2 rounded-2xl p-4 text-left transition ${
                on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/5'
              }`}
            >
              <mode.Icon className="size-6" aria-hidden />
              <span className="font-extrabold">{mode.title}</span>
              <span className={`text-sm ${on ? 'text-on-brand/75' : 'text-ink/60'}`}>{mode.hint}</span>
              {on ? <Check className="absolute top-4 right-4 size-5" strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-extrabold">Body type</h3>
        <div role="radiogroup" aria-label="Body type" className="grid grid-cols-3 gap-2 sm:max-w-lg">
          {(['any', ...bodies.map((body) => body.id)] as const).map((id) => {
            const on = avatar.body === id;
            const body = bodies.find((entry) => entry.id === id);
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => change({ ...avatar, body: id }, 0)}
                className={`relative flex flex-col items-center gap-1 rounded-2xl bg-paper px-2 pt-2 pb-2 text-sm font-bold transition ${
                  on ? 'ring-2 ring-ink' : 'hover:bg-ink/5'
                }`}
              >
                {body ? (
                  <AvatarSketch look={{ ...outfit, body: body.id }} className="h-24 w-full" />
                ) : (
                  <span className="flex h-24 w-full items-end justify-center gap-1">
                    {PLAYER_BODIES.map((entry) => (
                      <AvatarSketch
                        key={entry.id}
                        look={{ ...outfit, body: entry.id }}
                        className="h-20 min-w-0 flex-1"
                      />
                    ))}
                  </span>
                )}
                {body ? `${body.manifest.name} only` : "Player's choice"}
                {on ? <Check className="absolute top-2 right-2 size-4" strokeWidth={3} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <PlaceCharacters selected={avatar.body} onChoose={(id) => change({ ...avatar, body: id }, 0)} />

      {avatar.mode === 'place' ? (
        <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
            <LookPreview look={avatar.body === 'any' ? outfit : { ...outfit, body: avatar.body }} />
            <p className="text-xs text-ink/60">
              Shown with a sample skin and hair; each player keeps their own.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="font-extrabold">Colors</h3>
            <div className="max-w-sm">
              <ColorPicker look={outfit} onChange={changeOutfit} parts={['shirt', 'pants', 'shoes']} />
            </div>
            <h3 className="mt-3 font-extrabold">Clothes</h3>
            <WearGrid
              items={CORE_CLOTHING}
              look={outfit}
              onChange={changeOutfit}
              className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"
            />
            <h3 className="mt-3 font-extrabold">Extras</h3>
            <WearGrid
              items={CORE_ACCESSORIES}
              look={outfit}
              onChange={changeOutfit}
              className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
