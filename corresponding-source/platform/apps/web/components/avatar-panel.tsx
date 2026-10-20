'use client';

import {
  AVATAR_COLOR_PARTS,
  type AvatarColorPart,
  type AvatarLook,
  AVATAR_SCALE_LIMITS,
  AvatarBodyOutfit,
  lookForBody,
  NORMAL_AVATAR_SCALE,
  type AvatarScale,
  wearBody,
} from '@genvr/contracts';
import {
  CORE_ACCESSORIES,
  CORE_CLOTHING,
  CORE_EMOTES,
  DEFAULT_FAVORITE_ANIMATIONS,
  allowedInPlace,
  HIDDEN_BODY_IDS,
  PICKABLE_BODIES,
  findBody,
  applyPlaceAvatar,
  toggleWearable,
  type WearableItem,
} from '@genvr/core-library';
import {
  Check,
  Gem,
  Info,
  PanelLeftClose,
  PersonStanding,
  Pipette,
  RefreshCw,
  Shirt,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { animationIcon } from '../lib/animation-icons';
import { updateAvatarLook, useAvatarLook, usePlaceAvatarRules } from '../lib/avatar-look';
import { AvatarSketch } from './avatar-sketch';
import { LookItems } from './look-items';

type Tab = 'animations' | 'look' | 'accessories' | 'looks';

const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: 'animations', label: 'Moves', Icon: Sparkles },
  { id: 'look', label: 'Look', Icon: Shirt },
  { id: 'accessories', label: 'Extras', Icon: Gem },
  // Look items (2026-10-03): looks from the store, and publishing your own.
  { id: 'looks', label: 'Looks', Icon: ShoppingBag },
];

const PART_LABEL: Record<AvatarColorPart, string> = {
  skin: 'Skin',
  hair: 'Hair',
  shirt: 'Shirt',
  pants: 'Pants',
  shoes: 'Shoes',
};

const CLOTHES = [
  '#f2f2ee',
  '#1b1b1b',
  '#2b2d42',
  '#6d4aff',
  '#3a86ff',
  '#2a9d8f',
  '#80b918',
  '#ffd166',
  '#f4a261',
  '#e63946',
  '#ff5d8f',
];

/** Swatches per body part; the last cell of every palette picks any color. */
const PALETTES: Record<AvatarColorPart, string[]> = {
  skin: ['#fde3cf', '#f2c49b', '#e3a878', '#c98b5b', '#a26a43', '#7a4a2e', '#553222'],
  hair: [
    '#1b1b1b',
    '#3b2a20',
    '#7a4b2a',
    '#c68b3c',
    '#e8c872',
    '#b5462f',
    '#f2f2f2',
    '#ff7eb6',
    '#5b8def',
    '#7bd389',
    '#9b5de5',
  ],
  shirt: CLOTHES,
  pants: CLOTHES,
  shoes: CLOTHES,
};

