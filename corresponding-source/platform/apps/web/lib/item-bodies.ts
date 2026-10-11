import { VoiceLine } from '@genvr/contracts';
import { bodyFromItem, type AvatarBody } from '@genvr/core-library';
import { api } from './api';

/**
 * Creators' uploaded bodies seen in a place (uploaded bodies, 2026-10-03): the runtime asks for a body item it does
 * not know; the place's body route gives its data and a model link if the body may be shown there, and
 * `bodyFromItem` builds it the way Genvr's mesh bodies are built. Null when it may not be shown or cannot be read:
 * the avatar stays Classic.
 */
export function placeBodyResolver(placeId: string): (id: string) => Promise<AvatarBody | null> {
  return async (id) => {
    const { data } = await api.GET('/v1/experiences/{id}/bodies/{itemId}', {
      params: { path: { id: placeId, itemId: id } },
    });
    return data ? bodyFromItem(data.manifest as never, { model: data.model }) : null;
  };
}

/** Voice lines already asked for (lip sync, P2-44): the sound's link and the line, or null. */
const voiceLines = new Map<string, Promise<{ url: string; voice: VoiceLine } | null>>();

/**
 * A voice line a player says (the room's `said`): its sound file's link and its mouth timings, from the item's
 * package (approved items are open to everyone). Asked once per line; null when it is not a voice line.
 */
export function voiceLine(id: string): Promise<{ url: string; voice: VoiceLine } | null> {
  let line = voiceLines.get(id);
  if (!line) {
    line = api
      .GET('/v1/items/{id}/package', { params: { path: { id } } })
      .then(({ data }) => {
        const voice = VoiceLine.safeParse((data?.manifest as { voice?: unknown } | undefined)?.voice);
        const file = voice.success ? data?.files.find((one) => one.path === voice.data.sound) : undefined;
        return voice.success && file ? { url: file.url, voice: voice.data } : null;
      })
      .catch(() => null);
    voiceLines.set(id, line);
  }
  return line;
}
