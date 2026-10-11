'use client';

import { defaultPlaySettings, type PlaySettings } from '@genvr/contracts';
import { ArrowLeft, Sprout } from 'lucide-react';
import { useState } from 'react';
import { PlaySettingsPicker } from './play-settings';
import { Badge, ErrorNote, Page } from './ui-content';
import { UPCOMING_STYLE_CARDS } from '../lib/create-card-images';
import { STYLE_CARDS, styleName, type StyleId } from '../lib/styles';
import { WORLD_KIND_CARDS, type WorldKind } from '../lib/world-kinds';

/**
 * Development mode: creating a place asks for the style (docs/CREATOR-FLOW.md) and, with sensible
 * defaults already chosen, how it is played (P9-15). A Realistic place then asks which kind of
 * starter world it begins as. Every ready style offers a small library garden or no placed items;
 * Realistic also keeps its existing generated world kinds.
 */
export interface CreationOptions { style: StyleId; worldKind: WorldKind | 'small'; play: PlaySettings }

export function CreateFlow({ onCreate, onImport }: {
  onCreate: (options: CreationOptions) => Promise<void>;
  onImport: () => void;
}) {
  const [busy, setBusy] = useState<StyleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [play, setPlay] = useState<PlaySettings>(() => defaultPlaySettings());
  const [choosingStyle, setChoosingStyle] = useState<StyleId | null>(null);
  const [busyKind, setBusyKind] = useState<WorldKind | 'small' | null>(null);

  const create = async (style: StyleId, worldKind: WorldKind | 'small') => {
    setBusy(style);
    setBusyKind(worldKind ?? null);
    setError(null);
    try {
      await onCreate({ style, worldKind, play });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create this place.');
    } finally {
      setBusy(null);
      setBusyKind(null);
    }
  };

  if (choosingStyle)
    return (
      <Page title={`${styleName(choosingStyle)} world`}>
        <p className="-mt-4 mb-8 text-ink/60">
          Start with a small garden made from our library in your chosen style, or build from scratch. Your
          place stays private. You can move, change, or remove every item later.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              id: 'small' as const,
              name: 'Small starter',
              description:
                'A small open garden with trees, rocks, benches, and flowers. Room for your own ideas.',
              Icon: Sprout,
            },
            ...WORLD_KIND_CARDS.filter((card) => choosingStyle === 'realistic' || card.id === 'empty').map(
              (card) =>
                card.id === 'empty'
                  ? {
                      ...card,
                      description:
                        choosingStyle === 'voxel'
                          ? 'Generated cube terrain with no placed items. Build everything yourself.'
                          : 'Flat ground with no placed items. Build everything yourself.',
                    }
                  : card,
            ),
          ].map((card) => (
            <button
              key={card.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void create(choosingStyle, card.id)}
              className="group overflow-hidden rounded-[var(--radius-card)] bg-surface text-left shadow-sm ring-1 ring-ink/5 transition hover:-translate-y-1 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="flex aspect-[16/7] w-full items-center justify-center bg-ink/5 text-ink/70">
                <card.Icon className="size-16" aria-hidden strokeWidth={1.5} />
              </div>
              <div className="flex items-start justify-between gap-3 p-5">
                <div>
                  <h2 className="text-xl font-extrabold">{card.name}</h2>
                  <p className="text-sm text-ink/60">{card.description}</p>
                </div>
                {busyKind === card.id ? <Badge tone="good">Creating…</Badge> : null}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setError(null);
            setChoosingStyle(null);
          }}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink/70 hover:bg-ink/5 hover:text-ink disabled:opacity-50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to styles
        </button>
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      </Page>
    );

  return (
    <Page title="Pick a style">
      <p className="-mt-4 mb-8 text-ink/60">
        Your new place starts private. You can name it and invite friends later.
      </p>
      <section className="mb-8 rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-ink/5">
        <h2 className="mb-1 text-lg font-extrabold">How it is played</h2>
        <p className="mb-4 text-sm text-ink/60">
          Choose first, then pick a style. You can change this later in the place settings.
        </p>
        <PlaySettingsPicker value={play} onChange={setPlay} disabled={busy !== null} />
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ...STYLE_CARDS.map((card) => ({
            ...card,
            pick: () => {
              setError(null);
              setChoosingStyle(card.id);
            },
          })),
          // Styles on their way (Flat cartoon): shown so creators see what is coming.
          ...UPCOMING_STYLE_CARDS.map((card) => ({ ...card, ready: false, pick: () => undefined })),
        ].map((card) => (
          <button
            key={card.id}
            type="button"
            disabled={!card.ready || busy !== null}
            onClick={card.pick}
            className="group overflow-hidden rounded-[var(--radius-card)] bg-surface text-left shadow-sm ring-1 ring-ink/5 transition hover:-translate-y-1 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
          >
            {/* The same lake scene in every look, so the cards differ only in style (P9-17). */}
            <img
              src={card.image}
              alt=""
              width={512}
              height={512}
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="flex items-start justify-between gap-3 p-5">
              <div>
                <h2 className="text-xl font-extrabold">{card.name}</h2>
                <p className="text-sm text-ink/60">{card.description}</p>
              </div>
              {card.ready ? (
                busy === card.id ? (
                  <Badge tone="good">Creating…</Badge>
                ) : null
              ) : (
                <Badge>Soon</Badge>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6">
        <ErrorNote message={error} />
        <button type="button" onClick={onImport} className="mt-4 rounded-lg border border-ink/20 px-4 py-2 font-bold">Import a saved world</button>
      </div>
    </Page>
  );
}
