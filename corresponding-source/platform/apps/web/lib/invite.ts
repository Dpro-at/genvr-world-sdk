'use client';

import { useSyncExternalStore } from 'react';

/**
 * Invite to play (task P3-10): the room this page is in, so the People tab can share a link that
 * opens the same place and joins the same room. The link grants nothing: the join ticket still
 * checks who may enter the place.
 */

let link: string | null = null;
const listeners = new Set<() => void>();

/** Room ids from links: Colyseus ids are short letters and digits. */
const ROOM_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** The room id in this page's address (`?room=`), when it looks like one. */
export function roomFromAddress(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const room = new URLSearchParams(window.location.search).get('room');
  return room && ROOM_ID.test(room) ? room : undefined;
}

/** The multiplayer session sets the room it joined, or null when it left. */
export function setInviteRoom(placeId: string, roomId: string | null): void {
  link =
    roomId && typeof window !== 'undefined'
      ? `${window.location.origin}/places/${encodeURIComponent(placeId)}/play?room=${encodeURIComponent(roomId)}`
      : null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The link to this room, or null while playing alone. */
export function useInviteLink(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => link,
    () => null,
  );
}
