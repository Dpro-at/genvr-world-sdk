'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Experience } from '../lib/types';
import { api, errorMessage } from '../lib/api';
import { Button, ErrorNote } from './ui';

export function RemixCredit({ origin }: { origin: Experience['remixOrigin'] }) {
  if (!origin) return null;
  return (
    <p className="text-sm text-ink/65">
      Original:{' '}
      <Link href={`/places/${origin.original.id}`} className="font-bold underline">
        {origin.original.title}
      </Link>
      {' by '}
      {origin.original.creatorName}.
      {origin.source.id !== origin.original.id ? (
        <>
          {' Based on '}
          <Link href={`/places/${origin.source.id}`} className="underline">
            {origin.source.title}
          </Link>
          {' by '}
          {origin.source.creatorName}.
        </>
      ) : null}
    </p>
  );
}

export function RemixAction({ place, signedIn }: { place: Experience; signedIn: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (place.isOwner || !place.allowRemixing || place.status !== 'published' || place.accessMode !== 'public')
    return null;
  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: failed } = await api.POST('/v1/experiences/{id}/remix', {
        params: { path: { id: place.id } },
      });
      if (data) router.push(`/places/${data.id}`);
      else setError(errorMessage(failed));
    } catch {
      setError('Could not create your remix. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col items-start gap-3">
      {!signedIn ? (
        <Link href="/login" className="rounded-xl bg-surface px-6 py-3 font-bold ring-1 ring-ink/10">
          Sign in to remix
        </Link>
      ) : confirm ? (
        <>
          <p className="max-w-sm text-sm text-ink/65">
            Create a private editable copy with credit to the original? Store items must be in your inventory.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy()} disabled={busy}>
              {busy ? 'Creating…' : 'Create private remix'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" className="px-6 py-3" onClick={() => setConfirm(true)}>
          Remix
        </Button>
      )}
      <ErrorNote message={error} />
    </div>
  );
}

export function PublicRemixes({ placeId, remixes }: { placeId: string; remixes: Experience['remixes'] }) {
  const [page, setPage] = useState(remixes);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!page) return null;
  const loadPage = async (next: number) => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: failed } = await api.GET('/v1/experiences/{id}', {
        params: { path: { id: placeId }, query: { remixOffset: next } },
      });
      if (data?.remixes) {
        setPage(data.remixes);
        setOffset(next);
      } else setError(errorMessage(failed));
    } catch {
      setError('Could not load servers. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 className="font-extrabold">Servers</h2>
      <p className="mt-1 text-sm text-ink/65">Published versions of this place by creators.</p>
      <p className="mt-1 text-sm text-ink/65">
        {page.count} {page.count === 1 ? 'remix' : 'remixes'} by {page.creators}{' '}
        {page.creators === 1 ? 'creator' : 'creators'}
      </p>
      {page.items.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {page.items.map((item) => (
            <li key={item.id} className="text-sm">
              <Link href={`/places/${item.id}`} className="font-bold underline">
                {item.title}
              </Link>
              {' by '}
              {item.creatorName}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink/55">No public remixes yet.</p>
      )}
      {offset > 0 || offset + page.items.length < page.count ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Server pages">
          <Button
            variant="secondary"
            disabled={busy || offset === 0}
            onClick={() => void loadPage(Math.max(0, offset - 12))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={busy || offset + page.items.length >= page.count}
            onClick={() => void loadPage(offset + 12)}
          >
            Next
          </Button>
        </div>
      ) : null}
      <ErrorNote message={error} />
    </section>
  );
}
