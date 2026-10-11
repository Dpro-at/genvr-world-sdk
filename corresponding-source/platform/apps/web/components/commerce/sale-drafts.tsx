'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useMe } from '../../lib/use-me';
import { Badge, Button, ButtonLink, ErrorNote, Loading, Page } from '../ui';

type Paths = import('@genvr/api-client').paths;
type Mine = Paths['/v1/me/sale-drafts']['get']['responses'][200]['content']['application/json'];
type Draft = Mine['drafts'][number];
const field = 'w-full rounded-xl bg-paper px-3 py-2 ring-1 ring-ink/20';

export function DraftCard({ draft }: { draft: Draft }) {
  return (
    <article className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{draft.name}</h2>
        <Badge>Private draft</Badge>
        {!draft.ready ? <Badge tone="warn">Items need checking</Badge> : null}
      </div>
      {draft.description ? <p className="mb-3 text-sm text-ink/70">{draft.description}</p> : null}
      <p className="font-bold">
        {draft.priceCoins === 0 ? 'Free' : `Planned price: ${draft.priceCoins.toLocaleString()} Gems`}
      </p>
      {draft.priceCoins > 0 ? (
        <p className="mb-3 text-sm text-ink/60">
          Your share: {draft.creatorCoins.toLocaleString()} Gems · Platform:{' '}
          {draft.platformCoins.toLocaleString()} Gems ({draft.commissionBps / 100}%)
        </p>
      ) : null}
      <ul className="list-inside list-disc text-sm">
        {draft.contents.map((item) => (
          <li key={item.id}>
            {item.name} <span className="text-ink/60">· {item.kind}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink/60">
        Fixed contents. Nothing is random. This preview cannot be purchased.
      </p>
    </article>
  );
}

export function SaleDraftsPage({
  embedded = false,
  onSaved,
}: { embedded?: boolean; onSaved?: () => void } = {}) {
  const { me, loading } = useMe('onboarded');
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('100');
  const [priceType, setPriceType] = useState<'free' | 'paid'>('free');
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const { data, error: failed } = await api.GET('/v1/me/sale-drafts');
      if (!data) return setError(errorMessage(failed));
      setMine(data);
    } catch {
      setError('Could not load your sale drafts. Try again.');
    }
  }, []);
  useEffect(() => {
    if (me?.profile.onboarded) void load();
  }, [me, load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { data, error: failed } = await api.POST('/v1/me/sale-drafts', {
        body: { name, description, priceCoins: priceType === 'free' ? 0 : Number(price), itemIds: ids },
      });
      if (!data) return setError(errorMessage(failed));
      setNotice(`${data.name} saved as a private draft.`);
      setName('');
      setDescription('');
      setIds([]);
      await load();
      onSaved?.();
    } catch {
      setError('Could not save the draft. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const Frame = embedded ? 'section' : Page;
  return (
    <Frame title={embedded ? undefined : 'Marketplace item preparation'}>
      {embedded ? <h2 className="mb-3 text-xl font-bold">Add a shop item</h2> : null}
      <p className="mb-5 text-ink/70">
        {embedded
          ? 'Choose your reviewed item or design pack for this game shop.'
          : 'Prepare your own reviewed design for the marketplace.'}{' '}
        Choose Free or set a price in Gems.
      </p>
      <div className="mb-6 rounded-2xl bg-surface p-4">
        <Badge tone="warn">Purchases are not available yet</Badge>
        <p className="mt-2 text-sm">
          These drafts are visible only to you. Saving does not publish, charge Gems or change the price of
          your existing items.
        </p>
      </div>
      <ErrorNote message={error} />
      {notice ? (
        <p role="status" className="my-4 font-semibold">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <Loading />
      ) : !mine ? (
        <Button className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink/60">
            Planned platform share: {mine.commissionBps / 100}%. Whole-Gem amounts are shown for each draft.
            Cash-out is not enabled.
          </p>
          {mine.items.length ? (
            <form
              onSubmit={(event) => void submit(event)}
              className="mb-8 grid gap-4 rounded-2xl bg-surface p-5"
            >
              <label className="grid gap-1 font-semibold">
                Name
                <input
                  className={field}
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 font-semibold">
                Description
                <textarea
                  className={field}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 font-semibold">
                Item price
                <select
                  className={field}
                  value={priceType}
                  onChange={(event) => setPriceType(event.target.value as 'free' | 'paid')}
                  disabled={busy}
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid — Gems</option>
                </select>
              </label>
              {priceType === 'paid' ? (
                <label className="grid gap-1 font-semibold">
                  Planned price in Gems
                  <input
                    className={field}
                    type="number"
                    required
                    min={1}
                    max={1000000}
                    step={1}
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    disabled={busy}
                  />
                </label>
              ) : null}
              <fieldset>
                <legend className="mb-2 font-bold">Contents (choose 1–20 of your reviewed items)</legend>
                <div className="grid max-h-80 gap-2 overflow-y-auto">
                  {mine.items.map((item) => (
                    <label key={item.id} className="flex gap-3 rounded-xl bg-paper p-3">
                      <input
                        type="checkbox"
                        checked={ids.includes(item.id)}
                        disabled={busy || (!ids.includes(item.id) && ids.length >= 20)}
                        onChange={(event) =>
                          setIds((old) =>
                            event.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span>
                        {item.name}
                        <span className="block text-xs text-ink/60">
                          {item.kind} · {item.styles.join(', ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" disabled={busy || !ids.length}>
                {busy ? 'Saving…' : 'Save private draft'}
              </Button>
            </form>
          ) : (
            <div className="mb-8 rounded-2xl bg-surface p-5">
              <p className="mb-3">
                No reviewed items of your own yet. Upload a model or create an avatar look, then wait for
                review. Items you borrowed cannot be sold as your creations.
              </p>
              <ButtonLink href="/items" variant="secondary">
                Your items
              </ButtonLink>
            </div>
          )}
          {!embedded ? (
            <>
              <h2 className="mb-3 text-xl font-bold">Your marketplace drafts</h2>
              {mine.drafts.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {mine.drafts.map((draft) => (
                    <DraftCard key={draft.id} draft={draft} />
                  ))}
                </div>
              ) : (
                <p className="text-ink/60">No sale drafts yet.</p>
              )}
            </>
          ) : null}
        </>
      )}
      {!embedded ? (
        <div className="mt-6">
          <ButtonLink href="/market" variant="secondary">
            Back to marketplace
          </ButtonLink>
        </div>
      ) : null}
    </Frame>
  );
}

export function ShopDraftsPage({ placeId, embedded = false }: { placeId: string; embedded?: boolean }) {
  const { me, loading } = useMe('onboarded');
  const [mine, setMine] = useState<Mine | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try {
      const [mineResult, shopResult] = await Promise.all([
        api.GET('/v1/me/sale-drafts'),
        api.GET('/v1/experiences/{id}/shop-preview', { params: { path: { id: placeId } } }),
      ]);
      if (!shopResult.data) return setError(errorMessage(shopResult.error));
      if (!mineResult.data) return setError(errorMessage(mineResult.error));
      setMine(mineResult.data);
      setPreview(shopResult.data.drafts);
      setSelected(shopResult.data.drafts.map((draft) => draft.id));
    } catch {
      setError('Could not load this shop preview. Try again.');
    }
  }, [placeId]);
  useEffect(() => {
    if (me?.profile.onboarded) void load();
  }, [me, load]);
  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: failed } = await api.PUT('/v1/experiences/{id}/shop-preview', {
        params: { path: { id: placeId } },
        body: { draftIds: selected },
      });
      if (!data) return setError(errorMessage(failed));
      setPreview(data.drafts);
      setNotice('Shop preview saved. Only you can see it.');
    } catch {
      setError('Could not save this shop preview. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const Frame = embedded ? 'section' : Page;
  return (
    <Frame title={embedded ? undefined : 'Game shop'}>
      {embedded ? <h1 className="mb-4 text-2xl font-bold">Game shop</h1> : null}
      <p className="mb-4 text-ink/70">
        Manage this game's items here. Choose Free or a price in Gems for each product. This preparation is
        private; publishing and player purchases are not available yet.
      </p>
      <ErrorNote message={error} />
      {notice ? (
        <p role="status" className="my-4 font-semibold">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <Loading />
      ) : !mine ? (
        <Button className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      ) : (
        <>
          <Button variant="secondary" className="mb-4" onClick={() => setCreating(!creating)}>
            {creating ? 'Close item editor' : 'Add shop item'}
          </Button>
          {creating ? (
            <SaleDraftsPage
              embedded
              onSaved={() => {
                void load();
              }}
            />
          ) : null}
          <fieldset className="mb-4 grid gap-2">
            <legend className="mb-3 font-bold">Choose up to 20 drafts</legend>
            {mine.drafts.map((draft) => (
              <label key={draft.id} className="flex gap-3 rounded-xl bg-surface p-3">
                <input
                  type="checkbox"
                  checked={selected.includes(draft.id)}
                  disabled={busy || (!selected.includes(draft.id) && (!draft.ready || selected.length >= 20))}
                  onChange={(event) =>
                    setSelected((old) =>
                      event.target.checked ? [...old, draft.id] : old.filter((id) => id !== draft.id),
                    )
                  }
                />
                <span>
                  {draft.name} · {draft.priceCoins === 0 ? 'Free' : `${draft.priceCoins} Gems`}
                  {!draft.ready ? ' · Items need checking' : ''}
                </span>
              </label>
            ))}
          </fieldset>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save shop preview'}
          </Button>
          <h2 className="mt-8 mb-3 text-xl font-bold">Saved preview</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {preview.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </div>
        </>
      )}
      {!embedded ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/sell" variant="secondary">
            Prepare sale drafts
          </ButtonLink>
          <ButtonLink href={`/places/${placeId}`} variant="secondary">
            Back to place
          </ButtonLink>
        </div>
      ) : null}
    </Frame>
  );
}
