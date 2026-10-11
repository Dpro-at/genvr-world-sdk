import { z } from 'zod';
import { FilmEase, FilmPoint } from './filming.js';

/** Most stops one place story holds (the filming path's own limit). */
export const STORY_MAX_STOPS = 32;

/** Where the camera is and looks at one stop of a place story. */
export const StoryCamera = z
  .object({
    position: FilmPoint,
    target: FilmPoint,
    /** Vertical field of view (degrees), framed for a wide window; narrow screens widen it. */
    fov: z.number().min(10).max(120).optional(),
    /** How the flight from this stop to the next one speeds up and slows down. */
    ease: FilmEase.default('in_out'),
  })
  .strict();
export type StoryCamera = z.infer<typeof StoryCamera>;

/** One stop of a place story: a camera view and the words shown there (SCROLL-02). */
export const StoryStop = z
  .object({
    camera: StoryCamera,
    kicker: z.string().trim().max(60).optional(),
    title: z.string().trim().max(120).default(''),
    text: z.string().trim().max(600).optional(),
    /** Which side of the screen the words sit on, so they never cover what the stop shows. */
    side: z.enum(['left', 'right', 'center']).default('left'),
  })
  .strict();
export type StoryStop = z.infer<typeof StoryStop>;

/**
 * The place told as a scroll page (SCROLL-02): the camera flies through the stops as a visitor
 * scrolls `/showcase?place=<id>`. Made in the studio's Story panel or with the `set_story` tool.
 */
export const PlaceStory = z
  .object({
    title: z.string().trim().max(120).optional(),
    stops: z.array(StoryStop).max(STORY_MAX_STOPS),
  })
  .strict();
export type PlaceStory = z.infer<typeof PlaceStory>;
