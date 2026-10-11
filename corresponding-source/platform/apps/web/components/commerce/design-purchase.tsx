'use client';
import { useEffect, useRef, useState } from 'react';
import type { FundingQuote } from '@genvr/contracts';
import { api, errorMessage } from '../../lib/api';
const zeroMinorCurrencies = new Set('bif clp djf gnf jpy kmf krw mga pyg rwf vnd vuv xaf xof xpf'.split(' '));
const quotePrice = (q: FundingQuote) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: q.currency.toUpperCase() }).format(
    q.amountMinor / (zeroMinorCurrencies.has(q.currency) ? 1 : 100),
  );
const button = 'rounded-xl bg-ink px-4 py-3 font-bold text-paper disabled:opacity-40';
type Checkout = {
  enabled: boolean;
  owned: boolean;
  balance: number;
  contentHash: string | null;
  priceGems: number;
  designs: { name: string }[];
  worlds: { id: string; title: string }[];
};
/** Explicit consent and price/version pinning; no client value can grant a design. */
export function DesignPurchase({ itemId }: { itemId: string }) {
  const [info, setInfo] = useState<Checkout | null>(null),
    [world, setWorld] = useState(''),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [owned, setOwned] = useState(false);
  const [currency, setCurrency] = useState('eur'),
    [currencies, setCurrencies] = useState(['eur']),
    [amount, setAmount] = useState('10'),
    [quote, setQuote] = useState<FundingQuote | null>(null),
    [url, setUrl] = useState<string | null>(null);
  const purchase = useRef<string | null>(null),
    funding = useRef<string | null>(null);
  const refresh = async () => {
    const { data, error: failed } = await api.GET('/v1/items/{id}/design-checkout', {
      params: { path: { id: itemId } },
    });
    if (!data) throw new Error(errorMessage(failed));
    setInfo(data);
    setOwned(data.owned);
    setWorld((w) => (data.worlds.some((p) => p.id === w) ? w : (data.worlds[0]?.id ?? '')));
  };
  useEffect(() => {
    let active = true;
    void api.GET('/v1/items/{id}/design-checkout', { params: { path: { id: itemId } } }).then(({ data }) => {
      if (active && data) {
        setInfo(data);
        setOwned(data.owned);
        setWorld(data.worlds[0]?.id ?? '');
      }
    });
    return () => {
      active = false;
    };
  }, [itemId]);
  useEffect(() => {
    if (!world || !info?.enabled) return;
    void api
      .GET('/v1/experiences/{id}/stripe-test/products', { params: { path: { id: world } } })
      .then(({ data }) => {
        if (data) setCurrencies(data.currencies);
      });
  }, [world, info?.enabled]);
  useEffect(() => {
    const reload = () => void refresh().catch(() => {});
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [itemId]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };
  if (!info)
    return (
      <p className="text-sm text-ink/60">
        Sign in to check design purchase availability. Live design checkout is unavailable.
      </p>
    );
  if (!info.enabled)
    return (
      <p className="text-sm text-ink/60">
        Design checkout is currently limited to adult Stripe Test accounts with a private draft world. Live
        purchases are unavailable.
      </p>
    );
  const resetQuote = () => {
    setQuote(null);
    setUrl(null);
    funding.current = null;
  };
  return (
    <section className="space-y-3 rounded-2xl bg-paper p-4 ring-1 ring-ink/10">
      <h3 className="font-black">Get this design · Stripe Test</h3>
      <p className="text-xs text-ink/60">
        A world-use license. The creator keeps authorship. No resale, transfer or live payouts. Test designs
        stay in your private draft worlds.
      </p>
      <ul className="list-inside list-disc text-sm">
        {info.designs.map((d, i) => (
          <li key={i}>{d.name}</li>
        ))}
      </ul>
      <p className="font-bold">
        {info.designs.length} usable {info.designs.length === 1 ? 'design' : 'designs'} ·{' '}
        {info.priceGems.toLocaleString()} Test Gems total
      </p>
      <p className="text-sm">Test wallet: {info.balance.toLocaleString()} Gems</p>
      <label className="block text-sm">
        Your private Test world
        <select
          className="mt-1 w-full rounded-lg bg-surface p-2"
          value={world}
          disabled={busy}
          onChange={(e) => {
            setWorld(e.target.value);
            setConfirm(false);
            purchase.current = null;
            resetQuote();
          }}
        >
          {info.worlds.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {owned ? (
        <div role="status" className="space-y-2">
          <p>Delivered to your Builder library. Open your private world to place each purchased design.</p>
          <a className={button} href={`/places/${world}/play`}>
            Open my world
          </a>
        </div>
      ) : confirm ? (
        <div className="space-y-3 rounded-xl bg-surface p-3">
          <p>
            Confirm {info.priceGems} Test Gems for {info.designs.length}{' '}
            {info.designs.length === 1 ? 'design' : 'designs'}. Your remaining balance will be{' '}
            {info.balance - info.priceGems} Gems.
          </p>
          <button
            type="button"
            className={button}
            disabled={busy || info.balance < info.priceGems}
            onClick={() =>
              void run(async () => {
                purchase.current ??= crypto.randomUUID();
                const { data, error: failed } = await api.POST('/v1/items/{id}/design-purchases', {
                  params: { path: { id: itemId } },
                  body: {
                    requestId: purchase.current,
                    experienceId: world,
                    contentHash: info.contentHash!,
                    priceGems: info.priceGems,
                  },
                });
                if (!data) throw new Error(errorMessage(failed));
                setOwned(true);
                setConfirm(false);
              })
            }
          >
            {busy ? 'Verifying…' : 'Confirm Test purchase'}
          </button>
          <button type="button" className="ml-3 underline" disabled={busy} onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={button}
          disabled={busy || info.balance < info.priceGems || !info.contentHash}
          onClick={() => setConfirm(true)}
        >
          Review purchase
        </button>
      )}
      {!owned && (
        <details className="rounded-xl bg-surface p-3">
          <summary className="cursor-pointer font-bold">Fund Test wallet</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs">
              €10 = 1000 Test Gems reference. Stripe supplies currency rates; review the exact quote before
              Checkout. Test payment details only.
            </p>
            <label className="block text-sm">
              Currency
              <select
                className="ml-2 rounded-lg bg-paper p-2"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  resetQuote();
                }}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              {['10', '25', '100'].map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={amount === n}
                  className="rounded-lg bg-paper p-2 ring-1 ring-ink/15"
                  onClick={() => {
                    setAmount(n);
                    resetQuote();
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              Custom amount
              <input
                inputMode="decimal"
                className="mt-1 w-full rounded-lg bg-paper p-2"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  resetQuote();
                }}
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  funding.current ??= crypto.randomUUID();
                  const { data, error: failed } = await api.POST(
                    '/v1/experiences/{id}/stripe-test/funding-quote',
                    {
                      params: { path: { id: world } },
                      body: { requestId: funding.current, currency, amount },
                    },
                  );
                  if (!data) throw new Error(errorMessage(failed));
                  setQuote(data);
                })
              }
            >
              Review Stripe quote
            </button>
            {quote && (
              <div className="space-y-2">
                <p>
                  {quotePrice(quote)} → {quote.gems} Test Gems · Expires{' '}
                  {new Date(quote.expiresAt).toLocaleTimeString()}
                </p>
                <button
                  type="button"
                  className={button}
                  disabled={busy || Date.parse(quote.expiresAt) <= Date.now()}
                  onClick={() =>
                    void run(async () => {
                      const { data, error: failed } = await api.POST(
                        '/v1/experiences/{id}/stripe-test/funding',
                        { params: { path: { id: world } }, body: { quoteId: quote.id } },
                      );
                      if (!data) throw new Error(errorMessage(failed));
                      setUrl(data.url);
                    })
                  }
                >
                  Create Test checkout
                </button>
              </div>
            )}
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="block underline">
                Open Stripe Test checkout
              </a>
            )}
            <button
              type="button"
              className="block underline"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              Refresh wallet after payment
            </button>
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
