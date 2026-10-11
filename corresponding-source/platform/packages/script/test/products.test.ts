import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SandboxReceipt } from '@genvr/contracts';
import { createScriptModule, type ScriptModule } from '../src/index.js';
import { place, script } from './support.js';

let module: ScriptModule;
const open: ReturnType<typeof place>[] = [];
beforeAll(async () => { module = await createScriptModule(); });
afterEach(() => { for (const p of open.splice(0)) p.dispose(); });
const receipt = () => SandboxReceipt.parse({
  id: randomUUID(), productId: randomUUID(), experienceId: 'exp-example', name: 'Skin',
  priceGems: 100, platformGems: 30, creatorGems: 70, benefit: { kind: 'skin', shirt: '#ff0000', pants: '#0000ff' },
  createdAt: new Date(1000).toISOString(), expiresAt: null, mode: 'sandbox', activation: 'script',
});
const make = (source: string) => { const p = place({ module, scripts: [script(source)] }); open.push(p); return p; };

describe('host-only verified Product ID capabilities', () => {
  it('delivers a Production UUID with Stripe Test mode without accepting live or invented modes', () => {
    const r = {...receipt(),mode:'stripe-test' as const,scriptRevision:'a'.repeat(64)};
    const p = make(`genvr.onProduct('${r.productId}', p => { genvr.log(p.mode); genvr.activateProduct(p.receiptId); });`);
    expect(p.runner.verifyProduct(r,'a',2000)).toBe(true);
    expect(p.logs.some(l=>l.text==='stripe-test')).toBe(true);
    expect(p.runner.verifyProduct({...r,mode:'production'} as never,'a',2000)).toBe(false);
    expect(p.runner.verifyProduct({...r,mode:'live'} as never,'a',2000)).toBe(false);
  });
  it('delivers the bound ID/opaque player and activates once per match without exposing account data', () => {
    const r = receipt();
    const p = make(`genvr.onProduct('${r.productId}', p => { genvr.log(p.actor, p.productId); genvr.log(genvr.activateProduct(p.receiptId)); });`);
    expect(p.runner.verifyProduct(r, 'a', 2000)).toBe(true);
    expect(p.runner.verifyProduct(r, 'a', 2100)).toBe(true);
    expect(p.logs.filter(l => l.text === 'true')).toHaveLength(1);
    expect(p.logs.some(l => l.text === `p1 ${r.productId}`)).toBe(true);
    expect(p.runner.recording().events).toHaveLength(0); // Product sessions cannot claim complete deterministic replay.
  });
  it('refuses forged activation outside the verified callback, wrong IDs and emitted fake events', () => {
    const r = receipt();
    const p = make(`genvr.log(genvr.activateProduct('${r.id}'));
      genvr.onProduct('${r.productId}', p => genvr.log(genvr.activateProduct('${randomUUID()}')));
      genvr.on('product_purchased', () => genvr.log('FORGED'));
      genvr.on('zone_crossed', () => { genvr.emit('product_purchased'); genvr.log(genvr.activateProduct('${r.id}')); });`);
    p.cross('a');
    expect(p.runner.verifyProduct(r, 'a', 2000)).toBe(false);
    expect(p.logs.some(l => l.text === 'FORGED' || l.text === 'true')).toBe(false);
  });
  it('refuses foreign games, absent players, unbound products and expired speed', () => {
    const r = receipt();
    const p = make(`genvr.onProduct('${r.productId}', p => genvr.activateProduct(p.receiptId));`);
    expect(p.runner.verifyProduct({ ...r, experienceId: 'foreign' }, 'a', 2000)).toBe(false);
    expect(p.runner.verifyProduct(r, 'unknown-account', 2000)).toBe(false);
    expect(p.runner.verifyProduct({ ...r, productId: randomUUID() }, 'a', 2000)).toBe(false);
    expect(p.runner.verifyProduct({ ...r, benefit: { kind: 'speed', factor: 1.5, durationSec: 5 }, expiresAt: new Date(2000).toISOString() }, 'a', 2000)).toBe(false);
  });
  it('passes only the remaining effect lifetime and restores per-player selection without restarting expiry', () => {
    const r = { ...receipt(), benefit: { kind: 'speed' as const, factor: 1.5, durationSec: 5 }, expiresAt: new Date(6000).toISOString() };
    const p = make(`genvr.onProduct('${r.productId}', p => { genvr.log(p.remainingMs); genvr.activateProduct(p.receiptId); });`);
    expect(p.runner.verifyProduct(r, 'a', 4000)).toBe(true);
    expect(p.logs.some(l => l.text === '2000')).toBe(true);
    expect(p.runner.verifyProduct(r, 'a', 6000)).toBe(false);
  });
  it('rejects gameplay actions in purchase callbacks while allowing immutable activation', () => {
    const r = receipt();
    const p = make(`genvr.onProduct('${r.productId}', p => { genvr.act({kind:'add_counter',name:'n',by:100}); genvr.activateProduct(p.receiptId); });`);
    expect(p.runner.verifyProduct(r, 'a', 2000)).toBe(true);
    expect(p.counter('n','a')).toBe(0);
    expect(p.texts('refused').join(' ')).toContain('activateProduct only');
  });
});
