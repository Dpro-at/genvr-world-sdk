'use client';

import { useEffect, useState } from 'react';
import { ConnectTestStatus } from '@genvr/contracts';
import { API_URL } from '../../lib/api';
import { Button, Card, ErrorNote } from '../ui';

type Status = ReturnType<typeof ConnectTestStatus.parse>;
export function ConnectSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  async function read() {
    const r = await fetch(`${API_URL}/v1/me/connect-test`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('Could not load payout setup.');
    const s = ConnectTestStatus.parse(await r.json());
    setStatus(s);
  }
  useEffect(() => {
    read().catch((e) => setError(e.message));
  }, []);
  async function action(kind: 'onboarding' | 'refresh' | 'payout') {
    setBusy(true);
    setError(null);
    try {
      const id = status?.operation?.requestId ?? requestId ?? crypto.randomUUID();
      if (kind === 'payout') setRequestId(id!);
      const r = await fetch(`${API_URL}/v1/me/connect-test/${kind}`, {
        method: 'POST',
        credentials: 'include',
        ...(kind === 'payout'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }) }
          : {}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message ?? 'Stripe Test is unavailable.');
      if (kind === 'onboarding') {
        const url = new URL(body.url);
        if (url.protocol !== 'https:' || url.hostname !== 'connect.stripe.com')
          throw new Error('Invalid onboarding link.');
        window.location.assign(url.href);
      } else await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete Stripe Test setup.');
    } finally {
      setBusy(false);
    }
  }
  const ready = Boolean(
    status?.detailsSubmitted &&
    status.transfersActive &&
    status.payoutsEnabled &&
    !status.disabledReason &&
    !status.currentlyDue.length,
  );
  return (
    <Card className="space-y-3">
      <h3 className="font-extrabold">Creator payouts · Stripe Test</h3>
      <p className="text-sm text-ink/60">
        Connect a test recipient and check a simulated EUR1 transfer and bank payout. No real money moves, and
        your Gems balance is unchanged.
      </p>
      {error && <ErrorNote message={error} />}
      {!status ? (
        <p className="text-sm">Loading payout setup…</p>
      ) : !status.enabled ? (
        <p className="text-sm">Test setup is not enabled yet. Live payouts are not available.</p>
      ) : !status.eligible ? (
        <p className="text-sm">Test setup is limited to invited adult accounts in supported countries.</p>
      ) : (
        <>
          <p className="text-sm">
            {status.accountId
              ? ready
                ? 'Test recipient ready'
                : 'Complete Stripe verification'
              : 'No test account linked'}
          </p>
          {status.checkedAt && (
            <p className="text-xs text-ink/60">Last checked: {new Date(status.checkedAt).toLocaleString()}</p>
          )}
          {status.currentlyDue.length > 0 && (
            <p className="break-words text-xs text-ink/60">Stripe needs: {status.currentlyDue.join(', ')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => action('onboarding')}>
              {status.accountId ? 'Continue test setup' : 'Connect Stripe Test'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !status.accountId}
              onClick={() => action('refresh')}
            >
              Check Stripe status
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !ready || Boolean(status.operation?.payoutId)}
              onClick={() => action('payout')}
            >
              {status.operation ? 'Retry EUR1 test payout' : 'Confirm EUR1 test payout'}
            </Button>
          </div>
          {status.operation && (
            <p className="text-sm">
              EUR1 test: {status.operation.status}
              {status.operation.failureCode ? ` · ${status.operation.failureCode}` : ''}.{' '}
              {status.operation.payoutId ?? 'No bank payout confirmed yet.'}
            </p>
          )}
          <p className="text-xs text-ink/60">
            One diagnostic per creator. Returning from Stripe does not confirm verification or payment; use
            Check Stripe status.
          </p>
        </>
      )}
    </Card>
  );
}
