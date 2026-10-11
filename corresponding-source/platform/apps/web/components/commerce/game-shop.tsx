'use client';

import { useEffect, useRef, useState } from 'react';
import { ProductSandbox, type ProductSandboxProps } from './product-sandbox';
import { StripeProducts } from './stripe-products';

/** Native focus trap over the same mounted canvas; the play page pauses movement while open. */
export function GameShopDialog({ onClose, ...props }: ProductSandboxProps & { onClose: () => void }) {
  const [mode, setMode] = useState<'sandbox' | 'stripe-test'>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('stripeTest') ? 'stripe-test' : 'sandbox');
  const refresh = useRef(props.onRefresh);
  refresh.current = props.onRefresh;
  useEffect(() => { refresh.current(mode); }, [mode, props.testing, props.online]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dialog.current?.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);
  return (
    <dialog
      ref={dialog}
      aria-label="Game shop"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl bg-paper p-5 text-ink shadow-2xl backdrop:bg-black/60"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button type="button" onClick={onClose} className="mb-4 font-bold underline">
        Close shop
      </button>
      <div className="mb-4 flex flex-wrap gap-3" aria-label="Payment test mode">
        <button type="button" aria-pressed={mode === 'sandbox'} onClick={() => setMode('sandbox')} className="rounded-xl bg-surface p-3 font-bold">Sandbox</button>
        <button type="button" aria-pressed={mode === 'stripe-test'} onClick={() => setMode('stripe-test')} className="rounded-xl bg-surface p-3 font-bold">Production IDs · Stripe Test</button>
      </div>
      {mode === 'sandbox' ? <ProductSandbox {...props} /> : <StripeProducts {...props} />}
    </dialog>
  );
}
