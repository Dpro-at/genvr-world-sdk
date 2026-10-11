'use client';

import { CHAT, type ChatChannel } from '@genvr/contracts';
import { MessageCircleOff, SendHorizontal, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomPlayer } from '../lib/multiplayer';
import type { Social } from '../lib/social';
import { AvatarSketch } from './avatar-sketch';

/**
 * Platform chat (tasks P3-09, P3-19, docs/PLAYER-UI.md section 6): "Here" is this room, "Global"
 * every room of the place (slower: one message every few seconds). Messages are already
 * filtered by the server. Muted and blocked players are hidden; mute, block, and report
 * live in the People tab of the menu. `/` starts typing, Enter sends, Esc leaves the box. Each
 * message shows the sender's portrait when they are in this room (players in other rooms of the
 * place get a plain icon: their looks are not sent here).
 */
export function ChatPanel({
  social,
  selfId,
  players,
  onClose,
}: {
  social: Social;
  /** Players in this room (their looks draw the portraits). */
  players: RoomPlayer[];
  /** Own session id (own messages are highlighted). */
  selfId: string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<ChatChannel>('here');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // Looks of everyone seen in this room: portraits stay after a player leaves.
  const seen = useRef(new Map<string, RoomPlayer['look']>());
  const looks = useMemo(() => {
    for (const player of players) seen.current.set(player.id, player.look);
    return new Map(seen.current);
  }, [players]);
  const visible = social.messages.filter(
    (m) => (m.channel ?? 'here') === channel && !social.muted.has(m.from) && !social.blocked.has(m.from),
  );

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [visible.length]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    social.send(message, channel);
    setText('');
  };

  return (
    <section
      aria-label="Chat"
      className="pointer-events-auto absolute top-[4.5rem] left-3 z-30 flex max-h-[45vh] w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-3xl bg-surface/95 p-2 shadow-xl"
    >
      <header className="flex items-center justify-between px-2 pt-1 pb-2">
        <h2 className="sr-only">Chat</h2>
        <div role="tablist" aria-label="Chat" className="flex rounded-2xl bg-paper p-1">
          {(
            [
              ['here', 'Here'],
              ['global', 'Everyone'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={channel === id}
              onClick={() => {
                setChannel(id);
                input.current?.focus();
              }}
              className={`rounded-xl px-3 py-1 text-sm font-extrabold ${
                channel === id ? 'bg-ink text-on-brand' : 'text-ink/60 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-xl p-1.5 text-ink/60 hover:bg-ink/5"
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      {!social.enabled ? (
        <p className="flex items-center gap-2 px-2 pb-3 text-sm font-bold text-ink/60">
          <MessageCircleOff className="size-5" aria-hidden />
          Chat is off in this place.
        </p>
      ) : (
        <>
          <ol
            ref={list}
            className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto px-1 pb-2 [scrollbar-width:none]"
          >
            {visible.length === 0 ? (
              <li className="px-1 text-sm font-semibold text-ink/40">
                {channel === 'here'
                  ? 'Say hi to the players near you in this room.'
                  : 'Messages here reach everyone playing this place, in every room.'}
              </li>
            ) : null}
            {visible.map((message) => {
              const self = message.from === selfId;
              const look = looks.get(message.from);
              return (
                <li
                  key={message.id}
                  className={`flex items-start gap-2 rounded-2xl py-1.5 pr-3 pl-1.5 text-sm ${self ? 'bg-brand/10' : 'bg-paper'}`}
                >
                  {look ? (
                    <AvatarSketch
                      look={look}
                      focus="portrait"
                      className="size-7 shrink-0 rounded-xl bg-surface px-0.5 pt-0.5 ring-1 ring-ink/10"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-surface text-ink/40 ring-1 ring-ink/10">
                      <UserRound className="size-4" aria-hidden />
                    </span>
                  )}
                  <p className="min-w-0 pt-0.5">
                    <span className="font-extrabold">{message.name}</span>{' '}
                    <span className="break-words text-ink">{message.text}</span>
                  </p>
                </li>
              );
            })}
          </ol>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') input.current?.blur();
                // Keep game keys (WASD, 1-8, C) inside the box.
                event.stopPropagation();
              }}
              maxLength={CHAT.maxLength}
              placeholder={channel === 'here' ? 'Message this room' : 'Message everyone in this place'}
              aria-label="Chat message"
              className="min-w-0 flex-1 rounded-2xl bg-paper px-3 py-2 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-on-brand disabled:opacity-40"
            >
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </form>
        </>
      )}
    </section>
  );
}
