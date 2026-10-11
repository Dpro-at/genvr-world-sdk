'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Library,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addFreeAsset,
  browseFreeAssets,
  fetchSketchfabAccount,
  forgetSketchfab,
  FREE_SORTS,
  FreeAssetError,
  SKETCHFAB_SIGNED_IN,
  sketchfabSignInUrl,
  type FreeAsset,
  type FreePage,
  type FreeProvider,
  type FreeSort,
  type SketchfabAccount,
} from '../../lib/free-assets';
import type { StoreEntry } from '../../lib/store-items';

const PAGE_SIZE = 24;
const SORT_LABELS: Record<FreeSort, string> = { popular: 'Most used', newest: 'Newest', name: 'Name' };

type Tab = 'library' | FreeProvider;

/** The sources, one tab each; only the name differs (owner, 2026-10-06). */
const SOURCES: Array<{ provider: FreeProvider; name: string; note: string }> = [
  { provider: 'polyhaven', name: 'Poly Haven', note: 'Realistic scans, CC0' },
  { provider: 'kenney', name: 'Kenney', note: 'Low-poly kits, CC0' },
  { provider: 'sketchfab', name: 'Sketchfab', note: 'Huge library, CC0 and CC BY' },
];
const sourceName = (provider: string | undefined) =>
  SOURCES.find((source) => source.provider === provider)?.name ?? 'the source';

/** Opens Sketchfab's sign-in in its own small window, so the studio never reloads. */
const openSketchfabSignIn = () =>
  window.open(
    sketchfabSignInUrl(`${window.location.origin}/sources/signed-in`),
    'sketchfab-sign-in',
    'width=520,height=720',
  );

/**
 * The Free sources window (owner, 2026-10-06): every free outside model in one place, a tab per source (Poly Haven,
 * Kenney, Sketchfab) plus the models already in the library, with search, a kind filter, sorting and pages.
 * Pressing a model adds it to the library (once for everyone, with its source, licence and authors) and starts
 * placing it. Only free models are ever listed. Sketchfab gives its models only to signed-in people (its Download
 * API guidelines, 2026-10-07): the creator signs in once with their own Sketchfab account.
 */
