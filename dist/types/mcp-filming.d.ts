import { z } from 'zod';
export declare const FILMING_ARGS: {
    list_capture_sessions: z.ZodObject<{
        place_id: z.ZodString;
    }, z.core.$strict>;
    set_camera: z.ZodObject<{
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
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
    reset_camera: z.ZodObject<{
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
    get_camera: z.ZodObject<{
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
    capture_photo: z.ZodObject<{
        settings: z.ZodDefault<z.ZodObject<{
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
            settle_seconds: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
    record_video: z.ZodObject<{
        settings: z.ZodDefault<z.ZodObject<{
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
            settle_seconds: z.ZodDefault<z.ZodNumber>;
            seconds: z.ZodDefault<z.ZodNumber>;
            fps: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
    get_capture: z.ZodObject<{
        place_id: z.ZodString;
        job_id: z.ZodString;
    }, z.core.$strict>;
    studio_action: z.ZodObject<{
        operation: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"lighting">;
            lights: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                enabled: z.ZodDefault<z.ZodBoolean>;
                color: z.ZodDefault<z.ZodString>;
                intensity: z.ZodDefault<z.ZodNumber>;
                angle: z.ZodDefault<z.ZodNumber>;
                softness: z.ZodDefault<z.ZodNumber>;
                distance: z.ZodDefault<z.ZodNumber>;
                actor: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                target: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strict>>>;
        }, z.core.$strict>, z.ZodObject<{
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
                transitions: "transitions";
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
                voice: z.ZodOptional<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    language: z.ZodString;
                    voiceType: z.ZodOptional<z.ZodEnum<{
                        male: "male";
                        female: "female";
                        child: "child";
                    }>>;
                    model: z.ZodString;
                }, z.core.$strict>>;
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
            kind: z.ZodLiteral<"sound_import">;
            name: z.ZodString;
            mime: z.ZodEnum<{
                "audio/wav": "audio/wav";
                "audio/mpeg": "audio/mpeg";
                "audio/ogg": "audio/ogg";
                "audio/mp4": "audio/mp4";
                "audio/webm": "audio/webm";
                "audio/flac": "audio/flac";
                "audio/aac": "audio/aac";
            }>;
            data: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"dialogue_voice">;
            cue_id: z.ZodString;
            voice_id: z.ZodString;
            language: z.ZodString;
            shot_id: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"dialogue_track">;
            cue_id: z.ZodString;
            shot_id: z.ZodString;
            language: z.ZodString;
            start: z.ZodOptional<z.ZodNumber>;
            append: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"dialogue_preview">;
            cue_id: z.ZodString;
            shot_id: z.ZodOptional<z.ZodString>;
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
        place_id: z.ZodString;
        session_id: z.ZodString;
    }, z.core.$strict>;
};
export type FilmingTool = keyof typeof FILMING_ARGS;
export declare const FILMING_TOOLS: {
    name: "list_capture_sessions" | "set_camera" | "reset_camera" | "get_camera" | "capture_photo" | "record_video" | "get_capture" | "studio_action";
    description: string;
    inputSchema: {
        type: "object";
    };
}[];
export declare const isFilmingTool: (name: string) => name is FilmingTool;
export declare function filmingHostUrl(endpoint: string): URL;
/** Forward to the established service; no second recorder, editor or authentication flow. */
export declare function callFilmingTool(name: FilmingTool, args: unknown, endpoint?: string, token?: string): Promise<{
    [x: string]: unknown;
    content: ({
        type: "text";
        text: string;
        annotations?: {
            audience?: ("user" | "assistant")[] | undefined;
            priority?: number | undefined;
            lastModified?: string | undefined;
        } | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "image";
        data: string;
        mimeType: string;
        annotations?: {
            audience?: ("user" | "assistant")[] | undefined;
            priority?: number | undefined;
            lastModified?: string | undefined;
        } | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "audio";
        data: string;
        mimeType: string;
        annotations?: {
            audience?: ("user" | "assistant")[] | undefined;
            priority?: number | undefined;
            lastModified?: string | undefined;
        } | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "resource";
        resource: {
            uri: string;
            text: string;
            mimeType?: string | undefined;
            _meta?: Record<string, unknown> | undefined;
        } | {
            uri: string;
            blob: string;
            mimeType?: string | undefined;
            _meta?: Record<string, unknown> | undefined;
        };
        annotations?: {
            audience?: ("user" | "assistant")[] | undefined;
            priority?: number | undefined;
            lastModified?: string | undefined;
        } | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        uri: string;
        name: string;
        type: "resource_link";
        description?: string | undefined;
        mimeType?: string | undefined;
        size?: number | undefined;
        annotations?: {
            audience?: ("user" | "assistant")[] | undefined;
            priority?: number | undefined;
            lastModified?: string | undefined;
        } | undefined;
        _meta?: {
            [x: string]: unknown;
        } | undefined;
        icons?: {
            src: string;
            mimeType?: string | undefined;
            sizes?: string[] | undefined;
            theme?: "light" | "dark" | undefined;
        }[] | undefined;
        title?: string | undefined;
    })[];
    _meta?: {
        [x: string]: unknown;
        progressToken?: string | number | undefined;
        "io.modelcontextprotocol/related-task"?: {
            taskId: string;
        } | undefined;
    } | undefined;
    structuredContent?: Record<string, unknown> | undefined;
    isError?: boolean | undefined;
} | {
    [x: string]: unknown;
    toolResult: unknown;
    _meta?: {
        [x: string]: unknown;
        progressToken?: string | number | undefined;
        "io.modelcontextprotocol/related-task"?: {
            taskId: string;
        } | undefined;
    } | undefined;
}>;
