'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { SandboxBenefit, ProductGrantState } from '@genvr/contracts';

import { api, errorMessage } from '../../lib/api';

type Paths = import('@genvr/api-client').paths;

type Shop =
  Paths['/v1/experiences/{id}/sandbox/products']['get']['responses'][200]['content']['application/json'];

type Product = Shop['products'][number];

const field = 'w-full rounded-xl bg-surface p-2 ring-1 ring-ink/20';

const button = 'rounded-xl bg-ink px-4 py-2 font-bold text-paper disabled:opacity-40';

export type ProductSandboxProps = {
  placeId: string;
  testing: boolean;
  online: boolean;
  grants: ProductGrantState;
  onRefresh(mode?: 'sandbox' | 'stripe-test'): boolean;
};

/** Private simulated purchases. The room applies only receipts verified by the API. */

export function ProductSandbox({ placeId, testing, online, grants, onRefresh, creatorControls=false }: ProductSandboxProps & {creatorControls?:boolean}) {
  const [shop, setShop] = useState<Shop | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');

  const [kind, setKind] = useState<'skin' | 'speed'>('skin');

  const [price, setPrice] = useState('100');

  const [paid, setPaid] = useState(false);

  const [shirt, setShirt] = useState('#ff2255');

  const [pants, setPants] = useState('#2233ff');

  const [factor, setFactor] = useState('1.5');

  const [duration, setDuration] = useState('30');

  const [busy, setBusy] = useState(false);
  const [activation, setActivation] = useState<'automatic' | 'script'>('automatic');

  const [pending, setPending] = useState<Product | null>(null);

  const requestKey = useRef<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: failed } = await api.GET('/v1/experiences/{id}/sandbox/products', {
      params: { path: { id: placeId } },
    });

    if (!data) throw new Error(errorMessage(failed));

    setShop(data);
  }, [placeId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load Sandbox.'));
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const benefit: SandboxBenefit =
      kind === 'skin'
        ? { kind, shirt, pants }
        : { kind, factor: Number(factor), durationSec: Number(duration) };

    try {
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/sandbox/products', {
        params: { path: { id: placeId } },
        body: { name, priceGems: paid ? Number(price) : 0, benefit, activation },
      });

      if (!data) throw new Error(errorMessage(failed));

      setName('');
      setNotice(`Created Product ID ${data.id}. Bound to this game.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create product.');
    } finally {
      setBusy(false);
    }
  };

  const prepareProduction = async (product: Product) => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/sandbox/products/{productId}/prepare-production', {
        params: { path: { id: placeId, productId: product.id } }, body: {},
      });
      if (!data) throw new Error(errorMessage(failed));
      setNotice(`Production ID ${data.id} prepared. No test purchases or balance copied. Checkout is disabled.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare production.'); }
    finally { setBusy(false); }
  };

  const buy = async () => {
    if (!pending || !testing || !online) return;

    setBusy(true);
    setError(null);

    requestKey.current ??= crypto.randomUUID();

    try {
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/sandbox/purchases', {
        params: { path: { id: placeId } },
        body: { productId: pending.id, requestKey: requestKey.current },
      });

      if (!data) throw new Error(errorMessage(failed));

      setNotice(
        `Test receipt ${data.receipt.id}. ${data.balance} test Gems left. Waiting for the room to verify the benefit.`,
      );

      setPending(null);
      requestKey.current = null;
      await load();
      onRefresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Purchase could not be confirmed. Retry uses the same request ID.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Game products · Sandbox</h1>

      <p>
        Private draft games only. Start Test while connected and alone to preview a purchase. No real money or
        creator payout. Test receipts and Gems never transfer to production.
      </p>

      <p className="font-bold">
        {shop ? `${shop.balance} test Gems` : 'Loading test balance…'} · Game: {placeId}
      </p>

      {!testing || !online ? <p role="status">Start Test and connect to the room before buying.</p> : null}

      {error ? (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="break-all">
          {notice}
        </p>
      ) : null}

      <div role="status" className="rounded-xl bg-surface p-3">
        Verified in Test: {grants.skin ? `skin ${grants.skin.name} · ${grants.skin.productId}` : 'no skin'};{' '}
        {grants.speed
          ? `speed ${grants.speed.benefit.kind === 'speed' ? grants.speed.benefit.factor : 1}× until ${grants.speed.expiresAt}`
          : 'normal speed'}
        .
      </div>

      {creatorControls && <form onSubmit={(event) => void create(event)} className="space-y-3 rounded-2xl bg-surface p-4">
        <h2 className="font-bold">Create a test product</h2>

        <label className="block">
          Product name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>

        <label className="block">
          Benefit
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="skin">Skin · shirt and pants colours</option>
            <option value="speed">Temporary speed effect</option>
          </select>
        </label>

        <label className="block">
          Activation
          <select className={field} value={activation} onChange={(e) => setActivation(e.target.value as typeof activation)}>
            <option value="automatic">Automatic verified benefit</option>
            <option value="script">Game script · onProduct</option>
          </select>
        </label>

        {kind === 'skin' ? (
          <div className="flex gap-4">
            <label>
              Shirt colour
              <input type="color" value={shirt} onChange={(e) => setShirt(e.target.value)} />
            </label>
            <label>
              Pants colour
              <input type="color" value={pants} onChange={(e) => setPants(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Speed multiplier
              <input
                className={field}
                type="number"
                min="1.1"
                max="2"
                step="0.1"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                required
              />
            </label>
            <label>
              Duration (seconds)
              <input
                className={field}
                type="number"
                min="5"
                max="60"
                step="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                required
              />
            </label>
          </div>
        )}

        <label className="block">
          Price type
          <select
            className={field}
            value={paid ? 'paid' : 'free'}
            onChange={(e) => setPaid(e.target.value === 'paid')}
          >
            <option value="free">Free</option>
            <option value="paid">Paid · test Gems</option>
          </select>
        </label>

        {paid ? (
          <label className="block">
            Test Gems price
            <input
              className={field}
              type="number"
              min="1"
              max="1000"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
        ) : null}

        <button className={button} disabled={busy || !shop}>
          Create Product ID
        </button>
      </form>}

      <h2 className="font-bold">Products in this game</h2>

      {shop?.products.map((p) => {
        const owned = p.benefit.kind === 'skin' && shop.receipts.some((r) => r.productId === p.id);

        const active = grants.speed?.productId === p.id;

        return (
          <article className="space-y-2 rounded-2xl bg-surface p-4" key={p.id}>
            <h3 className="font-bold">
              {p.name} · {p.priceGems === 0 ? 'Free' : `${p.priceGems} test Gems`}
            </h3>

            <p>
              {p.benefit.kind === 'skin'
                ? `Colour skin: ${p.benefit.shirt} / ${p.benefit.pants}. Choose an owned skin to preview it in Test.`
                : `Speed ${p.benefit.factor}× for ${p.benefit.durationSec}s from purchase. No stacking.`}
            </p>

            <label className="block">
              Product ID
              <input className={field} readOnly value={p.id} />
            </label>

            {p.activation === 'script' ? (
              <label className="block">
                Add this binding to an enabled game script in Builder → Scripts, then start Test
                <textarea className={field} rows={5} readOnly aria-label={`Activation code for ${p.name}`}
                  value={`genvr.onProduct('${p.id}', (purchase) => {\n  if (genvr.activateProduct(purchase.receiptId)) {\n    genvr.log('Product active', purchase.productId);\n  }\n});`} />
              </label>
            ) : null}

            {shop.preparedProducts.find(prepared => prepared.sourceProductId === p.id) ? (
              <label className="block">Production ID · prepared, checkout disabled
                <input className={field} readOnly value={shop.preparedProducts.find(prepared => prepared.sourceProductId === p.id)!.id} />
              </label>
            ) : null}

            {creatorControls && <button className="block underline disabled:opacity-40" disabled={busy || (p.benefit.kind === 'speed' && p.priceGems > 0)} onClick={() => void prepareProduction(p)}>
              Prepare production definition
            </button>}
            <p className="text-sm">Copies the fixed definition and script revision only. Test funds and receipts stay in Sandbox. Paid speed cannot be prepared.</p>

            <button
              className={button}
              disabled={busy || !testing || !online || active}
              onClick={() => {
                requestKey.current = null;
                setPending(p);
                setError(null);
              }}
            >
              {owned ? 'Preview owned skin' : active ? 'Active in Test' : 'Try purchase'}
            </button>
          </article>
        );
      })}

      {pending ? (
        <section aria-label="Confirm test purchase" className="space-y-3 rounded-2xl p-4 ring-2 ring-ink">
          <p>
            Confirm {pending.name} for{' '}
            {pending.benefit.kind === 'skin' && shop?.receipts.some((r) => r.productId === pending.id)
              ? 'no extra charge · already owned'
              : pending.priceGems === 0
                ? 'Free'
                : `${pending.priceGems} test Gems`}
            ? Fixed benefit; nothing random.
          </p>

          <button className={button} disabled={busy || !testing || !online} onClick={() => void buy()}>
            Confirm test purchase
          </button>

          <button
            className="ml-3 underline"
            disabled={busy}
            onClick={() => {
              setPending(null);
              requestKey.current = null;
            }}
          >
            Cancel
          </button>
        </section>
      ) : null}

      <p className="text-sm">
        Production checkout requires the financial ledger and review gates. Game scripts activate only the
        fixed benefit verified by the server; stopping Test restores your usual avatar and speed.
      </p>
    </section>
  );
}
