'use client';

import {
  Game,
  GAME_LIMITS,
  MAX_PLACE_GENRES,
  newGame,
  readPlaceAvatar,
  SIZE_TIERS,
  type SizeTier,
  type CommandPayload,
  type PlaceBlockLook,
  type PlaceGenre,
  type PlayerBuilding,
  type PlaySettings,
  type WorldDocument,
} from '@genvr/contracts';
import { BLOCK_PIXELS, getBlock, getLibraryItem, zoneShapeOfItem } from '@genvr/core-library';
import {
  Box,
  Check,
  ExternalLink,
  Gamepad2,
  Globe,
  Image as ImageIcon,
  Info,
  Lock,
  PersonStanding,
  Smartphone,
  Store,
  Trash,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Experience } from '../lib/types';
import { PlaceCollaborators } from './place-collaborators';
import { PlacePictures } from './place-pictures';
import { PlaySettingsPicker } from './play-settings';
import { PlaceAvatarSettings } from './place-avatar-settings';
import { RulesEditor } from './rules-editor';
import { ScriptsPanel } from './scripts-panel';
import { rideTags, zoneTags } from '../lib/rules-edit';

type Section =
  'basic' | 'pictures' | 'play' | 'game' | 'blocks' | 'avatars' | 'available' | 'people' | 'remixing' | 'access';

