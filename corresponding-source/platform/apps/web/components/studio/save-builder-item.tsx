'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { BuilderModelKind, type Style } from '@genvr/contracts';
import { getCoreItem } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import { api, errorMessage } from '../../lib/api';

const field = 'w-full rounded-xl bg-paper p-3 ring-1 ring-ink/20';
const button = 'pointer-events-auto rounded-xl bg-ink px-4 py-3 font-bold text-paper disabled:opacity-40';
const modes = [
  ['assembly', 'One assembled design', 'One listing, one price. Place all parts together.'],
  ['pack', 'Design pack', 'One total price. Use each included design independently.'],
  ['separate', 'Separate products', 'Individual listings and prices. Buyers choose each design.'],
] as const;
type Mode = (typeof modes)[number][0];
export function SaveBuilderItemButton({
  placeId,
  runtime,
  instanceIds,
}: {
  placeId: string;
  runtime: RefObject<GenvrRuntime | null>;
  instanceIds: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={button} onClick={() => setOpen(true)}>
        Save item
      </button>
      {open && (
        <SaveItemDialog
          key={instanceIds.join(',')}
          placeId={placeId}
          runtime={runtime}
          instanceIds={instanceIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function SaveItemDialog({
  placeId,
  runtime,
  instanceIds,
  onClose,
}: {
  placeId: string;
  runtime: RefObject<GenvrRuntime | null>;
  instanceIds: readonly string[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [units] = useState(() => {
    const rt = runtime.current,
      groups = new Map<string, { ids: string[]; name: string }>();
    for (const id of instanceIds) {
      const i = rt?.world.instances.find((i) => i.instanceId === id);
      if (!i) continue;
      const key = i.groupId ?? id;
      let unit = groups.get(key);
      if (!unit) {
        unit = {
          ids: [],
          name:
            (i.groupId ? rt?.world.groups.find((g) => g.id === i.groupId)?.name : null) ??
            i.name ??
            rt?.itemName(i.itemId) ??
            'My design',
        };
        groups.set(key, unit);
      }
      unit.ids.push(id);
    }
    return [...groups.values()];
  });
  const initial = runtime.current?.world.instances.find((i) => i.instanceId === instanceIds[0]);
  const suggested = BuilderModelKind.safeParse(
    initial ? getCoreItem(initial.itemId)?.manifest.subcategory : null,
  );
  const [name, setName] = useState(units.length === 1 ? units[0]!.name : 'My design collection');
  const [kind, setKind] = useState<import('@genvr/contracts').BuilderModelKind>(
    suggested.success ? suggested.data : 'props-and-decor',
  );
  const [style, setStyle] = useState<Style>(runtime.current?.world.style.base ?? 'blocky');
  const [destination, setDestination] = useState<'game' | 'marketplace'>('game');
  const [mode, setMode] = useState<Mode>('assembly'),
    [prices, setPrices] = useState(units.map(() => '0')),
    [names, setNames] = useState(units.map((u) => u.name)),
    [price, setPrice] = useState('0');
  const [pictures, setPictures] = useState<string[]>([]),
    [assemblyPicture, setAssemblyPicture] = useState<string | null>(null),
    [previewError, setPreviewError] = useState<string | null>(null);
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState<string | null>(null);
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const rt = runtime.current;
    if (rt)
      void (async () => {
        try {
          const all = await rt.previewSelectedItems(instanceIds);
          if (active) setAssemblyPicture(all);
          const images = [];
          for (const u of units) images.push(await rt.previewSelectedItems(u.ids));
          if (active) setPictures(images);
        } catch (e) {
          if (active) setPreviewError(e instanceof Error ? e.message : 'Preview unavailable.');
        }
      })();
    return () => {
      active = false;
    };
  }, [runtime, instanceIds, units]);
  const validPrice = (text: string) => /^\d{1,7}$/.test(text) && Number(text) <= 1000000;
  const valid =
    (mode === 'assembly' || units.length <= 8) &&
    name.trim().length >= 2 &&
    (mode === 'separate'
      ? prices.every(validPrice) && names.every((n) => n.trim().length >= 2 && n.trim().length <= 60)
      : validPrice(price));
  const listings = mode === 'separate' ? units.length : 1,
    total = mode === 'separate' ? prices.reduce((sum, p) => sum + (Number(p) || 0), 0) : Number(price) || 0;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const rt = runtime.current;
      if (!rt) throw new Error('The builder is not ready.');
      if (rt.pendingCommands().length) throw new Error('Wait for your edits to save, then try again.');
      const selection = instanceIds.map((id) => rt.world.instances.find((i) => i.instanceId === id));
      if (selection.some((i) => !i)) throw new Error('Select the item again.');
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(selection)));
      const selectionHash = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
      const encode = async (ids: readonly string[]) => {
        const bytes = new Uint8Array(await rt.exportSelectedItems(ids));
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        return btoa(binary);
      };
      const model = mode === 'separate' ? 'unused' : await encode(instanceIds),
        designs = [];
      if (mode !== 'assembly')
        for (const [index, u] of units.entries())
          designs.push({
            name: names[index]!,
            instanceIds: u.ids,
            model: await encode(u.ids),
            priceGems: mode === 'separate' ? Number(prices[index]) : 0,
          });
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/builder-items', {
        params: { path: { id: placeId } },
        body: {
          requestId: request.current,
          name,
          kind,
          style,
          destination,
          priceGems: mode === 'separate' ? 0 : Number(price),
          instanceIds: [...instanceIds],
          selectionHash,
          model,
          packaging: mode,
          ...(mode === 'assembly' ? {} : { designs }),
        },
      });
      if (!data) throw new Error(errorMessage(failed));
      setSaved(
        `${data.items?.length ?? 1} ${(data.items?.length ?? 1) === 1 ? 'listing' : 'listings'} ${destination === 'game' ? 'saved privately' : 'submitted for Marketplace review'}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The designs could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-label="Save and publish designs"
      className="pointer-events-auto m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-3xl bg-surface text-ink backdrop:bg-black/65"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-4 border-b border-ink/10 p-5 sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink/55">
            Builder · {review ? '2 / 2 · Review' : '1 / 2 · Prepare'}
          </p>
          <h2 className="mt-2 text-2xl font-black">
            {saved ? 'Designs saved' : review ? 'Review your listings' : 'Save your designs'}
          </h2>
          <p className="mt-2 text-sm text-ink/65">
            {instanceIds.length} selected parts · {units.length} independent designs · Static models with your
            colours
          </p>
        </div>
        <button
          type="button"
          aria-label="Close publishing"
          disabled={busy}
          onClick={onClose}
          className="rounded-full px-3 py-2 ring-1 ring-ink/20"
        >
          ×
        </button>
      </header>
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-xl bg-red-500/10 p-3 text-red-600">
          {error}
        </p>
      )}
      {saved ? (
        <div className="space-y-4 p-7">
          <p role="status">{saved}</p>
          <p>
            Gems design checkout is available only in isolated Stripe Test. Marketplace visibility requires
            approval.
          </p>
          <button type="button" className={button} onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <fieldset
          disabled={busy}
          className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.15fr_1fr]"
          onChange={() => {
            request.current = crypto.randomUUID();
          }}
        >
          <div className="space-y-4">
            <h3 className="font-bold">Included designs</h3>
            <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-ink/5 ring-1 ring-ink/10">
              {assemblyPicture ? (
                <img
                  src={assemblyPicture}
                  alt="Actual selected assembly with saved colours"
                  className="h-full w-full object-contain"
                />
              ) : (
                <p className="p-4 text-sm">{previewError ?? 'Rendering your selected designs…'}</p>
              )}
            </div>
            <p className="text-xs text-ink/60">
              Grouped parts stay together as one design. Only selected parts are included.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {units.map((u, index) => (
                <li key={u.ids.join(',')} className="rounded-xl bg-paper p-3 ring-1 ring-ink/10">
                  <div className="flex gap-3">
                    {pictures[index] && (
                      <img src={pictures[index]} alt={u.name} className="size-16 rounded-lg object-contain" />
                    )}
                    <div className="min-w-0 flex-1">
                      <label className="block text-xs text-ink/60">
                        Design {index + 1}
                        <input
                          aria-label={`Design ${index + 1} name`}
                          maxLength={60}
                          disabled={review || mode === 'assembly'}
                          value={names[index]}
                          className="mt-1 w-full rounded bg-transparent py-1 font-bold"
                          onChange={(e) => setNames(names.map((n, i) => (i === index ? e.target.value : n)))}
                        />
                      </label>
                      <p className="text-xs text-ink/60">{u.ids.length} parts</p>
                    </div>
                  </div>
                  {mode === 'separate' && (
                    <label className="mt-3 block text-sm">
                      Price · Gems (0 = free)
                      <input
                        disabled={review}
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        className={field}
                        value={prices[index]}
                        onChange={(e) => setPrices(prices.map((p, i) => (i === index ? e.target.value : p)))}
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-5">
            {!review && (
              <>
                <label className="block text-sm font-bold">
                  Collection / design name
                  <input
                    className={`${field} mt-2`}
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div>
                  <h3 className="mb-2 font-bold">Where will it go?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(['game', 'marketplace'] as const).map((d) => (
                      <label
                        key={d}
                        className={`cursor-pointer rounded-xl p-3 ring-2 ${destination === d ? 'ring-ink' : 'ring-ink/10'}`}
                      >
                        <input
                          type="radio"
                          name="destination"
                          checked={destination === d}
                          onChange={() => setDestination(d)}
                        />
                        <span className="ml-2 font-bold">{d === 'game' ? 'My game' : 'Marketplace'}</span>
                        <p className="mt-2 text-xs text-ink/65">
                          {d === 'game' ? 'Private. No public listing.' : 'Public after review.'}
                        </p>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 font-bold">How will buyers receive it?</h3>
                  <div className="space-y-2">
                    {modes.map(([value, title, description]) => (
                      <label
                        key={value}
                        className={`block cursor-pointer rounded-xl p-3 ring-2 ${mode === value ? 'ring-ink' : 'ring-ink/10'}`}
                      >
                        <input
                          type="radio"
                          name="packaging"
                          checked={mode === value}
                          onChange={() => setMode(value)}
                        />
                        <span className="ml-2 font-bold">{title}</span>
                        <p className="mt-1 text-xs text-ink/65">{description}</p>
                      </label>
                    ))}
                  </div>
                  {mode !== 'assembly' && units.length > 8 && (
                    <p role="alert">Select up to 8 independent designs.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Type
                    <select
                      className={`${field} mt-1`}
                      value={kind}
                      onChange={(e) => setKind(e.target.value as typeof kind)}
                    >
                      {BuilderModelKind.options.map((k) => (
                        <option key={k} value={k}>
                          {k.replaceAll('-', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Style
                    <select
                      className={`${field} mt-1`}
                      value={style}
                      onChange={(e) => setStyle(e.target.value as Style)}
                    >
                      {(['realistic', 'anime', 'blocky', 'voxel'] as const).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {mode !== 'separate' && (
                  <label className="block text-sm font-bold">
                    {mode === 'pack' ? 'Total pack price' : 'Design price'} · Gems (0 = free)
                    <input
                      className={`${field} mt-2`}
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <aside className="space-y-3 rounded-2xl bg-paper p-5 ring-1 ring-ink/10">
              <h3 className="font-black">Listing summary</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt>Destination</dt>
                <dd className="text-right font-bold">
                  {destination === 'game' ? 'Private game' : 'Marketplace review'}
                </dd>
                <dt>Format</dt>
                <dd className="text-right">{modes.find((m) => m[0] === mode)![1]}</dd>
                <dt>Listings</dt>
                <dd className="text-right">{listings}</dd>
                <dt>Delivered designs</dt>
                <dd className="text-right">{mode === 'assembly' ? 1 : units.length}</dd>
                <dt>Type / style</dt>
                <dd className="text-right">
                  {kind.replaceAll('-', ' ')} / {style}
                </dd>
                <dt>{mode === 'separate' ? 'Individual prices total' : 'Buyer price'}</dt>
                <dd className="text-right font-black">
                  {total === 0 ? 'Free' : `${total.toLocaleString()} Gems`}
                </dd>
              </dl>
              {mode === 'separate' && (
                <p className="text-xs text-ink/65">
                  Prices apply individually to each card. This is not a pack price.
                </p>
              )}
              <p className="text-xs text-ink/65">
                Models and source credits require review. Purchases grant use in your worlds; creators keep
                authorship. Resale of purchased packages is unavailable.
              </p>
            </aside>
            <div className="flex flex-wrap gap-3">
              {review ? (
                <>
                  <button
                    type="button"
                    className={button}
                    disabled={!valid || busy}
                    onClick={() => void save()}
                  >
                    {busy
                      ? 'Saving designs…'
                      : destination === 'marketplace'
                        ? `Submit ${listings} ${listings === 1 ? 'listing' : 'listings'}`
                        : 'Save privately'}
                  </button>
                  <button type="button" className="underline" onClick={() => setReview(false)}>
                    Back to edit
                  </button>
                </>
              ) : (
                <button type="button" className={button} disabled={!valid} onClick={() => setReview(true)}>
                  Review listings →
                </button>
              )}
            </div>
          </div>
        </fieldset>
      )}
    </dialog>
  );
}
