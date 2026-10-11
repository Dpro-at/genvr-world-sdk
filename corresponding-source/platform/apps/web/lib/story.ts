import {
  FilmWaypoint,
  type FilmView,
  type PlaceStory,
  type StoryCamera,
  type StoryStop as PlaceStoryStop,
} from '@genvr/contracts';

/** One stop of a world story: where the camera is, and the words shown there. */
export interface StoryStop {
  /** Camera stop; `at` is the stop's place on the scroll (0, 1, 2 ...), filled in from the order. */
  camera: FilmWaypoint;
  kicker?: string;
  title: string;
  text?: string;
  /** Which side of the screen the words sit on, so they never cover what the stop shows. */
  side: 'left' | 'right' | 'center';
}

/** A scroll page made from a place: the camera flies through the stops as the visitor scrolls. */
export interface Story {
  place: string;
  title: string;
  stops: StoryStop[];
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** Reads a story file; the camera stops get their scroll places from their order. */
export function parseStory(raw: unknown): Story {
  const data = (raw ?? {}) as Record<string, unknown>;
  const place = text(data.place, 40);
  if (!place || !/^exp-[0-9a-f]{16}$/.test(place)) throw new Error('The story names no place.');
  const stops = Array.isArray(data.stops) ? data.stops : [];
  if (stops.length < 2 || stops.length > 32) throw new Error('A story needs 2 to 32 stops.');
  return {
    place,
    title: text(data.title, 120) ?? 'Story',
    stops: stops.map((entry, index) => {
      const stop = (entry ?? {}) as Record<string, unknown>;
      const side = stop.side === 'right' || stop.side === 'center' ? stop.side : 'left';
      return {
        camera: FilmWaypoint.parse({ ...(stop.camera as object), at: index }),
        kicker: text(stop.kicker, 60),
        title: text(stop.title, 120) ?? '',
        text: text(stop.text, 600),
        side,
      };
    }),
  };
}

/**
 * Story time (0 = first stop, stops - 1 = last) for a scroll position: every stop owns one
 * section of `sectionHeight` pixels, and the last stop is held to the end of the page.
 */
export function storyTime(scrollY: number, sectionHeight: number, stops: number): number {
  if (sectionHeight <= 0) return 0;
  return Math.min(stops - 1, Math.max(0, scrollY / sectionHeight));
}

/** Moves `current` toward `target` the same way at any frame rate (`rate` per second). */
export function follow(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * Math.max(0, dt));
}

/** The screen shape the stops are framed for (a wide desktop window). */
export const STORY_ASPECT = 16 / 10;

/**
 * Vertical field of view (degrees) that shows on a narrower screen as much across as `fov` shows
 * on a story-shaped one: a phone held upright would otherwise see only the middle of every stop.
 */
export function fitFov(fov: number, aspect: number, max = 90): number {
  if (aspect >= STORY_ASPECT || aspect <= 0) return fov;
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (STORY_ASPECT / aspect));
  return Math.min(max, (half * 360) / Math.PI);
}

/** Story times the camera visits behind the loading screen, so nothing is first seen while scrolling. */
export function warmupTimes(stops: number, step = 0.25): number[] {
  const times: number[] = [];
  for (let t = 0; t <= stops - 1 + 1e-9; t += step) times.push(Math.min(stops - 1, t));
  return times;
}

/** The story kept in a place (SCROLL-02) as a page story; null when it has fewer than two stops. */
export function storyFromPlace(place: string, story: PlaceStory | undefined): Story | null {
  if (!story || story.stops.length < 2) return null;
  return {
    place,
    title: story.title ?? 'Story',
    stops: story.stops.map((stop, index) => ({
      camera: { ...stop.camera, at: index },
      ...(stop.kicker ? { kicker: stop.kicker } : {}),
      title: stop.title,
      ...(stop.text ? { text: stop.text } : {}),
      side: stop.side,
    })),
  };
}

/** The flight through a place story's stops, one stop per unit of time. */
export function storyPath(stops: readonly PlaceStoryStop[]): FilmWaypoint[] {
  return stops.map((stop, index) => ({ ...stop.camera, at: index }));
}

/** How far ahead of the camera a new stop looks (m) when made from the studio camera. */
export const STOP_LOOK_DISTANCE = 30;

const round = (value: number) => Math.round(value * 100) / 100;

/** A stop camera from the studio camera: where it is, a point ahead of it, and its lens. */
export function cameraFromView(view: Pick<FilmView, 'position' | 'direction' | 'fov'>): StoryCamera {
  const [x, y, z] = view.position;
  const [dx, dy, dz] = view.direction;
  const length = Math.hypot(dx, dy, dz) || 1;
  const ahead = STOP_LOOK_DISTANCE / length;
  return {
    position: [round(x), round(y), round(z)],
    target: [round(x + dx * ahead), round(y + dy * ahead), round(z + dz * ahead)],
    fov: round(view.fov),
    ease: 'in_out',
  };
}
