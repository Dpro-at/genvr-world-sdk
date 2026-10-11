import type { TerrainFieldPageLoader } from '@genvr/runtime';
import { api, errorMessage } from './api';

/** Typed authenticated bridge; the runtime owns validation, decoding and snapshot publication. */
export function placeTerrainFieldLoader(
  placeId: string,
  sets: Readonly<Record<string, { tiles: readonly string[] }>> | undefined,
): TerrainFieldPageLoader {
  const coordinates = new Map(
    Object.entries(sets ?? {}).map(([id, set]) => [
      id,
      [...set.tiles].sort((a, b) => {
        const [ax, az] = a.split(',').map(Number),
          [bx, bz] = b.split(',').map(Number);
        return az! - bz! || ax! - bx!;
      }),
    ]),
  );
  return async (request, signal) => {
    const refs = coordinates.get(request.setId);
    const requested = request.coordinates.map(({ tx, tz }) => `${tx},${tz}`);
    const from = refs?.indexOf(requested[0] ?? '') ?? -1;
    if (
      !requested.length ||
      requested.length > 8 ||
      from < 0 ||
      requested.some((ref, index) => refs?.[from + index] !== ref)
    )
      throw new Error('Terrain page does not match the world snapshot');
    const { data, error } = await api.GET('/v1/experiences/{id}/terrain-fields/{setId}', {
      params: {
        path: { id: placeId, setId: request.setId },
        query: {
          expected_version: request.version,
          from_tile: from,
          max_tiles: requested.length,
        },
      },
      signal,
    });
    if (!data) throw new Error(errorMessage(error, 'Could not load terrain. Reopen the place to retry.'));
    if (data.set_id !== request.setId) throw new Error('Terrain response names a different field set');
    return { version: data.place_version, tiles: data.tiles };
  };
}
