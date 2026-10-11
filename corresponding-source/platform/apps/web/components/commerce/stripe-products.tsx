'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FundingQuote, StripeTestShop } from '@genvr/contracts';
import { api, errorMessage } from '../../lib/api';
import type { ProductSandboxProps } from './product-sandbox';

const button = 'rounded-xl bg-ink px-4 py-2 font-bold text-paper disabled:opacity-40';
type Product = StripeTestShop['products'][number];

/** Production identifiers, isolated TEST money and server-verified receipt activation. */
export function StripeProducts({placeId, testing, online, grants, onRefresh, creatorControls = false}: ProductSandboxProps & {creatorControls?:boolean}) {
  const [shop,setShop] = useState<StripeTestShop|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [pending,setPending] = useState<Product|null>(null);
  const [fundConfirm,setFundConfirm] = useState(false);
  const [currency,setCurrency]=useState('eur');
  const [amount,setAmount]=useState('10');
  const [quote,setQuote]=useState<FundingQuote|null>(null);
  const [url,setUrl] = useState<string|null>(null);
  const request = useRef<string|null>(null);
  const fundRequest = useRef<string|null>(null);
  const load = useCallback(async () => {
    const {data,error:failed} = await api.GET('/v1/experiences/{id}/stripe-test/products',{params:{path:{id:placeId}}});
    if(!data)throw new Error(errorMessage(failed));
    setShop(data);
  },[placeId]);
  useEffect(() => {
    const refresh = () => void load().catch((e:unknown)=>setError(e instanceof Error?e.message:'Could not load Stripe Test.'));
    refresh();
    const timer = window.setInterval(refresh,4000);
    return () => window.clearInterval(timer);
  },[load]);
  const run = async (work:()=>Promise<void>) => {
    setBusy(true);setError(null);
    try { await work(); await load(); }
    catch(e) {setError(e instanceof Error?e.message:'Request failed.');}
    finally {setBusy(false);}
  };
  const bind = (p:Product) => run(async () => {
    const {data,error:failed} = await api.POST('/v1/experiences/{id}/stripe-test/products/{productId}/bind',{params:{path:{id:placeId,productId:p.id}},body:{}});
    if(!data)throw new Error(errorMessage(failed));
    setNotice('Production ID pinned to this script revision for Stripe Test.');
    onRefresh('stripe-test');
  });
  const purchase = () => run(async () => {
    if(!pending)return;
    request.current ??= crypto.randomUUID();
    const {data,error:failed} = await api.POST('/v1/experiences/{id}/stripe-test/purchases',{params:{path:{id:placeId}},body:{productId:pending.id,requestId:request.current}});
    if(!data)throw new Error(errorMessage(failed));
    setPending(null);request.current=null;
    onRefresh('stripe-test');setNotice('Test purchase verified. The game code receives this Production Product ID.');
  });
  const getQuote = () => run(async () => {
    fundRequest.current ??= crypto.randomUUID();
    const {data,error:failed} = await api.POST('/v1/experiences/{id}/stripe-test/funding-quote',{params:{path:{id:placeId}},body:{requestId:fundRequest.current,currency,amount}});
    if(!data)throw new Error(errorMessage(failed));
    setQuote(data);setFundConfirm(true);
  });
  const checkout = () => run(async () => {
    if(!quote)return;
    const {data,error:failed} = await api.POST('/v1/experiences/{id}/stripe-test/funding',{params:{path:{id:placeId}},body:{quoteId:quote.id}});
    if(!data)throw new Error(errorMessage(failed));
    setUrl(data.url);setFundConfirm(false);
  });
  return <section className="space-y-4">
    <h2 className="text-xl font-black">Production IDs · Stripe Test</h2>
    <p>Adult owner testing a private draft. No real money or payouts. Only fixed cosmetic skins are supported here.</p>
    {error && <p role="alert" className="break-words text-red-600">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {shop && <>
      <p className="font-bold">Test wallet: {shop.balance} Gems · Held test earnings: {shop.heldEarnings} Gems</p>
      <p>Test reference: €10 = 1000 Gems. Currency quotes use Stripe rates. The launch rate is undecided. Credit appears only after a verified paid webhook.</p>
      <fieldset className="rounded-xl bg-surface p-4 space-y-3" disabled={busy}>
        <legend className="font-bold">Fund test wallet</legend>
        <label className="block">Currency <select className="max-w-full rounded-lg bg-paper p-2" value={currency} onChange={e=>{setCurrency(e.target.value);setQuote(null);setFundConfirm(false);setUrl(null);fundRequest.current=null;}}>{shop.currencies.map(c=><option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>
        <div className="flex flex-wrap gap-2">{['10','25','100'].map(n=><button type="button" key={n} className={button} aria-pressed={amount===n} onClick={()=>{setAmount(n);setQuote(null);setFundConfirm(false);setUrl(null);fundRequest.current=null;}}>{n} {currency.toUpperCase()}</button>)}</div>
        <label className="block">Custom amount <input inputMode="decimal" className="w-full rounded-lg bg-paper p-2" value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);setFundConfirm(false);setUrl(null);fundRequest.current=null;}} /></label>
        <p>Stripe availability and minimum amounts depend on currency. Test limit: equivalent to €1–1000. The quote fixes your Gems and payment amount; settlement rates can change.</p>
        <button type="button" className={button} onClick={()=>void getQuote()}>Get Stripe quote</button>
      </fieldset>
      {fundConfirm && <div className="rounded-xl bg-surface p-4 space-y-3">
        <p>Confirm test checkout: {amount} {quote?.currency.toUpperCase()} for {quote?.gems} test Gems. Quote expires at {quote && new Date(quote.expiresAt).toLocaleTimeString()}. Use Stripe test payment details only.</p>
        <button type="button" className={button} disabled={busy||!quote||Date.parse(quote.expiresAt)<=Date.now()} onClick={()=>void checkout()}>Create Stripe Test checkout</button>{' '}
        <button type="button" className="underline" disabled={busy} onClick={()=>setFundConfirm(false)}>Cancel</button>
      </div>}
      {url && <a href={url} className="inline-block rounded-xl bg-ink p-3 font-bold text-paper">Open Stripe Test checkout</a>}
      {creatorControls && <p>Prepare a definition in Builder, add its Production ID to your game script, then bind the current revision. Stop Test before editing scripts.</p>}
      {shop.products.length===0 && <p>No prepared products yet.</p>}
      {shop.products.map(p=><article key={p.id} className="space-y-3 rounded-xl bg-surface p-4">
        <h3 className="font-bold">{p.name} · {p.priceGems===0?'Free':`${p.priceGems} Gems`}</h3>
        {creatorControls && <>
          <p className="break-all text-sm">Production Product ID: {p.id}</p>
          {p.activation==='script' && <pre className="overflow-auto rounded-lg bg-paper p-3 text-xs">{`genvr.onProduct("${p.id}", purchase => {\n  genvr.log("Product activated", purchase.productId);\n  genvr.activateProduct(purchase.receiptId);\n});`}</pre>}
          <p>{p.bound?'Current script revision bound.':'Current script revision needs binding.'}</p>
          <button type="button" className={button} disabled={busy||p.benefit.kind!=='skin'||p.bound} onClick={()=>void bind(p)}>Bind current script</button>{' '}
        </>}
        {!p.bound && <p>This product is not available yet.</p>}
        <button type="button" className={button} disabled={busy||!p.bound||!testing||!online} onClick={()=>{setPending(p);request.current=null;}}>{shop.receipts.some(r=>r.productId===p.id)?'Select owned skin':'Test purchase'}</button>
      </article>)}
      {pending && <div className="rounded-xl bg-surface p-4 space-y-3">
        <p>Confirm {pending.name}: {shop.receipts.some(r=>r.productId===pending.id)?'already owned, no new debit':`${pending.priceGems} test Gems`}. Platform share 30%, creator share 70% held. A refund or dispute removes affected test skins.</p>
        <button type="button" className={button} disabled={busy||!testing||!online} onClick={()=>void purchase()}>Confirm test purchase</button>{' '}
        <button type="button" className="underline" disabled={busy} onClick={()=>{setPending(null);request.current=null;}}>Cancel</button>
      </div>}
      <p role="status">{grants.skin?.mode==='stripe-test'?`Verified active test skin: ${grants.skin.name}`:'No active Stripe Test skin.'}</p>
      {(!testing||!online) && <p>Start Test and connect to activate the skin in this game.</p>}
    </>}
  </section>;
}
