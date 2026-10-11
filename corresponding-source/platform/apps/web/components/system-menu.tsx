'use client';

import type { ReportReason } from '@genvr/contracts';
import {
  Ban,
  Check,
  CircleHelp,
  Crown,
  Flag,
  Gamepad2,
  Glasses,
  Hammer,
  LogOut,
  Monitor,
  Play,
  RotateCcw,
  Smartphone,
  Settings,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { SettingsTab } from './settings-tab';
import { COMING_SOON, CONTROLS, currentDevice, type ControlDevice } from '../lib/controls';
import type { RoomPlayer } from '../lib/multiplayer';
import { useInviteLink } from '../lib/invite';
import type { Social } from '../lib/social';
import { AvatarSketch } from './avatar-sketch';
import { ReportLink } from './context-report';

/** A free outside model used in the place, with who made it (its `origin`). */
export interface ItemCredit {
  itemId: string;
  name: string;
  provider: string;
  page: string;
  license: string;
  authors: string[];
}

const SOURCE_NAMES: Record<string, string> = {
  polyhaven: 'Poly Haven',
  kenney: 'Kenney',
  sketchfab: 'Sketchfab',
};

type Tab = 'people' | 'settings' | 'report' | 'help';

const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: 'people', label: 'People', Icon: Users },
  { id: 'settings', label: 'Settings', Icon: Settings },
  { id: 'report', label: 'Report', Icon: Flag },
  { id: 'help', label: 'Help', Icon: CircleHelp },
];

/** Report reasons in kid words (fixed list, so nobody has to type). */
const REASONS: Array<{ reason: ReportReason; label: string }> = [
  { reason: 'bullying', label: 'Being mean' },
  { reason: 'bad-words', label: 'Bad words' },
  { reason: 'personal-info', label: 'Asks for my name, address, or number' },
  { reason: 'scary-or-adult', label: 'Scary or grown-up stuff' },
  { reason: 'cheating', label: 'Cheating' },
  { reason: 'other', label: 'Something else' },
];

type Reporting =
  { target: 'player'; sessionId: string; name: string } | { target: 'place' } | { target: 'build' } | null;

/**
 * System menu (Genvr logo or Esc), part of the reserved platform layer (docs/PLAYER-UI.md
 * section 3), in Genvr's own playful style: a bright pause card with three chunky action tiles
 * on the side and pill tabs for People, Settings, Report, and Help.
 */
export function SystemMenu({
  players,
  online,
  builder,
  blockPlace,
  backend,
  social,
  onLeave,
  onRespawn,
  onResume,
  credits = [],
}: {
  players: RoomPlayer[];
  social: Social;
  online: boolean;
  /** Owners and builders also see the build keys. */
  builder: boolean;
  /** The place is made of blocks: players can report a build (decision 109). */
  blockPlace: boolean;
  backend: string | null;
  onLeave: () => void;
  /** Null hides Respawn (the place's game places the player, P9-12). */
  onRespawn: (() => void) | null;
  onResume: () => void;
  /** Free outside models in this place, credited in Help. */
  credits?: ItemCredit[];
}) {
  const [tab, setTab] = useState<Tab>('people');
  const [reporting, setReporting] = useState<Reporting>(null);
  const openReport = (next: Reporting) => {
    setReporting(next);
    setTab('report');
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/30 p-3 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onResume();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="flex max-h-full w-full max-w-3xl flex-col-reverse gap-3 rounded-[2rem] border-4 border-surface bg-paper p-3 text-ink shadow-2xl sm:flex-row"
      >
        <div className="grid shrink-0 grid-cols-3 gap-2 sm:w-48 sm:grid-cols-1 sm:grid-rows-[1fr_auto_auto]">
          <ActionTile
            label="Resume"
            keyLabel="Esc"
            Icon={Play}
            onClick={onResume}
            className="bg-brand text-on-brand"
          />
          {onRespawn ? (
            <ActionTile
              label="Respawn"
              keyLabel="R"
              Icon={RotateCcw}
              onClick={onRespawn}
              className="border-2 border-ink/10 bg-surface text-ink"
            />
          ) : null}
          <ActionTile
            label="Leave"
            keyLabel="L"
            Icon={LogOut}
            onClick={onLeave}
            className="border-2 border-ink/10 bg-surface text-coral"
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div role="tablist" className="flex gap-2 pb-3">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-extrabold transition ${
                  tab === entry.id ? 'bg-ink text-on-brand' : 'bg-surface text-ink/60 hover:text-ink'
                }`}
              >
                <entry.Icon className="size-5" aria-hidden />
                {entry.label}
              </button>
            ))}
          </div>
          {/* A fixed height keeps the menu the same size on every tab; long tabs scroll. */}
          <div className="h-[min(26rem,60dvh)] min-h-56 overflow-y-auto rounded-3xl bg-surface p-4">
            {tab === 'people' ? (
              <People players={players} online={online} social={social} onReport={openReport} />
            ) : null}
            {tab === 'settings' ? <SettingsTab builder={builder} /> : null}
            {tab === 'report' ? (
              <Report
                players={players}
                blockPlace={blockPlace}
                reporting={reporting}
                onChoose={setReporting}
                onSend={(reason) => {
                  if (!reporting) return;
                  social.report(
                    reporting.target === 'player'
                      ? { target: 'player', sessionId: reporting.sessionId, reason }
                      : { target: reporting.target, reason },
                  );
                  setReporting(null);
                  onResume();
                }}
              />
            ) : null}
            {tab === 'help' ? <Help builder={builder} backend={backend} credits={credits} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionTile({
  label,
  keyLabel,
  Icon,
  onClick,
  className,
}: {
  label: string;
  keyLabel: string;
  Icon: LucideIcon;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-1 rounded-3xl px-2 py-4 text-lg font-black transition active:translate-y-1 active:shadow-none ${className}`}
    >
      <Icon className="size-8" strokeWidth={2.4} aria-hidden />
      {label}
      <kbd className="absolute top-2 right-3 hidden rounded-md bg-ink/10 px-1.5 text-[11px] font-extrabold sm:block">
        {keyLabel}
      </kbd>
    </button>
  );
}

