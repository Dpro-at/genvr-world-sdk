'use client';

import { rideFromParams, type Ride, type RideDefault } from '@genvr/contracts';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import {
  choicePatch,
  flagPatch,
  numberPatch,
  RIDE_CHOICE_LABELS,
  RIDE_CHOICES,
  rideChoice,
  rideFields,
  SEATS_FIELD,
  tagPatch,
  type RideField,
} from '../../lib/ride-edit';
import type { ParamsPatch } from '../../lib/zone-settings';

const heading = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const choiceButton = (on: boolean) =>
  `min-h-11 rounded-md px-1 text-[11px] font-bold md:min-h-8 ${
    on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
  }`;

/** A slider that sends its value once, when it is let go (one undo step per drag). */
function Slider({
  field,
  value,
  onCommit,
}: {
  field: RideField;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const done = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const now = draft ?? value;
  return (
    <label className="flex flex-col text-xs font-bold text-ink/70">
      <span className="flex justify-between gap-3">
        {field.label}
        <span className="text-ink tabular-nums">{field.shown(now)}</span>
      </span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={now}
        aria-label={field.label}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={done}
        onKeyUp={done}
        onBlur={done}
        onKeyDown={(event) => event.stopPropagation()}
        className="h-11 w-full accent-ink md:h-6"
      />
    </label>
  );
}

/**
 * Ride settings of the selected item (movement modes): any item can be ridden, on the ground, on
 * water or in the air, by generic numbers. Each change is one `set_item_params` command, so undo
 * and co-building work as for any look. Riding is off in side-view places.
 */
export function RideSection({
  params,
  itemDefault,
  sideView,
  worldTags,
  onPatch,
}: {
  params: Readonly<Record<string, unknown>>;
  /** The ride the item comes with by itself (its manifest), if any. */
  itemDefault: RideDefault | undefined;
  sideView: boolean;
  /** The ride tags placed in the world (offered in the tag field). */
  worldTags: readonly string[];
  onPatch: (patch: ParamsPatch) => void;
}) {
  const ride: Ride | null = rideFromParams(params, itemDefault);
  const [more, setMore] = useState(false);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const listId = useId();
  const moreId = useId();

  if (sideView)
    return (
      <section className="flex flex-col gap-1.5">
        <p className={heading}>Ride</p>
        <p className="text-[11px] text-ink/50">Riding is not available in side view.</p>
      </section>
    );

  const choice = rideChoice(ride);
  const commitTag = () => {
    if (tagDraft === null) return;
    setTagDraft(null);
    const patch = tagPatch(tagDraft);
    if ((patch.rideTag ?? undefined) !== ride?.tag) onPatch(patch);
  };
  const number = (field: RideField) =>
    ride ? (
      <Slider
        key={`${field.key}-${ride[field.key]}`}
        field={field}
        value={ride[field.key]}
        onCommit={(value) => onPatch(numberPatch(field.key, value))}
      />
    ) : null;

  return (
    <section className="flex flex-col gap-1.5">
      <p className={heading}>Ride</p>
      <div className="grid grid-cols-2 gap-1.5">
        {RIDE_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={choice === option}
            onClick={() => choice !== option && onPatch(choicePatch(option, ride, itemDefault))}
            className={choiceButton(choice === option)}
          >
            {RIDE_CHOICE_LABELS[option]}
          </button>
        ))}
      </div>
      {ride ? (
        <>
          <div className="flex items-center gap-1 text-xs">
            <span className="flex-1 font-bold text-ink/70">Seats</span>
            <button
              type="button"
              aria-label="Fewer seats"
              disabled={ride.seats <= SEATS_FIELD.min}
              onClick={() => onPatch(numberPatch('seats', ride.seats - 1))}
              className="inline-flex size-11 items-center justify-center rounded-md bg-paper text-ink hover:bg-ink/10 disabled:opacity-40 md:size-7"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="w-6 text-center font-bold tabular-nums" aria-live="polite">
              {ride.seats}
            </span>
            <button
              type="button"
              aria-label="More seats"
              disabled={ride.seats >= SEATS_FIELD.max}
              onClick={() => onPatch(numberPatch('seats', ride.seats + 1))}
              className="inline-flex size-11 items-center justify-center rounded-md bg-paper text-ink hover:bg-ink/10 disabled:opacity-40 md:size-7"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>
          {rideFields(ride.model, false).map(number)}
          {ride.model === 'air' ? (
            <div className="grid grid-cols-2 gap-1.5">
              {([false, true] as const).map((glide) => (
                <button
                  key={String(glide)}
                  type="button"
                  aria-pressed={ride.glide === glide}
                  onClick={() => ride.glide !== glide && onPatch(flagPatch('glide', glide))}
                  className={choiceButton(ride.glide === glide)}
                >
                  {glide ? 'Needs speed' : 'Hovers'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            aria-expanded={more}
            aria-controls={moreId}
            onClick={() => setMore((open) => !open)}
            className="inline-flex min-h-11 items-center gap-1 self-start rounded-md text-xs font-bold text-ink/70 hover:text-ink md:min-h-7"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${more ? 'rotate-180' : ''}`}
              aria-hidden
            />
            More
          </button>
          {more ? (
            <div id={moreId} className="flex flex-col gap-1.5">
              {rideFields(ride.model, true).map(number)}
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Rider pose">
                {(['sit', 'stand'] as const).map((pose) => (
                  <button
                    key={pose}
                    type="button"
                    aria-pressed={ride.pose === pose}
                    onClick={() => ride.pose !== pose && onPatch(flagPatch('pose', pose))}
                    className={choiceButton(ride.pose === pose)}
                  >
                    {pose === 'sit' ? 'Riders sit' : 'Riders stand'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-xs">
                <span className="w-12 shrink-0 font-bold text-ink/60">Tag</span>
                <input
                  value={tagDraft ?? ride.tag ?? ''}
                  maxLength={40}
                  list={listId}
                  placeholder="Name it for the rules"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onBlur={commitTag}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') commitTag();
                    if (event.key === 'Escape') setTagDraft(null);
                  }}
                  aria-label="Ride tag"
                  className="h-11 w-full min-w-0 rounded-md bg-paper px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-ink/30 md:h-7"
                />
                <datalist id={listId}>
                  {worldTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </label>
            </div>
          ) : null}
          <p className="text-[11px] text-ink/50">
            Players walk up to it and get on with E or the Ride button.
          </p>
        </>
      ) : null}
    </section>
  );
}
