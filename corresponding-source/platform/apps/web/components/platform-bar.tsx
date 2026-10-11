'use client';

import { DEFAULT_FAVORITE_ANIMATIONS } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import { MessageCircle, ShoppingBag } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { PAD } from '../lib/controls';
import { useGamepadButtons } from '../lib/gamepad';
import type { RoomPlayer } from '../lib/multiplayer';
import type { Social } from '../lib/social';
import { useSettings } from '../lib/settings';
import { ChatPanel } from './chat-panel';
import { SystemMenu, type ItemCredit } from './system-menu';
import { GenvrMark } from './genvr-mark';

const typing = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/**
 * The fixed platform bar, top left (docs/PLAYER-UI.md section 2): the Genvr logo opens the
 * system menu (also Esc), the chat button the room chat (also /). Part of the reserved platform
 * layer: GUI kits never cover it. Keys: Esc, L and R inside the menu, /, 1-8 favorite moves.
 */
export function PlatformBar({
  runtime,
  players,
  online,
  builder,
  toolActive,
  backend,
  social,
  onLeave,
  onMenuOpen,
  respawnAllowed = true,
  credits,
  onShop,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  players: RoomPlayer[];
  online: boolean;
  builder: boolean;
  /** A build tool is active: Esc cancels the tool instead of opening the menu. */
  toolActive: boolean;
  backend: string | null;
  social: Social;
  onLeave: () => void;
  /**
   * The menu opened or closed (also closed when the bar goes away): the page pauses movement while
   * it is open, together with its own reasons (a knocked-out player in a game, P9-12).
   */
  onMenuOpen: (open: boolean) => void;
  /** Respawn is offered (off while the place's game decides where the player is, P9-12). */
  respawnAllowed?: boolean;
  /** Free outside models in this place, credited in the menu's Help. */
  credits?: ItemCredit[];
  onShop?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Players can turn the chat off in Settings (P3-21).
  const settings = useSettings();
  const chatOn = online && settings.chat.on;
  const selfId = players.find((player) => player.self)?.id ?? null;

  const showChat = (next: boolean) => {
    setChatOpen(next);
    social.setPanelOpen(next);
  };

  // The menu pauses movement so keys pressed in it do not walk the avatar.
  useEffect(() => {
    onMenuOpen(open);
  }, [open, onMenuOpen]);
  useEffect(() => () => onMenuOpen(false), [onMenuOpen]);

  const respawn = () => {
    if (!respawnAllowed) return;
    runtime.current?.respawn();
    setOpen(false);
  };

  // Game controllers (lib/controls.ts): menu, chat, menu actions, and D-pad moves.
  useGamepadButtons((button) => {
    if (document.querySelector('dialog[open]')) return;
    if (button === PAD.menu) return setOpen((current) => !current);
    if (button === PAD.chat && chatOn && !open) return showChat(!chatOpen);
    if (open) {
      if (button === PAD.sit) setOpen(false);
      else if (button === PAD.respawn) respawn();
      else if (button === PAD.leave) onLeave();
      return;
    }
    const slot = [PAD.up, PAD.right, PAD.down, PAD.left].indexOf(button as never);
    const id = slot >= 0 ? DEFAULT_FAVORITE_ANIMATIONS[slot] : undefined;
    if (id) runtime.current?.playAnimation(id);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        if (toolActive && !open) return;
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === '/' && !open && chatOn) {
        event.preventDefault();
        showChat(true);
        return;
      }
      if (open) {
        if (event.code === 'KeyL') onLeave();
        else if (event.code === 'KeyR') respawn();
        return;
      }
      const slot = /^Digit([1-8])$/.exec(event.code);
      if (slot && !toolActive) {
        const id = DEFAULT_FAVORITE_ANIMATIONS[Number(slot[1]) - 1];
        if (id) runtime.current?.playAnimation(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="pointer-events-auto absolute top-3 left-3 z-20 flex items-center gap-2">
        <button
          type="button"
          aria-label="Menu (Esc)"
          title="Menu (Esc)"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex size-12 items-center justify-center rounded-2xl bg-surface shadow-[0_4px_0_0_var(--color-brand-dark)] ring-1 ring-ink/10 active:translate-y-0.5"
        >
          <GenvrMark className="size-8" />
        </button>
        {onShop ? <button type="button" aria-label="Shop" title="Shop" onClick={onShop}
          className="flex size-12 items-center justify-center rounded-2xl bg-surface text-ink shadow-lg">
          <ShoppingBag className="size-6" aria-hidden />
        </button> : null}
        {chatOn ? (
          <button
            type="button"
            aria-label="Chat (/)"
            title="Chat (/)"
            aria-expanded={chatOpen}
            onClick={() => showChat(!chatOpen)}
            className={`relative flex size-12 items-center justify-center rounded-2xl shadow-lg active:translate-y-0.5 ${
              chatOpen ? 'bg-ink text-on-brand' : 'bg-surface text-ink'
            }`}
          >
            <MessageCircle className="size-6" aria-hidden />
            {social.unread > 0 && !chatOpen ? (
              <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-coral px-1 text-xs font-black text-on-brand">
                {social.unread > 9 ? '9+' : social.unread}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {chatOpen && chatOn ? (
        <ChatPanel social={social} selfId={selfId} players={players} onClose={() => showChat(false)} />
      ) : null}

      {open ? (
        <SystemMenu
          players={players}
          online={online}
          builder={builder}
          blockPlace={runtime.current?.blockGround ?? false}
          backend={backend}
          social={social}
          onLeave={onLeave}
          onRespawn={respawnAllowed ? respawn : null}
          onResume={() => setOpen(false)}
          credits={credits ?? []}
        />
      ) : null}
    </>
  );
}