/**
 * Invite to play (P3-10): shares a link to this room (the phone's share sheet, or a copied link).
 * Friends still need access to the place; the link only picks the room.
 */
function InviteButton() {
  const link = useInviteLink();
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  const share = async () => {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Play with me on Genvr', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sharing was cancelled or the clipboard is blocked: nothing to do.
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-sm font-extrabold text-on-brand active:scale-95"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
      {copied ? 'Link copied' : 'Invite'}
    </button>
  );
}

function People({
  players,
  online,
  social,
  onReport,
}: {
  players: RoomPlayer[];
  online: boolean;
  social: Social;
  onReport: (reporting: Reporting) => void;
}) {
  if (!online) {
    return (
      <p className="py-10 text-center font-bold text-ink/50">
        You are playing alone right now. Friends can join when the room is back.
      </p>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="text-lg font-black">
          Here with you <span className="text-ink/40">{players.length}</span>
        </p>
        <InviteButton />
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {players.map((player) => {
          return (
            <li key={player.id} className="flex flex-col gap-2 rounded-2xl bg-paper p-2.5">
              <div className="flex items-center gap-3">
                <AvatarSketch
                  look={player.look}
                  focus="portrait"
                  className="size-11 shrink-0 rounded-2xl bg-surface px-0.5 pt-1 ring-1 ring-ink/10"
                />
                <span className="min-w-0">
                  <span className="block truncate font-extrabold">{player.name}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-ink/50">
                    {player.role === 'owner' ? <Crown className="size-3.5" aria-hidden /> : null}
                    {player.role === 'builder' ? <Hammer className="size-3.5" aria-hidden /> : null}
                    {player.self
                      ? 'You'
                      : player.role === 'owner'
                        ? 'Owner'
                        : player.role === 'builder'
                          ? 'Builder'
                          : 'Player'}
                  </span>
                </span>
              </div>
              {player.self ? null : (
                <div className="grid grid-cols-3 gap-1">
                  <SmallAction
                    label={social.muted.has(player.id) ? 'Unmute' : 'Mute'}
                    Icon={social.muted.has(player.id) ? Volume2 : VolumeX}
                    onClick={() => social.toggleMute(player.id)}
                  />
                  <SmallAction
                    label={social.blocked.has(player.id) ? 'Unblock' : 'Block'}
                    Icon={Ban}
                    onClick={() => social.setBlocked(player.id, !social.blocked.has(player.id))}
                    danger={!social.blocked.has(player.id)}
                  />
                  <SmallAction
                    label="Report"
                    Icon={Flag}
                    onClick={() => onReport({ target: 'player', sessionId: player.id, name: player.name })}
                    danger
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SmallAction({
  label,
  Icon,
  onClick,
  danger = false,
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-xl bg-surface py-1.5 text-[11px] font-extrabold hover:bg-ink/5 ${
        danger ? 'text-coral' : 'text-ink/70'
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function Report({
  players,
  blockPlace,
  reporting,
  onChoose,
  onSend,
}: {
  players: RoomPlayer[];
  blockPlace: boolean;
  reporting: Reporting;
  onChoose: (reporting: Reporting) => void;
  onSend: (reason: ReportReason) => void;
}) {
  if (reporting) {
    return (
      <div>
        <p className="pb-3 text-lg font-black">
          {reporting.target === 'player'
            ? `What did ${reporting.name} do?`
            : reporting.target === 'build'
              ? 'What is wrong with this build?'
              : 'What is wrong with this place?'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {REASONS.map((entry) => (
            <button
              key={entry.reason}
              type="button"
              onClick={() => onSend(entry.reason)}
              className="rounded-2xl bg-paper px-4 py-3 text-left font-bold hover:bg-coral/10"
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChoose(null)}
          className="mt-3 text-sm font-bold text-ink/50 hover:text-ink"
        >
          Back
        </button>
        <p className="pt-3 text-xs font-semibold text-ink/40">
          {reporting.target === 'build'
            ? 'Reports go to the Genvr safety team with the blocks near you and who built them. Nobody else sees who reported.'
            : 'Reports go to the Genvr safety team with the last chat messages of that player. Nobody else sees who reported.'}
        </p>
      </div>
    );
  }
  const others = players.filter((player) => !player.self);
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="pb-2 font-black">A player (their chat, name, or behavior)</h3>
        {others.length === 0 ? (
          <p className="text-sm font-semibold text-ink/40">Nobody else is here right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {others.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => onChoose({ target: 'player', sessionId: player.id, name: player.name })}
                className="rounded-full bg-paper px-4 py-2 font-bold hover:bg-coral/10"
              >
                {player.name}
              </button>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3 className="pb-2 font-black">This place (an object, a sound, or the whole place)</h3>
        <button
          type="button"
          onClick={() => onChoose({ target: 'place' })}
          className="rounded-full bg-paper px-4 py-2 font-bold hover:bg-coral/10"
        >
          Report this place
        </button>
      </section>
      {blockPlace ? (
        <section>
          <h3 className="pb-2 font-black">A build near you (blocks other players placed)</h3>
          <button
            type="button"
            onClick={() => onChoose({ target: 'build' })}
            className="rounded-full bg-paper px-4 py-2 font-bold hover:bg-coral/10"
          >
            Report a build
          </button>
        </section>
      ) : null}
      <p className="text-sm text-ink/60">
        Something here breaks the law? <ReportLink className="font-bold text-ink underline" />
      </p>
    </div>
  );
}

const DEVICES: Array<{ id: ControlDevice; label: string; Icon: LucideIcon }> = [
  { id: 'computer', label: 'Computer', Icon: Monitor },
  { id: 'touch', label: 'Phone and tablet', Icon: Smartphone },
  { id: 'xbox', label: 'Xbox controller', Icon: Gamepad2 },
  { id: 'playstation', label: 'PlayStation controller', Icon: Gamepad2 },
  { id: 'vr', label: 'VR', Icon: Glasses },
];

/** Controls of every device (lib/controls.ts), starting with the one in use. */
/**
 * Who made the free outside models in this place (owner, 2026-10-07): their licences (CC BY) and Sketchfab ask
 * that every player can see the author, the licence and where the model comes from.
 */
function Credits({ credits }: { credits: ItemCredit[] }) {
  if (credits.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-black tracking-wide text-ink/50 uppercase">Credits</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {credits.map((credit) => (
          <li key={credit.itemId} className="min-w-0">
            <a href={credit.page} target="_blank" rel="noreferrer" className="font-bold underline">
              {credit.name}
            </a>
            <span className="text-ink/60">
              {credit.authors.length ? ` by ${credit.authors.join(', ')}` : ''}, {credit.license}, from{' '}
              {SOURCE_NAMES[credit.provider] ?? credit.provider}
            </span>
          </li>
        ))}
      </ul>
      {credits.some((credit) => credit.provider === 'sketchfab') ? (
        <p className="mt-1.5 text-xs font-semibold text-ink/50">Models from Sketchfab.</p>
      ) : null}
    </section>
  );
}

function Help({
  builder,
  backend,
  credits,
}: {
  builder: boolean;
  backend: string | null;
  credits: ItemCredit[];
}) {
  const [device, setDevice] = useState<ControlDevice>(currentDevice);
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Device" className="flex flex-wrap gap-1.5">
        {DEVICES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={device === entry.id}
            onClick={() => setDevice(entry.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
              device === entry.id ? 'bg-ink text-on-brand' : 'bg-paper text-ink/60 hover:text-ink'
            }`}
          >
            <entry.Icon className="size-4" aria-hidden />
            {entry.label}
          </button>
        ))}
      </div>
      {COMING_SOON.has(device) ? (
        <p className="rounded-2xl bg-paper px-3 py-2 text-sm font-bold text-ink/60">
          Coming soon: VR mode is on its way (Meta Quest first). These will be the controls.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {CONTROLS[device]
          .filter((group) => builder || !group.builders)
          .map((group) => (
            <KeyList key={group.title} title={group.title} rows={group.rows} />
          ))}
      </div>
      <Credits credits={credits} />
      {backend ? <p className="text-xs font-semibold text-ink/40">Graphics: {backend}</p> : null}
    </div>
  );
}

function KeyList({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section>
      <h3 className="pb-2 font-black">{title}</h3>
      <dl className="flex flex-col gap-1.5">
        {rows.map(([action, key]) => (
          <div key={action} className="flex items-center justify-between gap-3">
            <dt className="text-sm font-bold text-ink/70">{action}</dt>
            <dd>
              <kbd className="rounded-lg border-b-4 border-ink/15 bg-paper px-2 py-0.5 text-xs font-extrabold">
                {key}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
