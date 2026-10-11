'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderSVG } from 'uqr';
import { API_URL } from '../lib/api';
import { Button } from './ui';

type Asked = { code: string; poll: string; expiresAt: string };

/** A fresh code comes every 60 seconds by itself; after this many the device stops and offers a button. */
const MAX_CODES = 10;

const post = (path: string, body?: unknown) =>
  fetch(`${API_URL}/api/auth/qr/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

/**
 * Sign in on this device with a code or QR code (owner N-147, N-151): shows a six-digit code and its QR code, renewed
 * every 60 seconds, and waits until a phone or computer that is already signed in approves it at /link. Then this
 * device is signed in to the same account. It is for existing accounts only; new accounts sign up with Google.
 */
export function QrSignIn({
  onSignedIn,
  browserSignIn = false,
}: {
  onSignedIn: () => void;
  browserSignIn?: boolean;
}) {
  const [asked, setAsked] = useState<Asked | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const made = useRef(0);
  // The parent may pass a new function on every render; the polling must not restart because of it.
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  const ask = async (fresh = false) => {
    if (fresh) made.current = 0;
    made.current++;
    setError(null);
    setExpired(false);
    const response = await post('start').catch(() => null);
    if (!response?.ok) {
      setError('Could not make a code. Please try again.');
      return;
    }
    setAsked((await response.json()) as Asked);
  };

  useEffect(() => {
    void ask();
  }, []);

  // When a code runs out, show the next one by itself (up to MAX_CODES, then wait for a click).
  useEffect(() => {
    if (expired && made.current < MAX_CODES) void ask();
  }, [expired]);

  // Ask every two seconds whether the code was approved; stop when it ran out.
  useEffect(() => {
    if (!asked || expired) return;
    const timer = window.setInterval(async () => {
      setNow(Date.now());
      if (Date.parse(asked.expiresAt) < Date.now()) {
        setExpired(true);
        return;
      }
      const response = await post('poll', { code: asked.code, poll: asked.poll }).catch(() => null);
      if (!response?.ok) return;
      const { status } = (await response.json()) as { status: 'pending' | 'approved' | 'expired' };
      if (status === 'approved') {
        window.clearInterval(timer);
        signedIn.current();
      } else if (status === 'expired') setExpired(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [asked, expired]);

  const link = asked ? `${window.location.origin}/link?code=${asked.code}` : '';
  const svg = useMemo(() => (link ? renderSVG(link, { border: 2 }) : ''), [link]);
  const left = asked ? Math.max(0, Math.round((Date.parse(asked.expiresAt) - now) / 1000)) : 0;

  if (error)
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm font-semibold text-coral">{error}</p>
        <Button variant="secondary" onClick={() => ask(true)}>
          Try again
        </Button>
      </div>
    );

  if (!asked) return <p className="text-center text-sm text-ink/60">Making a code…</p>;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {expired ? (
        <>
          <p className="text-sm text-ink/70">This code ran out.</p>
          <Button variant="secondary" onClick={() => ask(true)}>
            Make a new code
          </Button>
        </>
      ) : (
        <>
          {/* The QR code stays black on white in both themes, so every camera reads it. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt={`QR code for ${link}`}
            className="size-48 rounded-2xl bg-white p-2"
          />
          <p className="font-mono text-4xl font-black tracking-[0.25em]">
            {asked.code.slice(0, 3)} {asked.code.slice(3)}
          </p>
          {browserSignIn ? (
            <a
              href={`/browser-sign-in?code=${asked.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Sign in in your browser
            </a>
          ) : null}
          <ol className="flex flex-col gap-1 text-sm text-ink/70">
            <li>1. On your phone, scan the QR code with the camera.</li>
            <li>
              2. Or open <span className="font-semibold text-ink">{window.location.host}/link</span> and type
              the code.
            </li>
            <li>3. Approve there. This device signs in by itself.</li>
          </ol>
          <p className="text-xs text-ink/50">A new code comes in {left} s.</p>
        </>
      )}
    </div>
  );
}
