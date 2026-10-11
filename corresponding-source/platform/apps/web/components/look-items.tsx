'use client';

import { findBody } from '@genvr/core-library';
import { AvatarLook, readAvatarLook, readAvatarProfile, type AvatarProfile } from '@genvr/contracts';
import { Check, Clock, Send, Shirt, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { setSavedAvatarLook } from '../lib/avatar-look';

type Rating = 'like' | 'dislike';
type StoreLook = {
  id: string;
  name: string;
  author: string;
  look: AvatarLook;
  likes: number;
  dislikes: number;
};
type MyLook = {
  id: string;
  name: string;
  mine: boolean;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'removed';
  look: AvatarLook;
  rating: Rating | null;
};

const COLOR_PARTS = ['skin', 'hair', 'shirt', 'pants', 'shoes'] as const;

/** A look's five colors as small swatches, and its body. */
function LookSwatches({ look }: { look: AvatarLook }) {
  return (
    <span className="flex items-center gap-1">
      {COLOR_PARTS.map((part) => (
        <span
          key={part}
          className="size-3.5 rounded-[5px] ring-1 ring-ink/15"
          style={{ background: look[part] }}
          aria-hidden
        />
      ))}
      <span className="ml-1 truncate text-[11px] text-ink/50">{findBody(look.body).manifest.name}</span>
    </span>
  );
}

const STATUS_TEXT: Record<MyLook['status'], string> = {
  draft: 'Draft',
  in_review: 'Out of the store: a moderator asked for a change',
  approved: 'In the store',
  rejected: 'Taken out by a moderator',
  removed: 'Removed',
};

/**
 * The avatar panel's Looks tab (look items, spec 2026-10-03): wear a look from the store (a look made only of Genvr's
 * bodies, sizes, colors and wearables; wearing it writes it into your own look for its body), see your own looks
 * and their review, and publish the look you wear now as a store item.
 */
export function LookItems({ current }: { current: AvatarProfile }) {
  const { data: session, isPending } = authClient.useSession();
  const [store, setStore] = useState<StoreLook[] | null>(null);
  const [mine, setMine] = useState<MyLook[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const [catalog, owned] = await Promise.all([
      api.GET('/v1/catalog/items', {
        params: { query: { type: 'avatar', subcategory: 'looks', limit: 50 } },
      }),
      api.GET('/v1/me/looks'),
    ]);
    setStore(
      (catalog.data?.items ?? []).flatMap((item) =>
        item.manifest.look
          ? [
              {
                id: item.id,
                name: item.manifest.name,
                author: item.manifest.author.name,
                look: readAvatarLook(item.manifest.look),
                likes: item.likes,
                dislikes: item.dislikes,
              },
            ]
          : [],
      ),
    );
    setMine((owned.data?.looks ?? []).map((one) => ({ ...one, look: readAvatarLook(one.look) })));
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (isPending) return null;
  if (!session)
    return (
      <p className="text-xs text-ink/60">Sign in to wear looks from the store and to publish your own.</p>
    );

  const wear = async (id: string, owned: boolean) => {
    setBusy(id);
    setNote(null);
    try {
      if (!owned) {
        const got = await api.POST('/v1/items/{id}/get', { params: { path: { id } } });
        if (!got.data) throw new Error(errorMessage(got.error));
      }
      const worn = await api.POST('/v1/me/avatar/looks/{id}', { params: { path: { id } } });
      if (!worn.data) throw new Error(errorMessage(worn.error));
      setSavedAvatarLook(readAvatarProfile(worn.data));
      setNote({ text: 'You wear this look now.', bad: false });
      void load();
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : 'The look could not be worn.', bad: true });
    }
    setBusy(null);
  };

  /** Like or dislike a look you own (the same choice again takes it back). */
  const rate = async (item: StoreLook, value: Rating, current: Rating | null) => {
    setBusy(item.id);
    setNote(null);
    const next = current === value ? null : value;
    const { data, error } = await api.PUT('/v1/items/{id}/rating', {
      params: { path: { id: item.id } },
      body: { value: next },
    });
    setBusy(null);
    if (!data) {
      setNote({ text: errorMessage(error), bad: true });
      return;
    }
    setStore(
      (list) =>
        list?.map((one) =>
          one.id === item.id ? { ...one, likes: data.likes, dislikes: data.dislikes } : one,
        ) ?? null,
    );
    setMine((list) => list.map((one) => (one.id === item.id ? { ...one, rating: data.mine } : one)));
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || name.trim().length === 0) return;
    setBusy('publish');
    setNote(null);
    // The worn look only: the looks kept for other bodies stay private. A mesh body wears no items, so items kept
    // in the saved look (invisible on it) are left out.
    const look = AvatarLook.parse({ ...current, wear: findBody(current.body).model ? [] : current.wear });
    const { data, error } = await api.POST('/v1/looks', { body: { name: name.trim(), look } });
    setBusy(null);
    if (!data) {
      setNote({ text: errorMessage(error), bad: true });
      return;
    }
    setName('');
    setNote({ text: 'Published: it is in the store now. Moderators check every look after.', bad: false });
    void load();
  };

  const ownedIds = new Set(mine.map((one) => one.id));
  const myOwn = new Set(mine.filter((one) => one.mine).map((one) => one.id));
  const myRating = new Map(mine.map((one) => [one.id, one.rating]));
  const own = mine.filter((one) => one.mine);

  return (
    <div className="flex flex-col gap-3">
      {note ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-bold ${note.bad ? 'bg-coral/15 text-coral' : 'bg-paper text-ink/70'}`}
        >
          {note.text}
        </p>
      ) : null}

      <section aria-labelledby="store-looks" className="flex flex-col gap-1.5">
        <h3 id="store-looks" className="text-xs font-black tracking-wide text-ink/50 uppercase">
          Looks from the store
        </h3>
        {store === null ? (
          <p className="text-xs text-ink/50">Loading…</p>
        ) : store.length === 0 ? (
          <p className="text-xs text-ink/60">No looks in the store yet. Publish yours below.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {store.map((item) => (
              <li key={item.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{item.name}</span>
                  <span className="block truncate text-[11px] text-ink/50">by {item.author}</span>
                  <LookSwatches look={item.look} />
                  <RatingButtons
                    item={item}
                    mine={myRating.get(item.id) ?? null}
                    canRate={ownedIds.has(item.id) && !myOwn.has(item.id)}
                    own={myOwn.has(item.id)}
                    busy={busy !== null}
                    onRate={(value, current) => void rate(item, value, current)}
                  />
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void wear(item.id, ownedIds.has(item.id))}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-ink px-3 text-xs font-bold text-on-brand disabled:opacity-40"
                >
                  <Shirt className="size-3.5" aria-hidden />
                  Wear
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {own.length > 0 ? (
        <section aria-labelledby="my-looks" className="flex flex-col gap-1.5">
          <h3 id="my-looks" className="text-xs font-black tracking-wide text-ink/50 uppercase">
            My looks
          </h3>
          <ul className="flex flex-col gap-1.5">
            {own.map((item) => {
              const Icon = item.status === 'approved' ? Check : item.status === 'rejected' ? XCircle : Clock;
              return (
                <li
                  key={item.id}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.name}</span>
                    <span
                      className={`flex items-center gap-1 text-[11px] ${item.status === 'rejected' ? 'font-bold text-coral' : 'text-ink/50'}`}
                    >
                      <Icon className="size-3" aria-hidden />
                      {STATUS_TEXT[item.status]}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void wear(item.id, true)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-ink/10 px-3 text-xs font-bold disabled:opacity-40"
                  >
                    <Shirt className="size-3.5" aria-hidden />
                    Wear
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <form
        onSubmit={(event) => void publish(event)}
        className="flex flex-col gap-1.5"
        aria-labelledby="publish-look"
      >
        <h3 id="publish-look" className="text-xs font-black tracking-wide text-ink/50 uppercase">
          Publish my look
        </h3>
        <p className="text-xs text-ink/60">
          The look you wear now goes to the store for everyone, free, right away.
        </p>
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Name of the look"
            aria-label="Name of the look"
            className="h-10 min-w-0 flex-1 rounded-xl bg-paper px-3 text-sm"
          />
          <button
            type="submit"
            disabled={busy !== null || name.trim().length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-ink px-3 text-xs font-bold text-on-brand disabled:opacity-40"
          >
            <Send className="size-3.5" aria-hidden />
            Publish
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Like and dislike with their counts (item ratings): only on looks you own and did not make; the same choice again
 * takes it back.
 */
function RatingButtons({
  item,
  mine,
  canRate,
  own,
  busy,
  onRate,
}: {
  item: StoreLook;
  mine: Rating | null;
  canRate: boolean;
  own: boolean;
  busy: boolean;
  onRate: (value: Rating, current: Rating | null) => void;
}) {
  const hint = own ? 'Your own look' : canRate ? undefined : 'Wear it first to rate it';
  const button = (value: Rating, count: number, Icon: typeof ThumbsUp, label: string) => (
    <button
      type="button"
      disabled={!canRate || busy}
      aria-pressed={mine === value}
      aria-label={`${label} (${count})`}
      title={hint ?? label}
      onClick={() => onRate(value, mine)}
      className={`inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-bold disabled:cursor-default ${
        mine === value ? 'bg-ink text-on-brand' : 'text-ink/60 enabled:hover:bg-ink/10'
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {count}
    </button>
  );
  return (
    <span className="mt-0.5 flex items-center gap-1">
      {button('like', item.likes, ThumbsUp, 'Like')}
      {button('dislike', item.dislikes, ThumbsDown, 'Dislike')}
      {hint ? <span className="truncate text-[10px] text-ink/40">{hint}</span> : null}
    </span>
  );
}