/** The Avatar button: first entry of the bottom toolbar, for players and builders alike. */
export function AvatarButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold transition ${
        open ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
      }`}
    >
      <PersonStanding className="my-1 size-6" strokeWidth={2.2} aria-hidden />
      Avatar
    </button>
  );
}

/** Round color picker at the end of a palette (any color). */
function AnyColor({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <label
      title="Any color"
      className="relative flex size-8 cursor-pointer items-center justify-center rounded-full bg-paper text-ink/70 ring-1 ring-ink/15 hover:text-ink"
    >
      <Pipette className="size-4" aria-hidden />
      <span className="sr-only">Any color</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

/** A change to a look, applied to the newest value (color pickers send many). */
export type LookChange = (change: (current: AvatarLook) => AvatarLook) => void;

/** Body part buttons, then a palette for the chosen part and any color at the end. */
export function ColorPicker({
  look,
  onChange,
  parts = AVATAR_COLOR_PARTS,
}: {
  look: AvatarLook;
  onChange: LookChange;
  parts?: readonly AvatarColorPart[];
}) {
  const [chosenPart, setPart] = useState<AvatarColorPart>('shirt');
  const part = parts.includes(chosenPart) ? chosenPart : parts[0]!;
  const setColor = (color: string) => onChange((current) => ({ ...current, [part]: color }));
  const palette = PALETTES[part];
  return (
    <section aria-label="Colors" className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Body part" className="grid grid-cols-5 gap-1">
        {parts.map((entry) => (
          <button
            key={entry}
            type="button"
            role="radio"
            aria-checked={part === entry}
            onClick={() => setPart(entry)}
            className="flex flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-bold text-ink/70 hover:text-ink aria-checked:text-ink"
          >
            <span
              className={`size-8 rounded-full ring-1 ring-ink/15 ${
                part === entry ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ backgroundColor: look[entry] }}
            />
            {PART_LABEL[entry]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 justify-items-center gap-y-2">
        {palette.map((color) => {
          const chosen = look[part].toLowerCase() === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => setColor(color)}
              aria-label={`${PART_LABEL[part]} color ${color}`}
              aria-pressed={chosen}
              className="flex size-8 items-center justify-center rounded-full ring-1 ring-ink/15 transition active:scale-90"
              style={{ backgroundColor: color }}
            >
              {chosen ? (
                <Check
                  className="size-4"
                  strokeWidth={3}
                  style={{ color: isLight(color) ? '#1b1b1b' : '#ffffff' }}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
        <AnyColor value={look[part]} onChange={setColor} />
      </div>
    </section>
  );
}

/** Perceived brightness, for a readable check mark on a swatch. */
function isLight(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
}

/**
 * Tiles of wearables, each drawn on the avatar; tap to put on or take off. Items the place does
 * not allow stay visible but cannot be picked.
 */
export function WearGrid({
  items,
  look,
  onChange,
  allowed = () => true,
  className = 'grid-cols-2 short:grid-cols-3',
}: {
  items: readonly WearableItem[];
  look: AvatarLook;
  onChange: LookChange;
  allowed?: (id: string) => boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      {items.map((item) => {
        const ok = allowed(item.manifest.id);
        const worn = ok && look.wear.includes(item.manifest.id);
        return (
          <button
            key={item.manifest.id}
            type="button"
            aria-pressed={worn}
            disabled={!ok}
            title={
              ok ? (item.layer === 'outer' ? 'Goes over other tops' : undefined) : 'Not used in this place'
            }
            onClick={() =>
              onChange((current) => ({
                ...current,
                wear: toggleWearable(current.wear, item.manifest.id),
              }))
            }
            className={`relative flex flex-col items-center gap-1 rounded-2xl bg-paper px-2 pt-2 pb-1.5 text-xs font-bold text-ink transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              worn ? 'ring-2 ring-ink' : 'enabled:hover:bg-ink/5'
            }`}
          >
            <AvatarSketch
              look={{ ...look, wear: [item.manifest.id] }}
              view={item.slot === 'back' ? 'back' : 'front'}
              focus={{ item: item.manifest.id }}
              className="h-16 w-full short:h-12"
            />
            {item.manifest.name}
            {worn ? (
              <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-on-brand">
                <Check className="size-3" strokeWidth={3} aria-hidden />
                <span className="sr-only">Wearing</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <h3 className={`mt-4 mb-2 text-sm font-extrabold text-ink ${first ? 'short:mt-0' : ''}`}>{children}</h3>
  );
}

/**
 * Body types (P2-22): each card shows the player's look on that body. Every body keeps its own
 * look: switching keeps the worn look for the old body and brings back the new body's look.
 */
export function BodyPicker({ look, onChange }: { look: AvatarLook; onChange: LookChange }) {
  // A player already on a hidden body still sees it (board A12); nobody can pick one anew.
  const bodies = HIDDEN_BODY_IDS.has(look.body) ? [...PICKABLE_BODIES, findBody(look.body)] : PICKABLE_BODIES;
  return (
    <div role="radiogroup" aria-label="Body type" className="grid grid-cols-2 gap-2">
      {bodies.map((body) => {
        const on = look.body === body.id;
        return (
          <button
            key={body.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange((current) => wearBody(current, body.id))}
            className={`relative flex flex-col items-center gap-1 rounded-2xl bg-paper px-2 pt-2 pb-1.5 text-xs font-bold text-ink transition active:scale-95 ${
              on ? 'ring-2 ring-ink' : 'hover:bg-ink/5'
            }`}
          >
            <AvatarSketch look={lookForBody(look, body.id)} className="h-20 w-full short:h-14" />
            {body.manifest.name}
            {on ? (
              <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-on-brand">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const SIZES: Array<{ key: keyof AvatarScale; label: string }> = [
  { key: 'height', label: 'Height' },
  { key: 'width', label: 'Width' },
  { key: 'head', label: 'Head' },
];

/** Body size sliders (P2-22), like Roblox body scales. */
export function SizeSliders({ look, onChange }: { look: AvatarLook; onChange: LookChange }) {
  return (
    <div className="flex flex-col gap-2">
      {SIZES.map(({ key, label }) => {
        const limits = AVATAR_SCALE_LIMITS[key];
        const value = look.scale[key];
        return (
          <label
            key={key}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs font-bold text-ink/75"
          >
            {label}
            <input
              type="range"
              min={limits.min}
              max={limits.max}
              step={0.01}
              value={value}
              onChange={(event) => {
                const next = Number(event.target.value);
                onChange((current) => ({ ...current, scale: { ...current.scale, [key]: next } }));
              }}
              className="w-full accent-ink"
            />
            <span className="text-right tabular-nums">{Math.round(value * 100)}%</span>
          </label>
        );
      })}
      {look.scale.height !== 1 || look.scale.width !== 1 || look.scale.head !== 1 ? (
        <button
          type="button"
          onClick={() => onChange((current) => ({ ...current, scale: NORMAL_AVATAR_SCALE }))}
          className="self-start rounded-lg px-2 py-1 text-xs font-bold text-ink/70 ring-1 ring-ink/15 hover:text-ink"
        >
          Normal size
        </button>
      ) : null}
    </div>
  );
}

/** The current look, seen from the front or the back. */
export function LookPreview({ look }: { look: AvatarLook }) {
  const [view, setView] = useState<'front' | 'back'>('front');
  return (
    <div className="relative flex justify-center rounded-2xl bg-paper py-3 short:hidden">
      <AvatarSketch look={look} view={view} className="h-36 w-full" />
      <button
        type="button"
        onClick={() => setView(view === 'front' ? 'back' : 'front')}
        aria-label={view === 'front' ? 'Show the back' : 'Show the front'}
        title={view === 'front' ? 'Show the back' : 'Show the front'}
        className="absolute right-2 bottom-2 rounded-xl bg-surface p-1.5 text-ink/70 shadow-sm hover:text-ink"
      >
        <RefreshCw className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The avatar tabs: moves from the animation library, the look (colors and clothes), and extras
 * (hats, glasses, backpacks). The look is saved on the account and changes the avatar at once
 * (P2-20). Shared by the play panel and the studio's Avatar tab.
 */
/** A short note about the place's avatar rules. */
function PlaceNote({ children }: { children: string }) {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-2xl bg-paper p-3 text-xs font-semibold text-ink/75">
      <Info className="mt-px size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function AvatarTabs({ onAnimation }: { onAnimation: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('animations');
  const look = useAvatarLook();
  // The place's rules (P2-21): what others see, and what the player may still change.
  const rules = usePlaceAvatarRules();
  const shown = applyPlaceAvatar(look, rules);
  // A place that uses another body (P2-22): edits go to the look kept for that body, so the
  // player sees them here, and the body they wear elsewhere stays as it is.
  const forced = rules.body !== 'any' && rules.body !== look.body ? rules.body : null;
  const editing = forced ? lookForBody(look, forced) : look;
  const change: LookChange = forced
    ? (update) =>
        updateAvatarLook((current) => ({
          ...current,
          bodies: {
            ...current.bodies,
            [forced]: AvatarBodyOutfit.parse(update(lookForBody(current, forced))),
          },
        }))
    : updateAvatarLook;
  const allowed = (id: string) => allowedInPlace(id, rules);
  return (
    <>
      <div
        role="tablist"
        className="mb-2 grid shrink-0 grid-cols-4 gap-1 rounded-2xl bg-paper p-1 short:mb-0 short:w-16 short:grid-cols-1 short:content-start"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`flex flex-col items-center rounded-xl py-1.5 text-xs font-bold ${
              tab === entry.id ? 'bg-surface text-brand shadow' : 'text-ink/60 hover:text-ink'
            }`}
          >
            <entry.Icon className="size-5" aria-hidden />
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:thin]">
        {tab === 'animations' ? (
          <div className="grid auto-rows-min grid-cols-2 gap-2">
            {CORE_EMOTES.map((animation) => {
              const Icon = animationIcon(animation.manifest.id);
              const slot = DEFAULT_FAVORITE_ANIMATIONS.indexOf(animation.manifest.id);
              return (
                <button
                  key={animation.manifest.id}
                  type="button"
                  onClick={() => onAnimation(animation.manifest.id)}
                  className="relative flex flex-col items-center gap-1 rounded-2xl bg-paper px-1 py-3 text-xs font-bold text-ink hover:bg-ink/5 active:scale-95"
                >
                  <Icon className="size-8 text-brand" strokeWidth={1.8} aria-hidden />
                  <span className="text-center leading-tight">{animation.manifest.name}</span>
                  {slot >= 0 ? (
                    <kbd className="absolute top-1.5 right-2 text-[10px] font-bold text-ink/40">
                      {slot + 1}
                    </kbd>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : tab === 'looks' ? (
          <LookItems current={look} />
        ) : tab === 'look' ? (
          <>
            {rules.mode === 'place' ? (
              <PlaceNote>
                This place dresses everyone in its own outfit. Your skin and hair still show.
              </PlaceNote>
            ) : null}
            <LookPreview look={shown} />
            <SectionTitle first>Body</SectionTitle>
            {rules.body === 'any' ? (
              <BodyPicker look={look} onChange={updateAvatarLook} />
            ) : (
              <p className="text-xs text-ink/60">
                This place uses the {findBody(rules.body).manifest.name} body for everyone.
              </p>
            )}
            <SectionTitle>Size</SectionTitle>
            {rules.mode === 'player' ? (
              <SizeSliders look={editing} onChange={change} />
            ) : (
              <p className="text-xs text-ink/60">This place uses the normal size.</p>
            )}
            <SectionTitle>Colors</SectionTitle>
            <ColorPicker
              look={editing}
              onChange={change}
              parts={rules.mode === 'place' ? ['skin', 'hair'] : AVATAR_COLOR_PARTS}
            />
            {rules.mode === 'place' ? null : (
              <>
                <SectionTitle>Clothes</SectionTitle>
                <WearGrid items={CORE_CLOTHING} look={editing} onChange={change} allowed={allowed} />
              </>
            )}
          </>
        ) : (
          <>
            {rules.mode === 'place' ? (
              <PlaceNote>This place dresses everyone in its own outfit, extras included.</PlaceNote>
            ) : (
              <>
                {rules.mode === 'player-limited' ? (
                  <PlaceNote>Big extras like capes and wings are not used in this place.</PlaceNote>
                ) : null}
                <p className="mb-2 text-xs text-ink/60">One of each kind: a new hat swaps the old one.</p>
                <WearGrid items={CORE_ACCESSORIES} look={editing} onChange={change} allowed={allowed} />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Avatar side panel while playing (left, like the catalogs). Keys 1-8 play the favorites, C sits. */
export function AvatarPanel({
  onAnimation,
  onClose,
}: {
  onAnimation: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Avatar"
      className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col rounded-3xl bg-surface/95 p-3 shadow-xl short:w-[22rem] short:flex-row short:gap-2 short:p-2"
    >
      <div className="mb-2 flex items-center justify-between short:hidden">
        <h2 className="text-base font-extrabold text-ink">Avatar</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close avatar"
          className="rounded-xl p-1.5 text-ink/70 hover:bg-ink/5"
        >
          <PanelLeftClose className="size-5" aria-hidden />
        </button>
      </div>
      <AvatarTabs onAnimation={onAnimation} />
    </aside>
  );
}
