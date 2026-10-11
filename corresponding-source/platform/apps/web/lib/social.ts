'use client';

import type { ChatChannel, ChatMessage, InGameReport } from '@genvr/contracts';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { MultiplayerSession, SocialHandlers } from './multiplayer';

/** Messages kept on screen. */
const KEEP = 60;

export interface Social {
  enabled: boolean;
  messages: ChatMessage[];
  /** Messages that arrived while the chat panel was closed. */
  unread: number;
  /** Sessions this player muted (hidden for this visit only). */
  muted: ReadonlySet<string>;
  /** Sessions this player blocked (saved on the account, enforced by the room). */
  blocked: ReadonlySet<string>;
  notice: string | null;
  handlers: SocialHandlers;
  /** Connect the actions to the joined room. */
  attach(session: MultiplayerSession | null): void;
  send(text: string, channel?: ChatChannel): void;
  toggleMute(sessionId: string): void;
  setBlocked(sessionId: string, blocked: boolean): void;
  report(report: InGameReport): void;
  setPanelOpen(open: boolean): void;
  dismissNotice(): void;
}

/** Chat and safety state of the play page (task P3-09). */
export function useSocial(): Social {
  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [blocked, setBlockedSet] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<MultiplayerSession | null>(null);
  const panelOpen = useRef(false);

  const handlers = useMemo<SocialHandlers>(
    () => ({
      onChatStatus: setEnabled,
      onHistory: (history) => setMessages(history.slice(-KEEP)),
      onMessage: (message) => {
        setMessages((current) => [...current, message].slice(-KEEP));
        if (!panelOpen.current) setUnread((count) => count + 1);
      },
      onNotice: setNotice,
      onBlocked: (sessionId, on) =>
        setBlockedSet((current) => {
          const next = new Set(current);
          if (on) next.add(sessionId);
          else next.delete(sessionId);
          return next;
        }),
      onReported: (target) =>
        setNotice(
          target === 'place'
            ? 'Thanks! We will look at this place.'
            : target === 'build'
              ? 'Thanks! We will look at this build.'
              : 'Thanks! We will look at this.',
        ),
    }),
    [],
  );

  const attach = useCallback((next: MultiplayerSession | null) => {
    session.current = next;
  }, []);

  return {
    enabled,
    messages,
    unread,
    muted,
    blocked,
    notice,
    handlers,
    attach,
    send: (text, channel) => session.current?.sendChat(text, channel),
    toggleMute: (sessionId) =>
      setMuted((current) => {
        const next = new Set(current);
        if (next.has(sessionId)) next.delete(sessionId);
        else next.add(sessionId);
        return next;
      }),
    setBlocked: (sessionId, on) => session.current?.setBlocked(sessionId, on),
    report: (report) => session.current?.report(report),
    setPanelOpen: (open) => {
      panelOpen.current = open;
      if (open) setUnread(0);
    },
    dismissNotice: () => setNotice(null),
  };
}
