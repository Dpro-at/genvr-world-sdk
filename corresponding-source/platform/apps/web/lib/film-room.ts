import type { FilmTakeEvent, FilmTakeMessage, FilmVoiceEvent, FilmVoiceMessage } from '@genvr/contracts';

/**
 * Live actors (FILM-11): the link between the place's room (multiplayer.ts) and filming. The room session registers
 * how to send; the studio (director) and the actor's microphone listen. Nothing is sent while not in a room.
 */
type Sender = { take(message: FilmTakeMessage): void; voice(message: FilmVoiceMessage): void; self: string };
let sender: Sender | null = null;
const takeListeners = new Set<(event: FilmTakeEvent) => void>();
const voiceListeners = new Set<(event: FilmVoiceEvent) => void>();

export const filmRoom = {
  /** Called by the room session when it joins (with how to send) and leaves (null). */
  connect(next: Sender | null) { sender = next; },
  get connected() { return sender !== null; },
  get self() { return sender?.self ?? null; },
  sendTake(message: FilmTakeMessage) { sender?.take(message); return sender !== null; },
  sendVoice(message: FilmVoiceMessage) { sender?.voice(message); },
  receivedTake(event: FilmTakeEvent) { for (const listen of takeListeners) listen(event); },
  receivedVoice(event: FilmVoiceEvent) { for (const listen of voiceListeners) listen(event); },
  onTake(listen: (event: FilmTakeEvent) => void) { takeListeners.add(listen); return () => { takeListeners.delete(listen); }; },
  onVoice(listen: (event: FilmVoiceEvent) => void) { voiceListeners.add(listen); return () => { voiceListeners.delete(listen); }; },
};
