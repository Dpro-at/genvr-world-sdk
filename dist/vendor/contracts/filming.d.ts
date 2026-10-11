import { z } from 'zod';
export declare const FilmPoint: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
export declare const FilmPreset: z.ZodEnum<{
    static: "static";
    handheld: "handheld";
    running: "running";
    drone: "drone";
    follow: "follow";
    side: "side";
    orbit: "orbit";
}>;
export type FilmPreset = z.infer<typeof FilmPreset>;
export declare const FilmEase: z.ZodEnum<{
    out: "out";
    in: "in";
    linear: "linear";
    in_out: "in_out";
}>;
/** One stop of a camera flight: where the camera is and looks at `at` seconds after the shot starts. */
export declare const FilmWaypoint: z.ZodObject<{
    at: z.ZodNumber;
    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    ease: z.ZodDefault<z.ZodEnum<{
        out: "out";
        in: "in";
        linear: "linear";
        in_out: "in_out";
    }>>;
    fov: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type FilmWaypoint = z.infer<typeof FilmWaypoint>;
/** Absolute world metres, degrees for lenses/roll, seconds for time. */
export declare const FilmCamera: z.ZodObject<{
    preset: z.ZodDefault<z.ZodEnum<{
        static: "static";
        handheld: "handheld";
        running: "running";
        drone: "drone";
        follow: "follow";
        side: "side";
        orbit: "orbit";
    }>>;
    position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
    target: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
    follow_player: z.ZodDefault<z.ZodBoolean>;
    fov: z.ZodDefault<z.ZodNumber>;
    responsiveness: z.ZodOptional<z.ZodNumber>;
    shake: z.ZodOptional<z.ZodNumber>;
    speed: z.ZodDefault<z.ZodNumber>;
    seed: z.ZodDefault<z.ZodNumber>;
    roll: z.ZodDefault<z.ZodNumber>;
    path: z.ZodOptional<z.ZodArray<z.ZodObject<{
        at: z.ZodNumber;
        position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        ease: z.ZodDefault<z.ZodEnum<{
            out: "out";
            in: "in";
            linear: "linear";
            in_out: "in_out";
        }>>;
        fov: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type FilmCamera = z.infer<typeof FilmCamera>;
export declare const FilmView: z.ZodObject<{
    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    direction: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    fov: z.ZodNumber;
    render_width: z.ZodNumber;
    render_height: z.ZodNumber;
}, z.core.$strip>;
export type FilmView = z.infer<typeof FilmView>;
export declare const FilmPhoto: z.ZodObject<{
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
    settle_seconds: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const FilmVideo: z.ZodObject<{
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
    settle_seconds: z.ZodDefault<z.ZodNumber>;
    seconds: z.ZodDefault<z.ZodNumber>;
    fps: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
/** A timed avatar/object action and dialogue line, in seconds of its recording (media time). */
/** A spot on the ground of the world, in world metres (FILM-10). */
export declare const FilmSceneSpot: z.ZodObject<{
    x: z.ZodNumber;
    z: z.ZodNumber;
}, z.core.$strict>;
export declare const FilmSceneCue: z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    label: z.ZodString;
    action: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
    text: z.ZodString;
    audio: z.ZodOptional<z.ZodString>;
    volume: z.ZodNumber;
    at: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strict>>;
    to: z.ZodOptional<z.ZodArray<z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strict>>>;
}, z.core.$strict>;
/** Panel arrangements inside Studio Filming (FILM-04). */
/** Filming workspaces; `story` is the place's scroll story (SCROLL-03: moved here from its own Studio tab). */
export declare const FilmWorkspace: z.ZodEnum<{
    sound: "sound";
    shoot: "shoot";
    edit: "edit";
    captions: "captions";
    colour: "colour";
    story: "story";
}>;
export type FilmWorkspace = z.infer<typeof FilmWorkspace>;
/** One editor command (ids and arguments come from `{ kind: 'commands' }`; times are seconds). */
export declare const FilmStudioStep: z.ZodObject<{
    id: z.ZodString;
    args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
/**
 * Operations on the Studio Filming project in the connected browser. `commands`, `command` and
 * `batch` use the same command list as the editor's buttons and keys (FILM-02); the older
 * `split`, `remove`, `trim`, `cues`, `undo`, `redo` kinds are kept for existing agents.
 */
export declare const FilmStudioOperation: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"inspect">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"commands">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"sound">;
    action: z.ZodEnum<{
        match_loudness: "match_loudness";
        fit_music: "fit_music";
    }>;
    clip: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"subtitles">;
    languages: z.ZodArray<z.ZodString>;
    spoken: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"ui">;
    workspace: z.ZodOptional<z.ZodEnum<{
        sound: "sound";
        shoot: "shoot";
        edit: "edit";
        captions: "captions";
        colour: "colour";
        story: "story";
    }>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"command">;
    id: z.ZodString;
    args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"batch">;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strict>>;
    label: z.ZodOptional<z.ZodString>;
    atomic: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"frame">;
    at: z.ZodNumber;
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"trim">;
    shot_id: z.ZodString;
    in: z.ZodNumber;
    out: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"split">;
    shot_id: z.ZodString;
    at: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"move">;
    shot_id: z.ZodString;
    delta: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"remove">;
    shot_id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"cues">;
    shot_id: z.ZodOptional<z.ZodString>;
    cues: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        actor: z.ZodString;
        label: z.ZodString;
        action: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
        text: z.ZodString;
        audio: z.ZodOptional<z.ZodString>;
        volume: z.ZodNumber;
        at: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>>;
        to: z.ZodOptional<z.ZodArray<z.ZodObject<{
            x: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"record">;
    shot_id: z.ZodOptional<z.ZodString>;
    gameplay: z.ZodDefault<z.ZodBoolean>;
    settings: z.ZodDefault<z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
        settle_seconds: z.ZodDefault<z.ZodNumber>;
        seconds: z.ZodDefault<z.ZodNumber>;
        fps: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    world_sound: z.ZodOptional<z.ZodBoolean>;
    live_actors: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"voice">;
    language: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"subtitle_file">;
    language: z.ZodString;
    format: z.ZodDefault<z.ZodEnum<{
        srt: "srt";
        vtt: "vtt";
    }>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"export">;
    shot_id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"undo">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"redo">;
}, z.core.$strict>], "kind">;
export type FilmStudioOperation = z.infer<typeof FilmStudioOperation>;
/** What the browser returns for a studio operation (validated by the API before an agent sees it). */
export declare const FilmStudioResult: z.ZodObject<{
    film: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    result: z.ZodOptional<z.ZodUnknown>;
    commands: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        group: z.ZodString;
        shortcut: z.ZodOptional<z.ZodString>;
        args: z.ZodUnknown;
        enabled: z.ZodBoolean;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    failed: z.ZodOptional<z.ZodObject<{
        index: z.ZodNumber;
        id: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>;
    undo: z.ZodOptional<z.ZodString>;
    redo: z.ZodOptional<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        workspace: z.ZodEnum<{
            sound: "sound";
            shoot: "shoot";
            edit: "edit";
            captions: "captions";
            colour: "colour";
            story: "story";
        }>;
        playhead: z.ZodNumber;
        selection: z.ZodArray<z.ZodString>;
        source: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    actors: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
    }, z.core.$strict>>;
    actions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
    }, z.core.$strict>>;
    assets: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        mime: z.ZodString;
        bytes: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const FilmCommand: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"camera">;
    camera: z.ZodObject<{
        preset: z.ZodDefault<z.ZodEnum<{
            static: "static";
            handheld: "handheld";
            running: "running";
            drone: "drone";
            follow: "follow";
            side: "side";
            orbit: "orbit";
        }>>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        target: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        follow_player: z.ZodDefault<z.ZodBoolean>;
        fov: z.ZodDefault<z.ZodNumber>;
        responsiveness: z.ZodOptional<z.ZodNumber>;
        shake: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodDefault<z.ZodNumber>;
        seed: z.ZodDefault<z.ZodNumber>;
        roll: z.ZodDefault<z.ZodNumber>;
        path: z.ZodOptional<z.ZodArray<z.ZodObject<{
            at: z.ZodNumber;
            position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            ease: z.ZodDefault<z.ZodEnum<{
                out: "out";
                in: "in";
                linear: "linear";
                in_out: "in_out";
            }>>;
            fov: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"photo">;
    settings: z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
        settle_seconds: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"video">;
    settings: z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
        settle_seconds: z.ZodDefault<z.ZodNumber>;
        seconds: z.ZodDefault<z.ZodNumber>;
        fps: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"inspect">;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"studio">;
    operation: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"inspect">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"commands">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"sound">;
        action: z.ZodEnum<{
            match_loudness: "match_loudness";
            fit_music: "fit_music";
        }>;
        clip: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"subtitles">;
        languages: z.ZodArray<z.ZodString>;
        spoken: z.ZodOptional<z.ZodString>;
        voice: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"ui">;
        workspace: z.ZodOptional<z.ZodEnum<{
            sound: "sound";
            shoot: "shoot";
            edit: "edit";
            captions: "captions";
            colour: "colour";
            story: "story";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"command">;
        id: z.ZodString;
        args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"batch">;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strict>>;
        label: z.ZodOptional<z.ZodString>;
        atomic: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"frame">;
        at: z.ZodNumber;
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"trim">;
        shot_id: z.ZodString;
        in: z.ZodNumber;
        out: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"split">;
        shot_id: z.ZodString;
        at: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"move">;
        shot_id: z.ZodString;
        delta: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"remove">;
        shot_id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"cues">;
        shot_id: z.ZodOptional<z.ZodString>;
        cues: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            actor: z.ZodString;
            label: z.ZodString;
            action: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
            text: z.ZodString;
            audio: z.ZodOptional<z.ZodString>;
            volume: z.ZodNumber;
            at: z.ZodOptional<z.ZodObject<{
                x: z.ZodNumber;
                z: z.ZodNumber;
            }, z.core.$strict>>;
            to: z.ZodOptional<z.ZodArray<z.ZodObject<{
                x: z.ZodNumber;
                z: z.ZodNumber;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"record">;
        shot_id: z.ZodOptional<z.ZodString>;
        gameplay: z.ZodDefault<z.ZodBoolean>;
        settings: z.ZodDefault<z.ZodObject<{
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
            settle_seconds: z.ZodDefault<z.ZodNumber>;
            seconds: z.ZodDefault<z.ZodNumber>;
            fps: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        world_sound: z.ZodOptional<z.ZodBoolean>;
        live_actors: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"voice">;
        language: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"subtitle_file">;
        language: z.ZodString;
        format: z.ZodDefault<z.ZodEnum<{
            srt: "srt";
            vtt: "vtt";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"export">;
        shot_id: z.ZodOptional<z.ZodString>;
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"undo">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"redo">;
    }, z.core.$strict>], "kind">;
}, z.core.$strip>], "kind">;
export type FilmCommand = z.infer<typeof FilmCommand>;