const SIZE_ORDER = ['small', 'medium', 'large', 'huge', 'max'] as const satisfies readonly SizeTier[];
const SIZE_LABELS: Record<SizeTier, string> = { small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge', max: 'Biggest' };
const sizeText = (metres: number) => (metres >= 1000 ? `${metres / 1000} km` : `${metres} m`);

const SECTIONS: Array<{ id: Section; label: string; Icon: LucideIcon }> = [
  { id: 'basic', label: 'Basic info', Icon: Info },
  { id: 'pictures', label: 'Pictures', Icon: ImageIcon },
  { id: 'play', label: 'How it is played', Icon: Smartphone },
  { id: 'game', label: 'Game', Icon: Gamepad2 },
  { id: 'blocks', label: 'Blocks', Icon: Box },
  { id: 'avatars', label: 'Avatars', Icon: PersonStanding },
  { id: 'available', label: 'Where it is available', Icon: Store },
  { id: 'people', label: 'Collaborators', Icon: Users },
  { id: 'remixing', label: 'Remixing', Icon: Globe },
  { id: 'access', label: 'Access and publishing', Icon: Lock },
];

export const GENRE_LABELS: Record<PlaceGenre, string> = {
  obby: 'Obby and parkour',
  arcade: 'Arcade',
  shooter: 'Shooter',
  fighting: 'Fighting',
  racing: 'Racing and driving',
  'open-city': 'Open city and roleplay',
  adventure: 'Adventure and story',
  rpg: 'RPG',
  simulator: 'Simulator and tycoon',
  survival: 'Survival',
  horror: 'Horror',
  puzzle: 'Puzzle',
  'tower-defense': 'Tower defense',
  sports: 'Sports',
  party: 'Party and minigames',
  sandbox: 'Sandbox and building',
  social: 'Social hangout',
  music: 'Music and rhythm',
  educational: 'Educational',
};

const KINDS: Array<[Experience['type'], string]> = [
  ['game', 'Game'],
  ['social', 'Hangout'],
  ['event', 'Event'],
];

const ACCESS_LABELS: Record<Experience['accessMode'], string> = {
  private: 'Only you and your builders',
  friends: 'Friends',
  invite: 'People with an invite link',
  password: 'People with the password',
  public: 'Everyone',
  subscription: 'Subscribers',
  class: 'A class',
};

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-35 ${
    on ? 'bg-ink text-on-brand' : 'bg-ink/5 text-ink hover:bg-ink/10'
  }`;

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="text-sm text-ink/60">{hint}</p>
    </div>
  );
}

const BLOCK_LOOKS: Array<{ id: PlaceBlockLook; label: string; hint: string }> = [
  { id: 'plain', label: 'Clean', hint: 'Smooth colors; light and shadow show the shapes.' },
  { id: 'pixel', label: 'Pixel', hint: 'Small pixel pictures on every block.' },
];

/** Faces shown in the block look previews: grass from above and the side, sand, stone, bricks. */
const PREVIEW_FACES = [
  ['grass', 'top'],
  ['grass', 'side'],
  ['sand', 'top'],
  ['stone', 'side'],
  ['cobble', 'side'],
] as const;

/** One block face drawn from the Core Library block pictures, as an image URL. */
function faceImage(block: string, face: 'top' | 'side', look: PlaceBlockLook): string | null {
  const pictures = getBlock(block)?.look;
  if (!pictures || typeof document === 'undefined') return null;
  const pixels = look === 'plain' ? pictures.plain[face] : pictures[face];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BLOCK_PIXELS;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(BLOCK_PIXELS, BLOCK_PIXELS);
  pixels.forEach((color, i) => {
    image.data.set([(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 255], i * 4);
  });
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/** The block look (decision 110): clean or pixel blocks, with a few faces of each to compare. */
function BlockLookPicker({
  value,
  onChange,
}: {
  value: PlaceBlockLook;
  onChange: (look: PlaceBlockLook) => void;
}) {
  const previews = useMemo(
    () =>
      Object.fromEntries(
        BLOCK_LOOKS.map(({ id }) => [id, PREVIEW_FACES.map(([block, face]) => faceImage(block, face, id))]),
      ) as Record<PlaceBlockLook, Array<string | null>>,
    [],
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BLOCK_LOOKS.map((entry) => {
        const on = value === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(entry.id)}
            className={`flex flex-col gap-3 rounded-2xl p-4 text-left ring-2 transition ${
              on ? 'bg-paper ring-ink' : 'bg-paper ring-transparent hover:ring-ink/20'
            }`}
          >
            <div className="flex gap-1.5" aria-hidden>
              {previews[entry.id].map((src, i) =>
                src ? (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="size-10 rounded-md [image-rendering:pixelated] sm:size-11"
                  />
                ) : null,
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black">{entry.label}</p>
                <p className="text-xs text-ink/60">{entry.hint}</p>
              </div>
              {on ? <Check className="size-4 shrink-0" aria-hidden /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const BUILD_WHO: Array<[PlayerBuilding['who'], string]> = [
  ['everyone', 'Everyone'],
  ['invited', 'Invited players'],
  ['nobody', 'Nobody'],
];
const BUILD_SAVING: Array<[PlayerBuilding['saving'], string]> = [
  ['reset', 'Clears when everyone leaves'],
  ['saved', 'Stays in the place'],
];
const BUILD_SHARES = [500, 1000, 2000, 5000, 10_000];

/** Building with the avatar's hands (decision 109): who may, what happens to it, each share. */
function PlayerBuildingPicker({
  value,
  onChange,
}: {
  value: PlayerBuilding;
  onChange: (next: PlayerBuilding) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Who may build">
        <div className="flex flex-wrap gap-1.5">
          {BUILD_WHO.map(([who, label]) => (
            <button
              key={who}
              type="button"
              aria-pressed={value.who === who}
              onClick={() => onChange({ ...value, who })}
              className={chip(value.who === who)}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      {value.who !== 'nobody' ? (
        <>
          <Field label="Their blocks">
            <div className="flex flex-wrap gap-1.5">
              {BUILD_SAVING.map(([saving, label]) => (
                <button
                  key={saving}
                  type="button"
                  aria-pressed={value.saving === saving}
                  onClick={() => onChange({ ...value, saving })}
                  className={chip(value.saving === saving)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Blocks per player">
            <div className="flex flex-wrap gap-1.5">
              {BUILD_SHARES.map((share) => (
                <button
                  key={share}
                  type="button"
                  aria-pressed={value.share === share}
                  onClick={() => onChange({ ...value, share })}
                  className={chip(value.share === share)}
                >
                  {share.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </Field>
        </>
      ) : null}
      <p className="text-xs text-ink/50">
        You and your builders always may. Players cannot dig your own building or build near the start point.
      </p>
    </div>
  );
}

type PlayerBuilder = { userId: string; name: string; blocks: number };

/**
 * Who built with their hands and how much (decision 109, P2-28 stage 3): the owner removes one
 * player's building in one step, in open rooms and in the saved blocks.
 */
function PlayerBuilders({ placeId, saving }: { placeId: string; saving: PlayerBuilding['saving'] }) {
  const [list, setList] = useState<{ builders: PlayerBuilder[]; rooms: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: failed } = await api.GET('/v1/experiences/{id}/player-builders', {
      params: { path: { id: placeId } },
    });
    if (data) setList(data);
    else setError(errorMessage(failed));
  }, [placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (builder: PlayerBuilder) => {
    if (!window.confirm(`Remove all ${builder.blocks.toLocaleString('en-US')} blocks ${builder.name} built?`))
      return;
    setError(null);
    setBusy(builder.userId);
    const { error: failed } = await api.DELETE('/v1/experiences/{id}/player-builders/{userId}', {
      params: { path: { id: placeId, userId: builder.userId } },
    });
    setBusy(null);
    if (failed) setError(errorMessage(failed));
    await load();
  };

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">Who built here</h4>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
      ) : null}
      {!list ? null : list.builders.length === 0 ? (
        <p className="text-sm text-ink/60">Nobody has built here yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.builders.map((builder) => (
            <li key={builder.userId} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{builder.name}</span>
              <span className="shrink-0 text-xs font-bold text-ink/50">
                {builder.blocks.toLocaleString('en-US')} {builder.blocks === 1 ? 'block' : 'blocks'}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void remove(builder)}
                aria-label={`Remove the blocks ${builder.name} built`}
                title="Remove all their blocks"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-coral hover:bg-coral/10 disabled:opacity-50"
              >
                <Trash className="size-4" aria-hidden />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink/50">
        {list?.rooms === null
          ? 'The game server could not be asked, so blocks in open rooms are not counted.'
          : saving === 'reset'
            ? 'Blocks clear when everyone leaves, so this shows the rooms that are open now.'
            : 'Removing takes the blocks away for everyone at once, also in open rooms.'}
      </p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-black tracking-wide text-ink/50 uppercase">{label}</span>
      {children}
    </label>
  );
}

/** Chips of the Game section: 44 px high on phones. */
const gameChip = (on: boolean) => `${chip(on)} min-h-11 sm:min-h-0`;

/** A number field that saves on Enter or when leaving it, kept within its limits and step. */
function GameNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const commit = (input: HTMLInputElement) => {
    const typed = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(typed)) {
      input.value = String(value);
      return;
    }
    const next = Math.min(max, Math.max(min, Math.round(typed / step) * step));
    input.value = String(next);
    if (next !== value) onCommit(next);
  };
  return (
    <span className="flex items-center gap-2">
      <input
        key={value}
        type="number"
        inputMode="decimal"
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget);
        }}
        className="min-h-11 w-28 rounded-xl bg-paper px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50 sm:min-h-0"
      />
      <span className="text-sm text-ink/60">{unit}</span>
    </span>
  );
}

/**
 * The place's game (P9-12, decision 117): on or off, teams, match length, the other generic
 * settings, the rules editor (counters, rules, ranking, HUD displays) and the place's scripts
 * (P2-10). The game and the scripts are part of the world document, so this loads the world and
 * saves `set_game` and `set_script` commands with its version. After the save the API asks the
 * place's open rooms to reload the place, and they restart the match with the new rules and
 * scripts; an open studio reloads too.
 */
function GameSettings({
  placeId,
  onSaved,
  onError,
}: {
  placeId: string;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [world, setWorld] = useState<{
    version: number;
    doc: WorldDocument;
    game: Game | null;
    tags: string[];
    rideTags: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Why the world could not be loaded (shown with a Retry button instead of the settings). */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error: failed } = await api.GET('/v1/experiences/{id}/world', {
        params: { path: { id: placeId } },
      });
      if (data)
        setWorld({
          version: data.world.version,
          doc: data.world as WorldDocument,
          game: data.world.game ?? null,
          tags: zoneTags(data.world.instances, zoneShapeOfItem),
          rideTags: rideTags(data.world.instances, (id) => getLibraryItem(id)?.manifest.ride),
        });
      else setLoadError(errorMessage(failed, 'The game settings could not be loaded.'));
    } catch {
      setLoadError('The game settings could not be loaded. Check the connection.');
    }
  }, [placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves commands with the loaded version; the new version, or null. A conflict loads the place again. */
  const send = async (commands: CommandPayload[]): Promise<number | null> => {
    if (!world) return null;
    let result;
    try {
      result = await api.POST('/v1/experiences/{id}/commands', {
        params: { path: { id: placeId } },
        body: { baseVersion: world.version, commands },
      });
    } catch {
      result = null;
    }
    if (!result) {
      onError('The change could not be saved. Check the connection.');
      return null;
    }
    const { data, error: failed, response } = result;
    if (data) {
      onSaved();
      return data.version;
    }
    if (response.status === 409) {
      await load();
      onError('Changed elsewhere, try again');
    } else onError(errorMessage(failed));
    return null;
  };

  /** Saves the game as one `set_game` command; true when it was saved. */
  const saveGame = async (next: Game | null): Promise<boolean> => {
    if (!world || busy) return false;
    let game = next;
    if (game) {
      const checked = Game.safeParse(game);
      if (!checked.success) {
        onError('That setting is outside what a game allows.');
        return false;
      }
      game = checked.data;
    }
    onError(null);
    setBusy(true);
    const before = world;
    setWorld({ ...world, game });
    const version = await send([{ type: 'set_game', params: { game } }]);
    setBusy(false);
    if (version === null) setWorld((current) => (current?.version === before.version ? before : current));
    else
      setWorld((current) => {
        if (!current) return current;
        const doc = { ...current.doc };
        if (game) doc.game = game;
        else delete doc.game;
        return { ...current, version, doc };
      });
    return version !== null;
  };

  /** Saves script commands (the Scripts list and editor) and keeps the loaded place in step. */
  const saveScripts = async (commands: CommandPayload[]): Promise<boolean> => {
    if (!world) return false;
    onError(null);
    const version = await send(commands);
    if (version !== null)
      setWorld((current) => {
        if (!current) return current;
        let scripts = [...(current.doc.scripts ?? [])];
        for (const command of commands) {
          if (command.type !== 'set_script') continue;
          const { scriptId, script } = command.params;
          const at = scripts.findIndex((one) => one.id === scriptId);
          if (!script) scripts = scripts.filter((one) => one.id !== scriptId);
          else if (at >= 0) scripts[at] = { id: scriptId, ...script };
          else scripts.push({ id: scriptId, ...script });
        }
        return { ...current, version, doc: { ...current.doc, scripts } };
      });
    return version !== null;
  };

  if (loadError)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-coral">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-on-brand hover:opacity-90 sm:min-h-0"
        >
          Retry
        </button>
      </div>
    );
  if (!world) return <p className="text-sm text-ink/60">Loading…</p>;
  const game = world.game;
  const change = (update: (current: Game) => Game) => {
    if (game) void saveGame(update(game));
  };
  const teams = game?.teams ?? { mode: 'none' as const, friendlyFire: false };
  const goal = game?.score?.goal ?? null;
  const scoreFrom = game?.score?.from ?? 'kills';

  return (
    <div className="flex flex-col gap-5">
      <Field label="Game">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              [false, 'Off'],
              [true, 'On'],
            ] as const
          ).map(([on, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={Boolean(game) === on}
              disabled={busy}
              onClick={() => {
                if (Boolean(game) === on) return;
                void saveGame(on ? newGame() : null);
              }}
              className={gameChip(Boolean(game) === on)}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      {game ? (
        <>
          <Field label="Teams">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['none', 'Off'],
                  ['two', 'Two teams'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={teams.mode === mode}
                  disabled={busy}
                  onClick={() => change((current) => ({ ...current, teams: { ...teams, mode } }))}
                  className={gameChip(teams.mode === mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          {teams.mode === 'two' ? (
            <Field label="Friendly fire">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    [false, 'Off'],
                    [true, 'On: team mates can hit each other'],
                  ] as const
                ).map(([friendlyFire, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={teams.friendlyFire === friendlyFire}
                    disabled={busy}
                    onClick={() => change((current) => ({ ...current, teams: { ...teams, friendlyFire } }))}
                    className={gameChip(teams.friendlyFire === friendlyFire)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
          <Field label="Match length">
            <GameNumber
              label="Match length in minutes"
              value={game.match.durationSec / 60}
              min={GAME_LIMITS.durationSec.min / 60}
              max={GAME_LIMITS.durationSec.max / 60}
              step={0.5}
              unit="minutes"
              disabled={busy}
              onCommit={(minutes) =>
                change((current) => ({
                  ...current,
                  match: { ...current.match, durationSec: Math.round(minutes * 60) },
                }))
              }
            />
          </Field>
          <Field label="Players to start">
            <GameNumber
              label="Players to start"
              value={game.match.minPlayers}
              min={GAME_LIMITS.minPlayers.min}
              max={GAME_LIMITS.minPlayers.max}
              unit="players"
              disabled={busy}
              onCommit={(minPlayers) =>
                change((current) => ({ ...current, match: { ...current.match, minPlayers } }))
              }
            />
          </Field>
          <Field label="Health">
            <GameNumber
              label="Health"
              value={game.health?.max ?? 100}
              min={GAME_LIMITS.health.min}
              max={GAME_LIMITS.health.max}
              unit="points"
              disabled={busy}
              onCommit={(max) => change((current) => ({ ...current, health: { max } }))}
            />
          </Field>
          <Field label="Back in">
            <GameNumber
              label="Back in, seconds after being knocked out"
              value={game.respawn?.delaySec ?? 3}
              min={GAME_LIMITS.respawnDelaySec.min}
              max={GAME_LIMITS.respawnDelaySec.max}
              unit="seconds"
              disabled={busy}
              onCommit={(delaySec) =>
                change((current) => ({
                  ...current,
                  respawn: { delaySec, protectSec: current.respawn?.protectSec ?? 2 },
                }))
              }
            />
          </Field>
          <Field label="Score to win">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={goal === null}
                disabled={busy}
                onClick={() =>
                  goal !== null && change((current) => ({ ...current, score: { from: scoreFrom } }))
                }
                className={gameChip(goal === null)}
              >
                Off
              </button>
              <button
                type="button"
                aria-pressed={goal !== null}
                disabled={busy}
                onClick={() =>
                  goal === null && change((current) => ({ ...current, score: { from: scoreFrom, goal: 10 } }))
                }
                className={gameChip(goal !== null)}
              >
                First to a score
              </button>
              {goal !== null ? (
                <GameNumber
                  label="Score to win"
                  value={goal}
                  min={GAME_LIMITS.scoreGoal.min}
                  max={GAME_LIMITS.scoreGoal.max}
                  unit="knock-outs"
                  disabled={busy}
                  onCommit={(value) =>
                    change((current) => ({ ...current, score: { from: scoreFrom, goal: value } }))
                  }
                />
              ) : null}
            </div>
          </Field>
          <div className="border-t border-ink/10 pt-5">
            <RulesEditor
              game={game}
              worldTags={world.tags}
              worldRideTags={world.rideTags}
              busy={busy}
              onSave={saveGame}
            />
          </div>
        </>
      ) : null}
      <div className="border-t border-ink/10 pt-5">
        <ScriptsPanel
          placeId={placeId}
          doc={world.doc}
          version={world.version}
          onCommands={saveScripts}
          onChangedElsewhere={load}
        />
      </div>
      <p className="text-xs text-ink/50">
        Place spawn points and zones from the studio library (Game). Make any item a zone in its properties.
        Test it with Test in the studio.
      </p>
    </div>
  );
}

/**
 * Place settings (owner request 2026-09-25; P9-15): everything about the place itself, apart
 * from the player's own settings and from the build tools: its About info (name, description,
 * kind, categories, size), how it is played, where it is available, and access. Owner only.
 */
export function PlaceSettings({
  placeId,
  onChanged,
}: {
  placeId: string;
  /** The place changed. */
  onChanged?: (place: Experience) => void;
}) {
  const [section, setSection] = useState<Section>('basic');
  const [place, setPlace] = useState<Experience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api
      .GET('/v1/experiences/{id}', { params: { path: { id: placeId } } })
      .then(({ data, error: failed }) => {
        if (data) setPlace(data);
        else setError(errorMessage(failed));
      });
  }, [placeId]);

  const save = async (body: {
    title?: string;
    description?: string | null;
    type?: NonNullable<Experience['type']>;
    sizeTier?: SizeTier;
    orientation?: PlaySettings['orientation'];
    view?: PlaySettings['view'];
    moves?: PlaySettings['moves'];
    devices?: PlaySettings['devices'];
    genres?: PlaceGenre[];
    avatar?: Experience['avatar'];
    blockLook?: PlaceBlockLook;
    playerBuilding?: PlayerBuilding;
    allowRemixing?: boolean;
  }) => {
    setError(null);
    setSaved(false);
    const { data, error: failed } = await api.PATCH('/v1/experiences/{id}', {
      params: { path: { id: placeId } },
      body,
    });
    if (!data) {
      setError(errorMessage(failed));
      return;
    }
    setPlace(data);
    setSaved(true);
    onChanged?.(data);
  };

  const submitBasic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get('description') ?? '').trim();
    void save({ title: String(form.get('title') ?? '').trim(), description: description || null });
  };

  // Stable for the Game section's loader (it reloads when these change).
  const gameSaved = useCallback(() => setSaved(true), []);
  const gameError = useCallback((message: string | null) => {
    setSaved(false);
    setError(message);
  }, []);

  const toggleGenre = (genre: PlaceGenre) => {
    if (!place) return;
    const on = place.genres.includes(genre);
    const genres = on ? place.genres.filter((g) => g !== genre) : [...place.genres, genre];
    setPlace({ ...place, genres });
    void save({ genres });
  };

  return (
    <div className="flex min-h-[34rem] flex-col overflow-hidden rounded-3xl bg-surface text-ink ring-1 ring-ink/5 sm:flex-row">
      <nav
        className="scroll-row flex shrink-0 gap-1 overflow-x-auto border-b border-ink/10 bg-paper p-3 sm:w-56 sm:flex-col sm:border-r sm:border-b-0"
        aria-label="Sections"
      >
        {SECTIONS.filter((entry) => entry.id !== 'blocks' || place?.style.base === 'voxel').map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={section === entry.id ? 'page' : undefined}
            onClick={() => setSection(entry.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold ${
              section === entry.id ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
            }`}
          >
            <entry.Icon className="size-4 shrink-0" aria-hidden />
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center justify-end px-4 pt-3" aria-live="polite">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-mint">
              <Check className="size-3.5" aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {error ? (
            <p className="mb-3 rounded-xl bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
          ) : null}
          {!place ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : !place.isOwner ? (
            <p className="text-sm text-ink/60">Only the owner of this place can change its settings.</p>
          ) : section === 'basic' ? (
            <div className="flex flex-col gap-5">
              <Heading title="Basic info" hint="What players see on the place page and in the lists." />
              <form key={place.updatedAt} onSubmit={submitBasic} className="flex flex-col gap-4">
                <Field label="Name">
                  <input
                    name="title"
                    defaultValue={place.title}
                    maxLength={60}
                    required
                    className="rounded-xl bg-paper px-3 py-2.5 font-bold outline-none focus:ring-2 focus:ring-ink/30"
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    name="description"
                    defaultValue={place.description ?? ''}
                    maxLength={1000}
                    rows={4}
                    placeholder="What can players do here?"
                    className="resize-none rounded-xl bg-paper px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink/30"
                  />
                </Field>
                <div>
                  <button
                    type="submit"
                    className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-on-brand hover:opacity-90"
                  >
                    Save name and description
                  </button>
                </div>
              </form>
              <Field label="Kind">
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map(([kind, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={place.type === kind}
                      onClick={() => kind && void save({ type: kind })}
                      className={chip(place.type === kind)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`Categories (up to ${MAX_PLACE_GENRES})`}>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(GENRE_LABELS) as PlaceGenre[]).map((genre) => {
                    const on = place.genres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && place.genres.length >= MAX_PLACE_GENRES}
                        onClick={() => toggleGenre(genre)}
                        className={chip(on)}
                      >
                        {GENRE_LABELS[genre]}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Size">
                <div className="flex flex-wrap gap-1.5">
                  {/* Large and bigger come with Plus (PLANS.md); until then admins and development builds may pick them.
                      A place grows and keeps all that is built; it shrinks back only while everything still fits. */}
                  {SIZE_ORDER.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={place.sizeTier === size}
                      onClick={() => void save({ sizeTier: size })}
                      className={chip(place.sizeTier === size)}
                    >
                      {SIZE_LABELS[size]} ({sizeText(SIZE_TIERS[size].sideMeters)}, {SIZE_TIERS[size].maxPlayers} players)
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          ) : section === 'remixing' ? (
            <>
              <Heading title="Allow remixing" hint="Let people make an independent editable copy of your published public place." />
              <p className="mb-4 text-sm text-ink/65">Copies start private and keep your name and the original place credit. Enabling this permits copying without asking you each time. Turning it off stops new copies; existing remixes keep their credit.</p>
              <div className="flex gap-2">
                <button type="button" aria-pressed={!place.allowRemixing} className={chip(!place.allowRemixing)} onClick={() => void save({ allowRemixing: false })}>Off</button>
                <button type="button" aria-pressed={place.allowRemixing} className={chip(place.allowRemixing)} onClick={() => void save({ allowRemixing: true })}>On</button>
              </div>
              <p className="mt-3 text-sm text-ink/55">Only published public remixes appear in the original place's remix count. Private drafts stay private.</p>
            </>
          ) : section === 'pictures' ? (
            <div>
              <Heading title="Pictures" hint="The thumbnail and screenshots players see before they join." />
              <PlacePictures placeId={placeId} />
            </div>
          ) : section === 'people' ? (
            <div>
              <Heading
                title="Collaborators"
                hint="Who builds this place with you, and who can play it before others."
              />
              <PlaceCollaborators placeId={placeId} />
            </div>
          ) : section === 'play' ? (
            <div>
              <Heading
                title="How it is played"
                hint="Phones turn to this screen shape while playing, and players see which devices it is made for."
              />
              <PlaySettingsPicker
                value={place.play}
                onChange={(play) => {
                  setPlace({ ...place, play });
                  void save({
                    orientation: play.orientation,
                    view: play.view,
                    moves: play.moves,
                    devices: play.devices,
                  });
                }}
              />
            </div>
          ) : section === 'game' ? (
            <div>
              <Heading
                title="Game"
                hint="Rules the server runs while people play: a match, teams, health, and score."
              />
              <GameSettings placeId={placeId} onSaved={gameSaved} onError={gameError} />
            </div>
          ) : section === 'blocks' ? (
            <div>
              <Heading
                title="Blocks"
                hint="How the blocks of this place look. Everyone sees your choice when they join."
              />
              <BlockLookPicker
                value={place.blockLook}
                onChange={(blockLook) => {
                  setPlace({ ...place, blockLook });
                  void save({ blockLook });
                }}
              />
              <div className="mt-8">
                <Heading
                  title="Players building"
                  hint="Players place and dig blocks with their hands while they play. Changes apply when players join."
                />
                <PlayerBuildingPicker
                  value={place.playerBuilding}
                  onChange={(playerBuilding) => {
                    setPlace({ ...place, playerBuilding });
                    void save({ playerBuilding });
                  }}
                />
              </div>
              <div className="mt-8">
                <PlayerBuilders placeId={place.id} saving={place.playerBuilding.saving} />
              </div>
            </div>
          ) : section === 'avatars' ? (
            <div>
              <Heading
                title="Avatars"
                hint="How players look in this place. Changes apply when players join."
              />
              <PlaceAvatarSettings
                value={readPlaceAvatar(place.avatar)}
                view={place.play.view}
                onSave={(avatar) => void save({ avatar })}
              />
            </div>
          ) : section === 'available' ? (
            <div className="flex flex-col gap-3">
              <Heading
                title="Where it is available"
                hint="Your place goes wherever Genvr is, for the devices you chose in How it is played."
              />
              {(
                [
                  [Globe, 'Web browser', 'Phones, tablets, and computers', 'Available now', true],
                  [
                    Smartphone,
                    'Genvr app for Android and iPhone',
                    'Google Play and the App Store',
                    'Coming',
                    false,
                  ],
                  [Store, 'Steam', 'Computers', 'Later', false],
                  [Tv, 'Xbox and PlayStation', 'TVs with a controller', 'Later', false],
                ] as const
              ).map(([Icon, name, where, when, now]) => (
                <div key={name} className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3">
                  <Icon className="size-5 shrink-0 text-ink/60" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{name}</p>
                    <p className="text-xs text-ink/50">{where}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${now ? 'bg-mint/15 text-mint' : 'bg-ink/5 text-ink/60'}`}
                  >
                    {when}
                  </span>
                </div>
              ))}
              <p className="text-xs text-ink/50">
                When a store opens, published places made for its devices appear there without extra work.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Heading
                title="Access and publishing"
                hint="Who can join, and whether the place is published."
              />
              <div className="rounded-2xl bg-paper px-4 py-3">
                <p className="text-sm font-bold">
                  {place.status === 'published' ? 'Published' : 'Private development'}
                </p>
                <p className="text-xs text-ink/60">Who can join: {ACCESS_LABELS[place.accessMode]}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/places/${placeId}/publish`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-on-brand"
                >
                  {place.status === 'published' ? 'Edit publishing' : 'Publish…'}
                  <ExternalLink className="size-4" aria-hidden />
                </a>
                <a
                  href={`/places/${placeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-ink/10"
                >
                  Place page
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