export function FreeSourcesWindow({
  inLibrary,
  onPick,
  onClose,
}: {
  /** Library entries of outside models already added, by library id. */
  inLibrary: ReadonlyMap<string, StoreEntry>;
  /** Called with the library entry once the model is in the library. */
  onPick: (entry: StoreEntry, added: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('polyhaven');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<FreeSort>('popular');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FreePage | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [account, setAccount] = useState<SketchfabAccount | null>(null);
  /** The model to add once the creator has signed in with Sketchfab. */
  const [waiting, setWaiting] = useState<FreeAsset | null>(null);

  const loadAccount = useCallback(() => {
    fetchSketchfabAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);
  useEffect(() => {
    if (tab === 'sketchfab' && account === null) loadAccount();
  }, [tab, account, loadAccount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab === 'library') return;
    const controller = new AbortController();
    // Wait for the creator to stop typing before asking the source.
    const timer = setTimeout(() => {
      setError('');
      browseFreeAssets(
        { provider: tab, text: text.trim(), category, sort, page, limit: PAGE_SIZE },
        controller.signal,
      )
        .then(setResult)
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setResult(null);
          setError(caught instanceof Error ? caught.message : 'The free models cannot be loaded.');
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, text, category, sort, page]);

  // Models already in the library, filtered and paged here (they are already loaded).
  const library = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = [...inLibrary.values()].filter((entry) => {
      const haystack = [
        entry.manifest.name,
        entry.manifest.subcategory,
        ...(entry.manifest.origin?.authors ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
    all.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    return {
      entries: all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
      total: all.length,
      pages,
      page: current,
    };
  }, [inLibrary, text, page]);

  const pick = useCallback(
    async (asset: FreeAsset) => {
      const known = inLibrary.get(asset.itemId);
      if (known) {
        onPick(known, false);
        return;
      }
      setAdding(asset.assetId);
      setError('');
      try {
        onPick(await addFreeAsset(asset), true);
      } catch (caught) {
        if (caught instanceof FreeAssetError && caught.code === 'sign_in') {
          // Sign in first; then the model is added by itself.
          setWaiting(asset);
          setAccount((current) => (current ? { ...current, connected: false } : current));
          openSketchfabSignIn();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'This model could not be added.');
      } finally {
        setAdding(null);
      }
    },
    [inLibrary, onPick],
  );

  // The sign-in window says when Sketchfab is done.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; result?: string } | null;
      if (data?.type !== SKETCHFAB_SIGNED_IN) return;
      loadAccount();
      if (data.result !== 'connected') {
        setWaiting(null);
        setError('Sketchfab sign-in did not finish. Please try again.');
        return;
      }
      if (waiting) {
        setWaiting(null);
        void pick(waiting);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [waiting, pick, loadAccount]);

  const signOut = async () => {
    try {
      await forgetSketchfab();
    } finally {
      loadAccount();
    }
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setCategory('');
    setResult(null);
  };

  const total = tab !== 'library' ? (result?.total ?? 0) : library.total;
  const pages = tab !== 'library' ? (result?.pages ?? 1) : library.pages;
  const current = tab !== 'library' ? (result?.page ?? page) : library.page;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Free sources"
      className="fixed inset-0 z-50 flex bg-ink/40 p-0 text-ink sm:p-4 xl:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="mx-auto flex min-h-0 w-full max-w-6xl flex-col overflow-hidden bg-surface ring-1 ring-ink/10 sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <Globe className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black">Free sources</h2>
            <p className="truncate text-xs text-ink/60">
              Free models only. Each one keeps its source, licence and authors in your game.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex size-9 items-center justify-center rounded-xl hover:bg-ink/10"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Sources"
            role="tablist"
            className="flex shrink-0 gap-1 border-b border-ink/10 p-2 sm:w-48 sm:flex-col sm:border-r sm:border-b-0"
          >
            {SOURCES.map((source) => (
              <SourceTab
                key={source.provider}
                selected={tab === source.provider}
                onClick={() => changeTab(source.provider)}
                Icon={Globe}
                label={source.name}
                note={source.note}
              />
            ))}
            <SourceTab
              selected={tab === 'library'}
              onClick={() => changeTab('library')}
              Icon={Library}
              label="In my library"
              note={`${inLibrary.size} added`}
            />
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 p-2">
              <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl bg-paper px-2.5 py-2">
                <Search className="size-4 text-ink/50" aria-hidden />
                <input
                  value={text}
                  autoFocus
                  onChange={(event) => {
                    setText(event.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder={tab !== 'library' ? `Search ${sourceName(tab)}` : 'Search my free models'}
                  aria-label="Search free models"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
              </label>
              {tab !== 'library' ? (
                <>
                  <select
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setPage(1);
                    }}
                    aria-label="Kind"
                    className="rounded-xl bg-paper px-2.5 py-2 text-sm font-bold"
                  >
                    <option value="">All kinds</option>
                    {(result?.categories ?? []).map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {label(entry.name)}
                        {entry.count ? ` (${entry.count})` : ''}
                      </option>
                    ))}
                    {category && !result?.categories.some((entry) => entry.name === category) ? (
                      <option value={category}>{label(category)}</option>
                    ) : null}
                  </select>
                  <select
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as FreeSort);
                      setPage(1);
                    }}
                    aria-label="Sort"
                    className="rounded-xl bg-paper px-2.5 py-2 text-sm font-bold"
                  >
                    {FREE_SORTS.map((value) => (
                      <option key={value} value={value}>
                        {SORT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>

            {tab === 'sketchfab' ? (
              <SketchfabBar
                account={account}
                waiting={waiting !== null}
                onSignIn={() => openSketchfabSignIn()}
                onSignOut={() => void signOut()}
              />
            ) : null}

            {error ? (
              <p role="alert" className="px-3 pt-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tab !== 'library' && result === null && !error ? (
                <p className="flex items-center gap-2 p-4 text-sm text-ink/50">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Loading free models
                </p>
              ) : total === 0 && !error ? (
                <p className="p-4 text-sm text-ink/50">
                  {tab === 'library'
                    ? 'No free model is in the library yet. Add one from a source.'
                    : 'No free model matches.'}
                </p>
              ) : null}
              <ul className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {tab !== 'library'
                  ? result?.assets.map((asset) => (
                      <li key={asset.assetId}>
                        <Card
                          picture={asset.picture}
                          name={asset.name}
                          authors={asset.authors}
                          license={asset.license}
                          page={asset.page}
                          source={sourceName(asset.provider)}
                          state={
                            adding === asset.assetId
                              ? 'adding'
                              : inLibrary.has(asset.itemId)
                                ? 'added'
                                : 'new'
                          }
                          disabled={adding !== null}
                          onPick={() => void pick(asset)}
                        />
                      </li>
                    ))
                  : library.entries.map((entry) => (
                      <li key={entry.manifest.id}>
                        <Card
                          picture={entry.picture}
                          name={entry.manifest.name}
                          authors={entry.manifest.origin?.authors ?? []}
                          license={entry.manifest.license}
                          page={entry.manifest.origin?.page}
                          source={sourceName(entry.manifest.origin?.provider)}
                          state="added"
                          disabled={false}
                          onPick={() => onPick(entry, false)}
                        />
                      </li>
                    ))}
              </ul>
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-ink/10 px-3 py-2 text-xs">
              <span className="text-ink/60">
                {total.toLocaleString()}
                {tab !== 'library' && result?.exact === false ? '+' : ''} {total === 1 ? 'model' : 'models'}
                {tab !== 'library' ? ` from ${sourceName(tab)}` : ' in the library'}
              </span>
              <Pager page={current} pages={pages} onPage={setPage} />
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}

/** A source's group as a label ("decorative" -> "Decorative", "nature-plants" -> "Nature plants"). */
const label = (name: string) => {
  const words = /^[a-z0-9-]+$/.test(name) ? name.replace(/-/g, ' ') : name;
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Sketchfab's line above its models: who is signed in, or the button to sign in, and the credit Sketchfab asks
 * for (its models keep their authors and licences, and players see them in the game's Help).
 */
function SketchfabBar({
  account,
  waiting,
  onSignIn,
  onSignOut,
}: {
  account: SketchfabAccount | null;
  waiting: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 px-3 py-2 text-xs">
      <p className="min-w-0 flex-1 basis-60 text-ink/60">
        Models from Sketchfab. Each keeps its author and licence, and players see them in Help.
        {account && !account.available
          ? ' Adding them is not set up on this server yet; you can open them on Sketchfab.'
          : account && !account.connected
            ? ' Sketchfab gives its models to signed-in people: sign in once with your free Sketchfab account.'
            : ''}
      </p>
      {account?.available && !account.connected ? (
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-bold text-on-brand"
        >
          {waiting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <LogIn className="size-3.5" aria-hidden />
          )}
          {waiting ? 'Waiting for Sketchfab' : 'Sign in with Sketchfab'}
        </button>
      ) : null}
      {account?.connected ? (
        <span className="inline-flex items-center gap-1.5 font-semibold">
          Signed in{account.username ? ` as ${account.username}` : ''}
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out of Sketchfab"
            title="Sign out of Sketchfab"
            className="rounded-lg p-1 hover:bg-ink/10"
          >
            <LogOut className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : null}
    </div>
  );
}

function SourceTab({
  selected,
  onClick,
  Icon,
  label: text,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  Icon: typeof Globe;
  label: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left sm:flex-none ${
        selected ? 'bg-ink text-on-brand' : 'hover:bg-ink/5'
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{text}</span>
        <span className={`block truncate text-[11px] ${selected ? 'text-on-brand/70' : 'text-ink/50'}`}>
          {note}
        </span>
      </span>
    </button>
  );
}

function Card({
  picture,
  name,
  authors,
  license,
  page,
  source,
  state,
  disabled,
  onPick,
}: {
  picture: string | null;
  name: string;
  authors: string[];
  license: string;
  page: string | undefined;
  /** The source's name, for its link. */
  source: string;
  state: 'new' | 'adding' | 'added';
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-paper">
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        title={state === 'added' ? `Place ${name}` : `Add ${name} to the library and place it`}
        className="group flex flex-1 flex-col text-left disabled:opacity-60"
      >
        <span className="relative flex aspect-square items-center justify-center bg-surface/60">
          {picture ? (
            <img
              src={picture}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-contain p-2"
            />
          ) : null}
          <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-black uppercase">
            {state === 'adding' ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : state === 'added' ? (
              <Check className="size-3" aria-hidden />
            ) : (
              <Plus className="size-3" aria-hidden />
            )}
            {state === 'adding' ? 'Adding' : state === 'added' ? 'In library' : 'Free'}
          </span>
        </span>
        <span className="px-2 pt-1.5 text-sm font-bold group-hover:underline">
          <span className="line-clamp-1">{name}</span>
        </span>
      </button>
      <span className="flex items-center gap-1 px-2 pb-1.5 text-[11px] text-ink/60">
        <span className="min-w-0 flex-1 truncate">
          {license}
          {authors.length ? `, ${authors.join(', ')}` : ''}
        </span>
        {page ? (
          <a
            href={page}
            target="_blank"
            rel="noreferrer"
            aria-label={`${name} on ${source}`}
            title={`Open on ${source}`}
            className="shrink-0 rounded p-0.5 hover:bg-ink/10"
          >
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </span>
    </div>
  );
}

/** Page numbers around the current page, with the first and last always shown. */
function pageList(page: number, pages: number): Array<number | 'gap'> {
  const shown = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...shown].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="ml-auto flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
        className="flex size-8 items-center justify-center rounded-lg hover:bg-ink/10 disabled:opacity-30"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      {pageList(page, pages).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-ink/40">
            ...
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            aria-current={entry === page ? 'page' : undefined}
            onClick={() => onPage(entry)}
            className={`min-w-8 rounded-lg px-2 py-1.5 font-bold ${
              entry === page ? 'bg-ink text-on-brand' : 'hover:bg-ink/10'
            }`}
          >
            {entry}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
        className="flex size-8 items-center justify-center rounded-lg hover:bg-ink/10 disabled:opacity-30"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

/** The source line of an item taken from a free outside source: link, licence and authors. */
export function OriginLine({
  origin,
}: {
  origin: { provider: string; page: string; license: string; authors: string[] };
}) {
  return (
    <>
      <dt className="mt-1.5 font-bold text-ink/50">Source</dt>
      <dd>
        <a
          href={origin.page}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          {sourceName(origin.provider)} <ExternalLink className="size-3" aria-hidden />
        </a>
        , {origin.license}
        {origin.authors.length ? `, by ${origin.authors.join(', ')}` : ''}
      </dd>
    </>
  );
}
