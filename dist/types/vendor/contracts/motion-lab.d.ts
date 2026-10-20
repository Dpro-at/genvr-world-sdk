import { z } from 'zod';
/**
 * Motion lab (MOTION-LAB L1 + L2): an empty grey test world with a measured course, a street with box cars, repeatable
 * runs of a move, scores and motion versions. A lab is its own project (never a real world). Everything a person does in
 * the Lab area, an agent does through the `motion_lab` tool with the same owner gates.
 */
export declare const LAB_FORMAT = 1;
/** Runs are repeatable: a fixed step and a seed give the same run every time. */
export declare const LAB_STEP: number;
/** Runs kept with their frames (Q-LAB-2): the last 20, plus the frames of the best version. */
export declare const LAB_KEEP_RUNS = 20;
/** The lab character (Mohamed, 2026-10-19): our latest robot, body id `robot` ("Standard robot"). */
export declare const LAB_CHARACTER = "robot";
export declare const LabStep: z.ZodObject<{
    kind: z.ZodLiteral<"step">;
    height: z.ZodDefault<z.ZodNumber>;
    depth: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const LabRamp: z.ZodObject<{
    kind: z.ZodLiteral<"ramp">;
    rise: z.ZodDefault<z.ZodNumber>;
    length: z.ZodDefault<z.ZodNumber>;
    top: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
/** A gap between two raised blocks: `width` is the jump (metres of nothing), `height` the blocks' height. */
export declare const LabGap: z.ZodObject<{
    kind: z.ZodLiteral<"gap">;
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
    landing: z.ZodDefault<z.ZodNumber>;
    landing_depth: z.ZodDefault<z.ZodNumber>;
    lane: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const LabLowWall: z.ZodObject<{
    kind: z.ZodLiteral<"low_wall">;
    height: z.ZodDefault<z.ZodNumber>;
    thickness: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const LabWindow: z.ZodObject<{
    kind: z.ZodLiteral<"window">;
    sill: z.ZodDefault<z.ZodNumber>;
    opening_width: z.ZodDefault<z.ZodNumber>;
    opening_height: z.ZodDefault<z.ZodNumber>;
    wall_height: z.ZodDefault<z.ZodNumber>;
    wall_width: z.ZodDefault<z.ZodNumber>;
    thickness: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const LabObstacle: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"step">;
    height: z.ZodDefault<z.ZodNumber>;
    depth: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"ramp">;
    rise: z.ZodDefault<z.ZodNumber>;
    length: z.ZodDefault<z.ZodNumber>;
    top: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"gap">;
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
    landing: z.ZodDefault<z.ZodNumber>;
    landing_depth: z.ZodDefault<z.ZodNumber>;
    lane: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"low_wall">;
    height: z.ZodDefault<z.ZodNumber>;
    thickness: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"window">;
    sill: z.ZodDefault<z.ZodNumber>;
    opening_width: z.ZodDefault<z.ZodNumber>;
    opening_height: z.ZodDefault<z.ZodNumber>;
    wall_height: z.ZodDefault<z.ZodNumber>;
    wall_width: z.ZodDefault<z.ZodNumber>;
    thickness: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    z: z.ZodNumber;
    x: z.ZodDefault<z.ZodNumber>;
    hidden: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>], "kind">;
export type LabObstacle = z.infer<typeof LabObstacle>;
export type LabObstacleKind = LabObstacle['kind'];
export declare const LAB_OBSTACLE_KINDS: readonly LabObstacleKind[];
/** Shown in the Add tiles but not built yet (later phases). */
export declare const LAB_LATER_KINDS: readonly ["beam", "door", "uneven", "moving_platform"];
/** A street across the course: lanes run along x; the crossing is on the course's centre line. */
export declare const LabStreet: z.ZodObject<{
    z: z.ZodDefault<z.ZodNumber>;
    lanes: z.ZodDefault<z.ZodNumber>;
    lane_width: z.ZodDefault<z.ZodNumber>;
    crossing: z.ZodDefault<z.ZodBoolean>;
    light: z.ZodDefault<z.ZodObject<{
        cycle_s: z.ZodDefault<z.ZodNumber>;
        red_s: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type LabStreet = z.infer<typeof LabStreet>;
/** A box car on a loop along one lane; `runs_red`: it does not stop for its red light (an edge case). */
export declare const LabCar: z.ZodObject<{
    id: z.ZodString;
    lane: z.ZodDefault<z.ZodNumber>;
    speed: z.ZodDefault<z.ZodNumber>;
    offset_s: z.ZodDefault<z.ZodNumber>;
    runs_red: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type LabCar = z.infer<typeof LabCar>;
export declare const LabCourse: z.ZodObject<{
    format: z.ZodDefault<z.ZodLiteral<1>>;
    seed: z.ZodDefault<z.ZodNumber>;
    obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"step">;
        height: z.ZodDefault<z.ZodNumber>;
        depth: z.ZodDefault<z.ZodNumber>;
        width: z.ZodDefault<z.ZodNumber>;
        id: z.ZodString;
        z: z.ZodNumber;
        x: z.ZodDefault<z.ZodNumber>;
        hidden: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"ramp">;
        rise: z.ZodDefault<z.ZodNumber>;
        length: z.ZodDefault<z.ZodNumber>;
        top: z.ZodDefault<z.ZodNumber>;
        width: z.ZodDefault<z.ZodNumber>;
        id: z.ZodString;
        z: z.ZodNumber;
        x: z.ZodDefault<z.ZodNumber>;
        hidden: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"gap">;
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
        landing: z.ZodDefault<z.ZodNumber>;
        landing_depth: z.ZodDefault<z.ZodNumber>;
        lane: z.ZodDefault<z.ZodNumber>;
        id: z.ZodString;
        z: z.ZodNumber;
        x: z.ZodDefault<z.ZodNumber>;
        hidden: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"low_wall">;
        height: z.ZodDefault<z.ZodNumber>;
        thickness: z.ZodDefault<z.ZodNumber>;
        width: z.ZodDefault<z.ZodNumber>;
        id: z.ZodString;
        z: z.ZodNumber;
        x: z.ZodDefault<z.ZodNumber>;
        hidden: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"window">;
        sill: z.ZodDefault<z.ZodNumber>;
        opening_width: z.ZodDefault<z.ZodNumber>;
        opening_height: z.ZodDefault<z.ZodNumber>;
        wall_height: z.ZodDefault<z.ZodNumber>;
        wall_width: z.ZodDefault<z.ZodNumber>;
        thickness: z.ZodDefault<z.ZodNumber>;
        id: z.ZodString;
        z: z.ZodNumber;
        x: z.ZodDefault<z.ZodNumber>;
        hidden: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>], "kind">>>;
    street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        z: z.ZodDefault<z.ZodNumber>;
        lanes: z.ZodDefault<z.ZodNumber>;
        lane_width: z.ZodDefault<z.ZodNumber>;
        crossing: z.ZodDefault<z.ZodBoolean>;
        light: z.ZodDefault<z.ZodObject<{
            cycle_s: z.ZodDefault<z.ZodNumber>;
            red_s: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        lane: z.ZodDefault<z.ZodNumber>;
        speed: z.ZodDefault<z.ZodNumber>;
        offset_s: z.ZodDefault<z.ZodNumber>;
        runs_red: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>>;
    finish_z: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type LabCourse = z.infer<typeof LabCourse>;
/** How the character runs the course. `motion`: the base move from the Moves list (Walk, Run …). */
export declare const LabRunSettings: z.ZodObject<{
    motion: z.ZodDefault<z.ZodString>;
    character: z.ZodDefault<z.ZodString>;
    speed: z.ZodDefault<z.ZodNumber>;
    stride: z.ZodDefault<z.ZodNumber>;
    step_height: z.ZodDefault<z.ZodNumber>;
    jump_timing_ms: z.ZodDefault<z.ZodNumber>;
    blend_s: z.ZodDefault<z.ZodNumber>;
    lean_deg: z.ZodDefault<z.ZodNumber>;
    wait_for_green: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type LabRunSettings = z.infer<typeof LabRunSettings>;
export declare const LabRunSettingsPatch: z.ZodObject<{
    motion: z.ZodOptional<z.ZodString>;
    character: z.ZodOptional<z.ZodString>;
    speed: z.ZodOptional<z.ZodNumber>;
    stride: z.ZodOptional<z.ZodNumber>;
    step_height: z.ZodOptional<z.ZodNumber>;
    jump_timing_ms: z.ZodOptional<z.ZodNumber>;
    blend_s: z.ZodOptional<z.ZodNumber>;
    lean_deg: z.ZodOptional<z.ZodNumber>;
    wait_for_green: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type LabRunSettingsPatch = z.infer<typeof LabRunSettingsPatch>;
export declare const LabScore: z.ZodObject<{
    foot_slide_cm: z.ZodNumber;
    penetration_cm: z.ZodNumber;
    fell: z.ZodBoolean;
    car_hit: z.ZodBoolean;
    finished: z.ZodBoolean;
    time_s: z.ZodNumber;
    smoothness: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strict>;
export type LabScore = z.infer<typeof LabScore>;
export declare const LabEventKind: z.ZodEnum<{
    start: "start";
    finish: "finish";
    window: "window";
    step: "step";
    ramp: "ramp";
    crossing: "crossing";
    car_hit: "car_hit";
    gap_jump: "gap_jump";
    land: "land";
    vault: "vault";
    wait: "wait";
    car_near: "car_near";
    fall: "fall";
    slide: "slide";
    blocked: "blocked";
}>;
export declare const LabEvent: z.ZodObject<{
    t: z.ZodNumber;
    kind: z.ZodEnum<{
        start: "start";
        finish: "finish";
        window: "window";
        step: "step";
        ramp: "ramp";
        crossing: "crossing";
        car_hit: "car_hit";
        gap_jump: "gap_jump";
        land: "land";
        vault: "vault";
        wait: "wait";
        car_near: "car_near";
        fall: "fall";
        slide: "slide";
        blocked: "blocked";
    }>;
    label: z.ZodString;
    obstacle: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type LabEvent = z.infer<typeof LabEvent>;
export declare const LabRun: z.ZodObject<{
    id: z.ZodString;
    at: z.ZodString;
    seed: z.ZodNumber;
    settings: z.ZodObject<{
        motion: z.ZodDefault<z.ZodString>;
        character: z.ZodDefault<z.ZodString>;
        speed: z.ZodDefault<z.ZodNumber>;
        stride: z.ZodDefault<z.ZodNumber>;
        step_height: z.ZodDefault<z.ZodNumber>;
        jump_timing_ms: z.ZodDefault<z.ZodNumber>;
        blend_s: z.ZodDefault<z.ZodNumber>;
        lean_deg: z.ZodDefault<z.ZodNumber>;
        wait_for_green: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    course: z.ZodObject<{
        format: z.ZodDefault<z.ZodLiteral<1>>;
        seed: z.ZodDefault<z.ZodNumber>;
        obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"step">;
            height: z.ZodDefault<z.ZodNumber>;
            depth: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"ramp">;
            rise: z.ZodDefault<z.ZodNumber>;
            length: z.ZodDefault<z.ZodNumber>;
            top: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"gap">;
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
            landing: z.ZodDefault<z.ZodNumber>;
            landing_depth: z.ZodDefault<z.ZodNumber>;
            lane: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"low_wall">;
            height: z.ZodDefault<z.ZodNumber>;
            thickness: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"window">;
            sill: z.ZodDefault<z.ZodNumber>;
            opening_width: z.ZodDefault<z.ZodNumber>;
            opening_height: z.ZodDefault<z.ZodNumber>;
            wall_height: z.ZodDefault<z.ZodNumber>;
            wall_width: z.ZodDefault<z.ZodNumber>;
            thickness: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>], "kind">>>;
        street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            z: z.ZodDefault<z.ZodNumber>;
            lanes: z.ZodDefault<z.ZodNumber>;
            lane_width: z.ZodDefault<z.ZodNumber>;
            crossing: z.ZodDefault<z.ZodBoolean>;
            light: z.ZodDefault<z.ZodObject<{
                cycle_s: z.ZodDefault<z.ZodNumber>;
                red_s: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>;
        }, z.core.$strict>>>;
        cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            lane: z.ZodDefault<z.ZodNumber>;
            speed: z.ZodDefault<z.ZodNumber>;
            offset_s: z.ZodDefault<z.ZodNumber>;
            runs_red: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>>;
        finish_z: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    score: z.ZodObject<{
        foot_slide_cm: z.ZodNumber;
        penetration_cm: z.ZodNumber;
        fell: z.ZodBoolean;
        car_hit: z.ZodBoolean;
        finished: z.ZodBoolean;
        time_s: z.ZodNumber;
        smoothness: z.ZodNumber;
        total: z.ZodNumber;
    }, z.core.$strict>;
    events: z.ZodArray<z.ZodObject<{
        t: z.ZodNumber;
        kind: z.ZodEnum<{
            start: "start";
            finish: "finish";
            window: "window";
            step: "step";
            ramp: "ramp";
            crossing: "crossing";
            car_hit: "car_hit";
            gap_jump: "gap_jump";
            land: "land";
            vault: "vault";
            wait: "wait";
            car_near: "car_near";
            fall: "fall";
            slide: "slide";
            blocked: "blocked";
        }>;
        label: z.ZodString;
        obstacle: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    version: z.ZodOptional<z.ZodString>;
    by: z.ZodDefault<z.ZodEnum<{
        person: "person";
        agent: "agent";
    }>>;
}, z.core.$strict>;
export type LabRun = z.infer<typeof LabRun>;
export declare const MotionVersion: z.ZodObject<{
    id: z.ZodString;
    motion: z.ZodString;
    n: z.ZodNumber;
    note: z.ZodDefault<z.ZodString>;
    settings: z.ZodObject<{
        motion: z.ZodDefault<z.ZodString>;
        character: z.ZodDefault<z.ZodString>;
        speed: z.ZodDefault<z.ZodNumber>;
        stride: z.ZodDefault<z.ZodNumber>;
        step_height: z.ZodDefault<z.ZodNumber>;
        jump_timing_ms: z.ZodDefault<z.ZodNumber>;
        blend_s: z.ZodDefault<z.ZodNumber>;
        lean_deg: z.ZodDefault<z.ZodNumber>;
        wait_for_green: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    score: z.ZodObject<{
        foot_slide_cm: z.ZodNumber;
        penetration_cm: z.ZodNumber;
        fell: z.ZodBoolean;
        car_hit: z.ZodBoolean;
        finished: z.ZodBoolean;
        time_s: z.ZodNumber;
        smoothness: z.ZodNumber;
        total: z.ZodNumber;
    }, z.core.$strict>;
    run: z.ZodString;
    best: z.ZodDefault<z.ZodBoolean>;
    by: z.ZodDefault<z.ZodEnum<{
        person: "person";
        agent: "agent";
    }>>;
    at: z.ZodString;
}, z.core.$strict>;
export type MotionVersion = z.infer<typeof MotionVersion>;
/**
 * Sharing a motion with the GenVR community (board M14). A version is first only on this device; sharing publishes it,
 * so an agent can only prepare a share (`pending`) and the owner confirms each one; the owner (or an agent, with
 * `confirm`) can stop sharing at any time. Never shareable: motions not made from a GenVR library move (for example
 * from Mixamo, Q-MIXAMO) or from a video the owner has no rights to.
 */
export declare const MOTION_SHARE_LICENCE: {
    readonly id: "genvr-community-1";
    readonly name: "GenVR community licence";
    /** Q-LAB-3, chosen by the owner on 2026-10-20. */
    readonly text: "Free to use in GenVR worlds and films, also commercially. Credit the creator. Do not sell or re-share the motion file on its own.";
};
export declare const MotionShareTag: z.ZodString;
export declare const MotionShare: z.ZodObject<{
    version: z.ZodString;
    state: z.ZodEnum<{
        pending: "pending";
        shared: "shared";
        stopped: "stopped";
    }>;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    character: z.ZodString;
    score: z.ZodNumber;
    preview_s: z.ZodDefault<z.ZodNumber>;
    licence: z.ZodDefault<z.ZodLiteral<"genvr-community-1">>;
    prepared_by: z.ZodString;
    prepared_at: z.ZodString;
    shared_at: z.ZodOptional<z.ZodString>;
    stopped_at: z.ZodOptional<z.ZodString>;
    where: z.ZodOptional<z.ZodEnum<{
        "local-preview": "local-preview";
        platform: "platform";
    }>>;
    url: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type MotionShare = z.infer<typeof MotionShare>;
/** What a share shows; the rest (character, score, licence) comes from the version. */
export declare const MotionShareDraft: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    preview_s: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type MotionShareDraft = z.infer<typeof MotionShareDraft>;
/** The lab part of a lab project. An agent's "make best" waits in `best_pending` until the owner confirms. */
export declare const LabProjectData: z.ZodObject<{
    format: z.ZodDefault<z.ZodLiteral<1>>;
    course: z.ZodDefault<z.ZodObject<{
        format: z.ZodDefault<z.ZodLiteral<1>>;
        seed: z.ZodDefault<z.ZodNumber>;
        obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"step">;
            height: z.ZodDefault<z.ZodNumber>;
            depth: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"ramp">;
            rise: z.ZodDefault<z.ZodNumber>;
            length: z.ZodDefault<z.ZodNumber>;
            top: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"gap">;
            width: z.ZodDefault<z.ZodNumber>;
            height: z.ZodDefault<z.ZodNumber>;
            landing: z.ZodDefault<z.ZodNumber>;
            landing_depth: z.ZodDefault<z.ZodNumber>;
            lane: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"low_wall">;
            height: z.ZodDefault<z.ZodNumber>;
            thickness: z.ZodDefault<z.ZodNumber>;
            width: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"window">;
            sill: z.ZodDefault<z.ZodNumber>;
            opening_width: z.ZodDefault<z.ZodNumber>;
            opening_height: z.ZodDefault<z.ZodNumber>;
            wall_height: z.ZodDefault<z.ZodNumber>;
            wall_width: z.ZodDefault<z.ZodNumber>;
            thickness: z.ZodDefault<z.ZodNumber>;
            id: z.ZodString;
            z: z.ZodNumber;
            x: z.ZodDefault<z.ZodNumber>;
            hidden: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>], "kind">>>;
        street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            z: z.ZodDefault<z.ZodNumber>;
            lanes: z.ZodDefault<z.ZodNumber>;
            lane_width: z.ZodDefault<z.ZodNumber>;
            crossing: z.ZodDefault<z.ZodBoolean>;
            light: z.ZodDefault<z.ZodObject<{
                cycle_s: z.ZodDefault<z.ZodNumber>;
                red_s: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>;
        }, z.core.$strict>>>;
        cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            lane: z.ZodDefault<z.ZodNumber>;
            speed: z.ZodDefault<z.ZodNumber>;
            offset_s: z.ZodDefault<z.ZodNumber>;
            runs_red: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>>;
        finish_z: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    settings: z.ZodDefault<z.ZodObject<{
        motion: z.ZodDefault<z.ZodString>;
        character: z.ZodDefault<z.ZodString>;
        speed: z.ZodDefault<z.ZodNumber>;
        stride: z.ZodDefault<z.ZodNumber>;
        step_height: z.ZodDefault<z.ZodNumber>;
        jump_timing_ms: z.ZodDefault<z.ZodNumber>;
        blend_s: z.ZodDefault<z.ZodNumber>;
        lean_deg: z.ZodDefault<z.ZodNumber>;
        wait_for_green: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    runs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        at: z.ZodString;
        seed: z.ZodNumber;
        settings: z.ZodObject<{
            motion: z.ZodDefault<z.ZodString>;
            character: z.ZodDefault<z.ZodString>;
            speed: z.ZodDefault<z.ZodNumber>;
            stride: z.ZodDefault<z.ZodNumber>;
            step_height: z.ZodDefault<z.ZodNumber>;
            jump_timing_ms: z.ZodDefault<z.ZodNumber>;
            blend_s: z.ZodDefault<z.ZodNumber>;
            lean_deg: z.ZodDefault<z.ZodNumber>;
            wait_for_green: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        course: z.ZodObject<{
            format: z.ZodDefault<z.ZodLiteral<1>>;
            seed: z.ZodDefault<z.ZodNumber>;
            obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"step">;
                height: z.ZodDefault<z.ZodNumber>;
                depth: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"ramp">;
                rise: z.ZodDefault<z.ZodNumber>;
                length: z.ZodDefault<z.ZodNumber>;
                top: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"gap">;
                width: z.ZodDefault<z.ZodNumber>;
                height: z.ZodDefault<z.ZodNumber>;
                landing: z.ZodDefault<z.ZodNumber>;
                landing_depth: z.ZodDefault<z.ZodNumber>;
                lane: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"low_wall">;
                height: z.ZodDefault<z.ZodNumber>;
                thickness: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"window">;
                sill: z.ZodDefault<z.ZodNumber>;
                opening_width: z.ZodDefault<z.ZodNumber>;
                opening_height: z.ZodDefault<z.ZodNumber>;
                wall_height: z.ZodDefault<z.ZodNumber>;
                wall_width: z.ZodDefault<z.ZodNumber>;
                thickness: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>], "kind">>>;
            street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                z: z.ZodDefault<z.ZodNumber>;
                lanes: z.ZodDefault<z.ZodNumber>;
                lane_width: z.ZodDefault<z.ZodNumber>;
                crossing: z.ZodDefault<z.ZodBoolean>;
                light: z.ZodDefault<z.ZodObject<{
                    cycle_s: z.ZodDefault<z.ZodNumber>;
                    red_s: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strict>>;
            }, z.core.$strict>>>;
            cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                lane: z.ZodDefault<z.ZodNumber>;
                speed: z.ZodDefault<z.ZodNumber>;
                offset_s: z.ZodDefault<z.ZodNumber>;
                runs_red: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>>;
            finish_z: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        score: z.ZodObject<{
            foot_slide_cm: z.ZodNumber;
            penetration_cm: z.ZodNumber;
            fell: z.ZodBoolean;
            car_hit: z.ZodBoolean;
            finished: z.ZodBoolean;
            time_s: z.ZodNumber;
            smoothness: z.ZodNumber;
            total: z.ZodNumber;
        }, z.core.$strict>;
        events: z.ZodArray<z.ZodObject<{
            t: z.ZodNumber;
            kind: z.ZodEnum<{
                start: "start";
                finish: "finish";
                window: "window";
                step: "step";
                ramp: "ramp";
                crossing: "crossing";
                car_hit: "car_hit";
                gap_jump: "gap_jump";
                land: "land";
                vault: "vault";
                wait: "wait";
                car_near: "car_near";
                fall: "fall";
                slide: "slide";
                blocked: "blocked";
            }>;
            label: z.ZodString;
            obstacle: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        version: z.ZodOptional<z.ZodString>;
        by: z.ZodDefault<z.ZodEnum<{
            person: "person";
            agent: "agent";
        }>>;
    }, z.core.$strict>>>;
    versions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        motion: z.ZodString;
        n: z.ZodNumber;
        note: z.ZodDefault<z.ZodString>;
        settings: z.ZodObject<{
            motion: z.ZodDefault<z.ZodString>;
            character: z.ZodDefault<z.ZodString>;
            speed: z.ZodDefault<z.ZodNumber>;
            stride: z.ZodDefault<z.ZodNumber>;
            step_height: z.ZodDefault<z.ZodNumber>;
            jump_timing_ms: z.ZodDefault<z.ZodNumber>;
            blend_s: z.ZodDefault<z.ZodNumber>;
            lean_deg: z.ZodDefault<z.ZodNumber>;
            wait_for_green: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        score: z.ZodObject<{
            foot_slide_cm: z.ZodNumber;
            penetration_cm: z.ZodNumber;
            fell: z.ZodBoolean;
            car_hit: z.ZodBoolean;
            finished: z.ZodBoolean;
            time_s: z.ZodNumber;
            smoothness: z.ZodNumber;
            total: z.ZodNumber;
        }, z.core.$strict>;
        run: z.ZodString;
        best: z.ZodDefault<z.ZodBoolean>;
        by: z.ZodDefault<z.ZodEnum<{
            person: "person";
            agent: "agent";
        }>>;
        at: z.ZodString;
    }, z.core.$strict>>>;
    best_pending: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        version: z.ZodString;
        by: z.ZodString;
    }, z.core.$strict>>>;
    shares: z.ZodDefault<z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        state: z.ZodEnum<{
            pending: "pending";
            shared: "shared";
            stopped: "stopped";
        }>;
        name: z.ZodString;
        description: z.ZodDefault<z.ZodString>;
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        character: z.ZodString;
        score: z.ZodNumber;
        preview_s: z.ZodDefault<z.ZodNumber>;
        licence: z.ZodDefault<z.ZodLiteral<"genvr-community-1">>;
        prepared_by: z.ZodString;
        prepared_at: z.ZodString;
        shared_at: z.ZodOptional<z.ZodString>;
        stopped_at: z.ZodOptional<z.ZodString>;
        where: z.ZodOptional<z.ZodEnum<{
            "local-preview": "local-preview";
            platform: "platform";
        }>>;
        url: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type LabProjectData = z.infer<typeof LabProjectData>;
export declare const LAB_OVERLAYS: readonly ["skeleton", "feet", "balance", "speed", "ghost", "measures"];
export declare const LabOverlay: z.ZodEnum<{
    speed: "speed";
    balance: "balance";
    feet: "feet";
    skeleton: "skeleton";
    ghost: "ghost";
    measures: "measures";
}>;
export type LabOverlay = z.infer<typeof LabOverlay>;
export declare const LabPlaySpeed: z.ZodUnion<readonly [z.ZodLiteral<0.25>, z.ZodLiteral<0.5>, z.ZodLiteral<1>, z.ZodLiteral<2>]>;
/** The `motion_lab` agent tool: one operation per call (or a batch). Same owner gates as the Lab area. */
export declare const MotionLabOperation: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"inspect">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"commands">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"course_get">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"course_set">;
    course: z.ZodUnknown;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"obstacle_add">;
    obstacle: z.ZodUnknown;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"obstacle_set">;
    id: z.ZodString;
    set: z.ZodObject<{
        z: z.ZodOptional<z.ZodNumber>;
        x: z.ZodOptional<z.ZodNumber>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        height: z.ZodOptional<z.ZodNumber>;
        depth: z.ZodOptional<z.ZodNumber>;
        width: z.ZodOptional<z.ZodNumber>;
        rise: z.ZodOptional<z.ZodNumber>;
        length: z.ZodOptional<z.ZodNumber>;
        top: z.ZodOptional<z.ZodNumber>;
        landing: z.ZodOptional<z.ZodNumber>;
        landing_depth: z.ZodOptional<z.ZodNumber>;
        lane: z.ZodOptional<z.ZodNumber>;
        thickness: z.ZodOptional<z.ZodNumber>;
        sill: z.ZodOptional<z.ZodNumber>;
        opening_width: z.ZodOptional<z.ZodNumber>;
        opening_height: z.ZodOptional<z.ZodNumber>;
        wall_height: z.ZodOptional<z.ZodNumber>;
        wall_width: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"obstacle_remove">;
    id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"course_from_seed">;
    seed: z.ZodNumber;
    obstacles: z.ZodDefault<z.ZodNumber>;
    hardness: z.ZodDefault<z.ZodNumber>;
    street: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"traffic_set">;
    street: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        z: z.ZodDefault<z.ZodNumber>;
        lanes: z.ZodDefault<z.ZodNumber>;
        lane_width: z.ZodDefault<z.ZodNumber>;
        crossing: z.ZodDefault<z.ZodBoolean>;
        light: z.ZodDefault<z.ZodObject<{
            cycle_s: z.ZodDefault<z.ZodNumber>;
            red_s: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    cars: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        lane: z.ZodDefault<z.ZodNumber>;
        speed: z.ZodDefault<z.ZodNumber>;
        offset_s: z.ZodDefault<z.ZodNumber>;
        runs_red: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"settings_set">;
    settings: z.ZodObject<{
        motion: z.ZodOptional<z.ZodString>;
        character: z.ZodOptional<z.ZodString>;
        speed: z.ZodOptional<z.ZodNumber>;
        stride: z.ZodOptional<z.ZodNumber>;
        step_height: z.ZodOptional<z.ZodNumber>;
        jump_timing_ms: z.ZodOptional<z.ZodNumber>;
        blend_s: z.ZodOptional<z.ZodNumber>;
        lean_deg: z.ZodOptional<z.ZodNumber>;
        wait_for_green: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"run">;
    settings: z.ZodOptional<z.ZodObject<{
        motion: z.ZodOptional<z.ZodString>;
        character: z.ZodOptional<z.ZodString>;
        speed: z.ZodOptional<z.ZodNumber>;
        stride: z.ZodOptional<z.ZodNumber>;
        step_height: z.ZodOptional<z.ZodNumber>;
        jump_timing_ms: z.ZodOptional<z.ZodNumber>;
        blend_s: z.ZodOptional<z.ZodNumber>;
        lean_deg: z.ZodOptional<z.ZodNumber>;
        wait_for_green: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
    version: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"runs_list">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"scores">;
    run: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"frame">;
    run: z.ZodOptional<z.ZodString>;
    t: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"view_set">;
    overlays: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        speed: "speed";
        balance: "balance";
        feet: "feet";
        skeleton: "skeleton";
        ghost: "ghost";
        measures: "measures";
    }>>>;
    speed: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<0.25>, z.ZodLiteral<0.5>, z.ZodLiteral<1>, z.ZodLiteral<2>]>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"versions">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"save_version">;
    run: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"save_best">;
    version: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"rollback">;
    version: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"version_delete">;
    version: z.ZodString;
    confirm: z.ZodLiteral<true>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"motions_mine">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"motion_similar">;
    version: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"share_prepare">;
    version: z.ZodString;
    share: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        preview_s: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"share">;
    version: z.ZodString;
    confirm: z.ZodLiteral<true>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"unshare">;
    version: z.ZodString;
    confirm: z.ZodLiteral<true>;
}, z.core.$strict>], "kind">;
export type MotionLabOperation = z.infer<typeof MotionLabOperation>;
export declare const MOTION_LAB_KINDS: ("inspect" | "commands" | "frame" | "share" | "run" | "versions" | "course_get" | "course_set" | "obstacle_add" | "obstacle_set" | "obstacle_remove" | "course_from_seed" | "traffic_set" | "settings_set" | "runs_list" | "scores" | "view_set" | "save_version" | "save_best" | "rollback" | "version_delete" | "motions_mine" | "motion_similar" | "share_prepare" | "unshare")[];
