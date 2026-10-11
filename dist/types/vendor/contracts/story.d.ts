import { z } from 'zod';
/** Most stops one place story holds (the filming path's own limit). */
export declare const STORY_MAX_STOPS = 32;
/** Where the camera is and looks at one stop of a place story. */
export declare const StoryCamera: z.ZodObject<{
    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    fov: z.ZodOptional<z.ZodNumber>;
    ease: z.ZodDefault<z.ZodEnum<{
        out: "out";
        in: "in";
        linear: "linear";
        in_out: "in_out";
    }>>;
}, z.core.$strict>;
export type StoryCamera = z.infer<typeof StoryCamera>;
/** One stop of a place story: a camera view and the words shown there (SCROLL-02). */
export declare const StoryStop: z.ZodObject<{
    camera: z.ZodObject<{
        position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        fov: z.ZodOptional<z.ZodNumber>;
        ease: z.ZodDefault<z.ZodEnum<{
            out: "out";
            in: "in";
            linear: "linear";
            in_out: "in_out";
        }>>;
    }, z.core.$strict>;
    kicker: z.ZodOptional<z.ZodString>;
    title: z.ZodDefault<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    side: z.ZodDefault<z.ZodEnum<{
        left: "left";
        right: "right";
        center: "center";
    }>>;
}, z.core.$strict>;
export type StoryStop = z.infer<typeof StoryStop>;
/**
 * The place told as a scroll page (SCROLL-02): the camera flies through the stops as a visitor
 * scrolls `/showcase?place=<id>`. Made in the studio's Story panel or with the `set_story` tool.
 */
export declare const PlaceStory: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    stops: z.ZodArray<z.ZodObject<{
        camera: z.ZodObject<{
            position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            fov: z.ZodOptional<z.ZodNumber>;
            ease: z.ZodDefault<z.ZodEnum<{
                out: "out";
                in: "in";
                linear: "linear";
                in_out: "in_out";
            }>>;
        }, z.core.$strict>;
        kicker: z.ZodOptional<z.ZodString>;
        title: z.ZodDefault<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        side: z.ZodDefault<z.ZodEnum<{
            left: "left";
            right: "right";
            center: "center";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PlaceStory = z.infer<typeof PlaceStory>;
