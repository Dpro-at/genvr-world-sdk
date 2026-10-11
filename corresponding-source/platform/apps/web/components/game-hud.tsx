'use client';

import { ArrowRight, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clockText, remaining } from '../lib/game-clock';
import {
  backIn as backInSeconds,
  byPlace,
  COMPACT_HUD,
  hudFit,
  hudLines,
  knockedOut,
  ownRow,
  ranked,
  rankingTitle,
  shownMessages,
  winnerText,
  type GameHudRules,
  type GameMessage,
  type GamePlayerSnapshot,
  type GameSnapshot,
} from '../lib/game-view';

/** One line of the kill feed: who knocked out whom (P9-12). */
export interface KillFeedEntry {
  key: number;
  /** Client time the room announced it (ms). */
  at: number;
  /** The one who struck; null when nobody did. */
  by: string | null;
  victim: string;
}

/** How long a kill stays in the feed, and how many show at once. */
const FEED = { ms: 5000, lines: 4 } as const;

/** Redraws twice a second while on: the clocks count down and old kills leave the feed. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [on]);
  return now;
}

/** The window's height in CSS pixels, kept up to date (turning the phone, resizing the window). */
function useViewportHeight(): number {
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const read = () => setHeight(window.innerHeight);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return height;
}

/** Where Tab moves the keyboard focus instead of showing the scoreboard. */
const KEYBOARD_FOCUS =
  'button, a, input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]';

const teamName = (team: string) => (team === 'red' ? 'Red' : team === 'blue' ? 'Blue' : '');

/**
 * The kill feed (P9-12): the last few knock-outs for a few seconds each, with an arrow
 * between the names (who knocked out whom). The page puts it under its notices, top right.
 */
export function KillFeed({ entries }: { entries: readonly KillFeedEntry[] }) {
  // The clock runs only while the newest line is still shown; a new line starts it again.
  const [now, setNow] = useState(() => Date.now());
  const newest = entries.at(-1)?.at ?? null;
  const live = newest !== null && now - newest < FEED.ms;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [live]);
  const shown = entries.filter((entry) => now - entry.at < FEED.ms).slice(-FEED.lines);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Knock-outs" className="pointer-events-none flex flex-col items-end gap-1">
      {shown.map((entry) => (
        <li
          key={entry.key}
          className="flex items-center gap-1.5 rounded-xl bg-ink/70 px-2.5 py-1 text-xs font-bold text-on-brand"
        >
          {entry.by ? <span className="max-w-32 truncate">{entry.by}</span> : null}
          <ArrowRight className="size-3.5 shrink-0" aria-label="knocked out" />
          <span className="max-w-32 truncate">{entry.victim}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The game on screen (P9-12), drawn from the room's game snapshot: the match clock and team
 * scores (top centre), the designer's HUD bindings (top left), the rules' messages (upper middle), health (bottom left), the
 * scoreboard (held Tab or the Trophy button), the match screens (waiting, countdown, winner) and
 * the respawn wait. Each part shows only when its rule component is on. Presentational: the page
 * feeds it and decides when it shows.
 */
export function GameHud({
  snapshot,
  serverOffset,
  minPlayers,
  rules,
  messages = [],
  speed,
}: {
  snapshot: GameSnapshot;
  /** Server time minus this device's time (ms). */
  serverOffset: number;
  /** Players the match needs to start (the place's rules). */
  minPlayers: number;
  /** The place's counters, ranking and HUD bindings (null: none). */
  rules: GameHudRules | null;
  /** The rules' messages to this player (`show_message`), newest last. */
  messages?: readonly GameMessage[];
  /** The local player's speed over the ground now, m/s, for a Speed display (read a few times a second). */
  speed?: () => number;
}) {
  const now = useNow(snapshot.on);
  const height = useViewportHeight();
  // Short screens (landscape phones): health joins the displays at the top left, the displays
  // past what fits wait behind one "Show more" button, and the results card lies flat.
  const compact = height <= COMPACT_HUD.maxHeight;
  const [moreOpen, setMoreOpen] = useState(false);
  const [boardHeld, setBoardHeld] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  // The scoreboard shows while Tab is held (computers).
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Tab') return;
      // Tab keeps moving the focus through buttons, fields, dialogs and menus.
      const focus = event.target instanceof Element ? event.target : null;
      if (focus?.closest(KEYBOARD_FOCUS)) return;
      event.preventDefault();
      setBoardHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Tab') setBoardHeld(false);
    };
    const blur = () => setBoardHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const me = ownRow(snapshot);
  const teams = snapshot.players.some((row) => row.team !== '');
  const health = me && me.max > 0 ? me : null;
  const left = snapshot.endsAt > 0 ? remaining(snapshot.endsAt, serverOffset, now) : null;
  const present = snapshot.players.filter((row) => row.present).length;
  // With a ranking the designer's counter orders the players; otherwise the score does.
  const ranking = rules?.ranking ?? null;
  const results = ranking ? byPlace(snapshot.players) : ranked(snapshot.players);
  const rankValue = (row: GamePlayerSnapshot) => (ranking ? (row.counters.get(ranking.by) ?? 0) : row.score);
  const lines = snapshot.phase === 'playing' ? hudLines(snapshot, rules, left, speed ? speed() : null) : [];
  const healthShown = health !== null && snapshot.phase === 'playing';
  const fit = compact ? hudFit(lines.length, height, healthShown) : lines.length;
  const hidden = lines.length - fit;
  const shownLines = moreOpen || hidden === 0 ? lines : lines.slice(0, fit);
  // The results screen takes the middle; messages show while the match is on.
  const said = snapshot.phase === 'results' ? [] : shownMessages(messages, now);
  const dead = knockedOut(snapshot);
  // The server says when the player is back (their row's respawnAt).
  const backIn = backInSeconds(snapshot, serverOffset, now);

  return (
    <>
      {/* Knocked out: the view dims until the player is back. */}
      {dead ? <div className="pointer-events-none absolute inset-0 bg-black/40" aria-hidden /> : null}

      {/* Top centre: the match clock, team scores, and the scoreboard button. */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div className="flex items-center gap-2">
          {snapshot.phase === 'playing' && left !== null ? (
            <p
              aria-label="Time left"
              className="rounded-2xl bg-ink/70 px-3 py-1.5 font-mono text-sm font-bold text-on-brand tabular-nums"
            >
              {clockText(left)}
            </p>
          ) : null}
          {teams ? (
            <p
              aria-label="Team scores"
              className="rounded-2xl bg-ink/70 px-3 py-1.5 text-sm font-bold text-on-brand tabular-nums"
            >
              Red {snapshot.red} · Blue {snapshot.blue}
            </p>
          ) : null}
          <button
            type="button"
            aria-label="Scoreboard"
            aria-pressed={boardOpen}
            onClick={() => setBoardOpen((open) => !open)}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-ink/70 text-on-brand shadow active:scale-95"
          >
            <Trophy className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Top left, under the top row: what the designer chose to show (HUD bindings); on short
          screens health first, and the displays past what fits behind one 44 px button. */}
      {shownLines.length > 0 || (compact && healthShown) ? (
        <div className="pointer-events-none absolute top-16 left-3 flex flex-col items-start gap-1">
          {compact && health && healthShown ? <HealthMeter health={health.health} max={health.max} compact /> : null}
          {shownLines.length > 0 ? (
            <ul aria-label="Game" className="flex flex-col items-start gap-1">
              {shownLines.map((line) => (
                <li
                  key={line.key}
                  className={`truncate rounded-2xl bg-ink/70 font-bold text-on-brand tabular-nums ${
                    compact ? 'max-w-44 px-2.5 py-1 text-xs' : 'max-w-48 px-3 py-1.5 text-sm'
                  }`}
                >
                  {line.label ? `${line.label} ${line.value}` : line.value}
                </li>
              ))}
            </ul>
          ) : null}
          {hidden > 0 ? (
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className="pointer-events-auto inline-flex h-11 items-center gap-1 rounded-2xl bg-ink/70 px-3 text-xs font-bold text-on-brand active:scale-95"
            >
              {moreOpen ? (
                <>
                  <ChevronUp className="size-4" aria-hidden />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" aria-hidden />
                  Show {hidden} more
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Upper middle: the rules' messages, a few seconds each (below the top row and the displays). */}
      {said.length > 0 ? (
        <ul
          aria-label="Messages"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center gap-1 px-4"
        >
          {said.map((message) => (
            <li
              key={message.key}
              className="max-w-sm rounded-2xl bg-ink/70 px-4 py-2 text-center text-base font-bold break-words text-on-brand"
            >
              {message.text}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Bottom left: health (tall screens; short ones show it with the displays). */}
      {health && healthShown && !compact ? (
        <div className="pointer-events-none absolute bottom-4 left-4">
          <HealthMeter health={health.health} max={health.max} />
        </div>
      ) : null}

      {/* Centre: the match screens and the respawn wait. */}
      {/* The results card stays between the top row and the bottom buttons (Back to building), and
          on short screens clear of the Jump button at the side too. */}
      <div
        className={`pointer-events-none absolute flex items-center justify-center ${
          snapshot.phase !== 'results'
            ? 'inset-0 p-4'
            : compact
              ? 'inset-x-0 top-16 bottom-24 px-24'
              : 'inset-x-0 top-16 bottom-24 px-4'
        }`}
      >
        {snapshot.phase === 'waiting' ? (
          <p className="rounded-2xl bg-ink/70 px-4 py-2 text-base font-bold text-on-brand">
            Waiting for players ({present}/{minPlayers})
          </p>
        ) : snapshot.phase === 'countdown' && left !== null ? (
          <p
            aria-label="Starting in"
            className="text-7xl font-black text-on-brand drop-shadow-lg tabular-nums"
          >
            <span className="rounded-3xl bg-ink/70 px-6 py-2">{Math.max(1, left)}</span>
          </p>
        ) : snapshot.phase === 'results' && compact ? (
          <div className="flex max-h-full w-full max-w-md items-center gap-4 overflow-hidden rounded-3xl bg-surface/95 p-3 text-ink shadow-lg">
            <div className="flex w-28 shrink-0 flex-col items-center text-center">
              <Trophy className="size-6" aria-hidden />
              <p className="mt-1 text-lg leading-tight font-black break-words">{winnerText(snapshot)}</p>
            </div>
            <ol className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
              {results.slice(0, ranking ? 5 : 3).map((row, index) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 ${row.self ? 'bg-ink/10 font-bold' : ''}`}
                >
                  <span className="w-4 text-ink/60">{index + 1}</span>
                  <span className="flex-1 truncate text-left">{row.self ? 'You' : row.name}</span>
                  <span className="tabular-nums">{rankValue(row)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : snapshot.phase === 'results' ? (
          <div className="w-full max-w-xs rounded-3xl bg-surface/95 p-5 text-center text-ink shadow-lg">
            <Trophy className="mx-auto size-8" aria-hidden />
            <p className="mt-2 text-2xl font-black">{winnerText(snapshot)}</p>
            <ol className="mt-3 flex flex-col gap-1 text-sm">
              {results.slice(0, ranking ? 5 : 3).map((row, index) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${row.self ? 'bg-ink/10 font-bold' : ''}`}
                >
                  <span className="w-4 text-ink/60">{index + 1}</span>
                  <span className="flex-1 truncate text-left">{row.self ? 'You' : row.name}</span>
                  <span className="tabular-nums">{rankValue(row)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : dead ? (
          <p className="rounded-2xl bg-ink/70 px-4 py-2 text-lg font-bold text-on-brand">
            {backIn !== null ? `Back in ${backIn}` : 'Knocked out until the next match'}
          </p>
        ) : null}
      </div>

      {/* The scoreboard: rows by score, the player's own row highlighted. */}
      {boardHeld || boardOpen ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
          <table
            aria-label="Scores"
            className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl bg-surface/95 text-sm text-ink shadow-lg"
          >
            <thead>
              <tr className="text-xs text-ink/60">
                <th className="px-3 py-2 text-left font-bold">Player</th>
                {teams ? <th className="px-2 py-2 text-left font-bold">Team</th> : null}
                {ranking ? (
                  <th className="max-w-32 truncate px-3 py-2 text-right font-bold">{rankingTitle(rules)}</th>
                ) : (
                  <>
                    <th className="px-2 py-2 text-right font-bold">Knock-outs</th>
                    <th className="px-2 py-2 text-right font-bold">Out</th>
                    <th className="px-3 py-2 text-right font-bold">Score</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr
                  key={row.id}
                  className={`${row.self ? 'bg-ink/10 font-bold' : ''} ${row.present ? '' : 'text-ink/50'}`}
                >
                  <td className="max-w-40 truncate px-3 py-1.5">
                    {row.self ? `${row.name} (you)` : row.name}
                  </td>
                  {teams ? <td className="px-2 py-1.5">{teamName(row.team)}</td> : null}
                  {ranking ? (
                    <td className="px-3 py-1.5 text-right tabular-nums">{rankValue(row)}</td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.kills}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.deaths}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.score}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/** The health bar and number; `compact` is the short-screen size that sits with the displays. */
function HealthMeter({ health, max, compact = false }: { health: number; max: number; compact?: boolean }) {
  return (
    <div
      role="meter"
      aria-label="Health"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={health}
      className={`flex items-center gap-2 ${compact ? 'h-6 w-36' : 'w-48 max-sm:w-36'}`}
    >
      <div className={`flex-1 overflow-hidden rounded-full bg-ink/70 ${compact ? 'h-2.5' : 'h-3'}`}>
        <div
          className={`h-full rounded-full ${health / max < 0.3 ? 'bg-coral' : 'bg-paper'}`}
          style={{ width: `${Math.max(0, Math.min(100, (health / max) * 100))}%` }}
        />
      </div>
      <span className="rounded-lg bg-ink/70 px-1.5 text-xs font-bold text-on-brand tabular-nums">{health}</span>
    </div>
  );
}
