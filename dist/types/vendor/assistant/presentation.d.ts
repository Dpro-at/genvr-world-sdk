import { z } from 'zod';
export declare const EXPRESSIONS: readonly ["neutral", "smile", "angry", "sad", "surprised", "thinking"];
export declare const EFFECTS: readonly ["matrix", "emoji", "snow", "fireflies", "starfield", "rain", "fire", "lightning", "aurora", "glitch", "scanlines", "hologram", "vignette", "confetti"];
export declare const NOTIFICATION_TYPES: readonly ["msg", "task", "approval", "email", "whatsapp", "facebook", "instagram", "telegram", "discord", "stripe", "paypal", "bank", "applepay", "stock", "calendar", "terminal", "gif", "twitter", "tiktok", "linkedin", "snapchat", "youtube", "reddit", "twitch", "otp", "faceid", "sms_otp"];
export declare const PresentationNotification: z.ZodObject<{
    type: z.ZodEnum<{
        msg: "msg";
        task: "task";
        approval: "approval";
        email: "email";
        whatsapp: "whatsapp";
        facebook: "facebook";
        instagram: "instagram";
        telegram: "telegram";
        discord: "discord";
        stripe: "stripe";
        paypal: "paypal";
        bank: "bank";
        applepay: "applepay";
        stock: "stock";
        calendar: "calendar";
        terminal: "terminal";
        gif: "gif";
        twitter: "twitter";
        tiktok: "tiktok";
        linkedin: "linkedin";
        snapchat: "snapchat";
        youtube: "youtube";
        reddit: "reddit";
        twitch: "twitch";
        otp: "otp";
        faceid: "faceid";
        sms_otp: "sms_otp";
    }>;
    title: z.ZodString;
    body: z.ZodString;
    sourceId: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    needsApproval: z.ZodOptional<z.ZodBoolean>;
    canReply: z.ZodOptional<z.ZodBoolean>;
    terminalCmd: z.ZodOptional<z.ZodString>;
    terminalOutput: z.ZodOptional<z.ZodString>;
    gifUrl: z.ZodOptional<z.ZodString>;
    otpCode: z.ZodOptional<z.ZodString>;
    biometricDevice: z.ZodOptional<z.ZodString>;
    phoneNumber: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const PresentationSpec: z.ZodObject<{
    root: z.ZodString;
    elements: z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodString;
        props: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        children: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strip>;
export declare const AvatarLiveDisplay: z.ZodObject<{
    open: z.ZodDefault<z.ZodBoolean>;
    layout: z.ZodDefault<z.ZodEnum<{
        large: "large";
        desktop: "desktop";
        browser: "browser";
        compact: "compact";
        banner: "banner";
        circle: "circle";
        watch: "watch";
    }>>;
    background: z.ZodDefault<z.ZodEnum<{
        color: "color";
        world: "world";
        transparent: "transparent";
        office: "office";
        living_room: "living_room";
        conference: "conference";
        stage: "stage";
        studio: "studio";
        classroom: "classroom";
        image: "image";
        video: "video";
    }>>;
    color: z.ZodDefault<z.ZodString>;
    media: z.ZodOptional<z.ZodString>;
    worldId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    worldSpot: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
        target: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
        player: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>>;
    framing: z.ZodDefault<z.ZodEnum<{
        full: "full";
        bust: "bust";
        face: "face";
    }>>;
}, z.core.$strict>;
export type AvatarLiveDisplay = z.infer<typeof AvatarLiveDisplay>;
export declare const AvatarPresentationEvent: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"animation">;
    target: z.ZodDefault<z.ZodString>;
    animation: z.ZodString;
    duration: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"expression">;
    target: z.ZodDefault<z.ZodString>;
    expression: z.ZodEnum<{
        neutral: "neutral";
        smile: "smile";
        angry: "angry";
        sad: "sad";
        surprised: "surprised";
        thinking: "thinking";
    }>;
    duration: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"effect">;
    effect: z.ZodEnum<{
        snow: "snow";
        rain: "rain";
        matrix: "matrix";
        emoji: "emoji";
        fireflies: "fireflies";
        starfield: "starfield";
        fire: "fire";
        lightning: "lightning";
        aurora: "aurora";
        glitch: "glitch";
        scanlines: "scanlines";
        hologram: "hologram";
        vignette: "vignette";
        confetti: "confetti";
    }>;
    enabled: z.ZodBoolean;
    intensity: z.ZodDefault<z.ZodNumber>;
    duration: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"notification">;
    notification: z.ZodObject<{
        type: z.ZodEnum<{
            msg: "msg";
            task: "task";
            approval: "approval";
            email: "email";
            whatsapp: "whatsapp";
            facebook: "facebook";
            instagram: "instagram";
            telegram: "telegram";
            discord: "discord";
            stripe: "stripe";
            paypal: "paypal";
            bank: "bank";
            applepay: "applepay";
            stock: "stock";
            calendar: "calendar";
            terminal: "terminal";
            gif: "gif";
            twitter: "twitter";
            tiktok: "tiktok";
            linkedin: "linkedin";
            snapchat: "snapchat";
            youtube: "youtube";
            reddit: "reddit";
            twitch: "twitch";
            otp: "otp";
            faceid: "faceid";
            sms_otp: "sms_otp";
        }>;
        title: z.ZodString;
        body: z.ZodString;
        sourceId: z.ZodOptional<z.ZodString>;
        from: z.ZodOptional<z.ZodString>;
        needsApproval: z.ZodOptional<z.ZodBoolean>;
        canReply: z.ZodOptional<z.ZodBoolean>;
        terminalCmd: z.ZodOptional<z.ZodString>;
        terminalOutput: z.ZodOptional<z.ZodString>;
        gifUrl: z.ZodOptional<z.ZodString>;
        otpCode: z.ZodOptional<z.ZodString>;
        biometricDevice: z.ZodOptional<z.ZodString>;
        phoneNumber: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    duration: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"card">;
    title: z.ZodString;
    spec: z.ZodObject<{
        root: z.ZodString;
        elements: z.ZodRecord<z.ZodString, z.ZodObject<{
            type: z.ZodString;
            props: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            children: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strip>;
    duration: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"display">;
    open: z.ZodOptional<z.ZodBoolean>;
    layout: z.ZodOptional<z.ZodEnum<{
        large: "large";
        desktop: "desktop";
        browser: "browser";
        compact: "compact";
        banner: "banner";
        circle: "circle";
        watch: "watch";
    }>>;
    background: z.ZodOptional<z.ZodEnum<{
        color: "color";
        world: "world";
        transparent: "transparent";
        office: "office";
        living_room: "living_room";
        conference: "conference";
        stage: "stage";
        studio: "studio";
        classroom: "classroom";
        image: "image";
        video: "video";
    }>>;
    color: z.ZodOptional<z.ZodString>;
    framing: z.ZodOptional<z.ZodEnum<{
        full: "full";
        bust: "bust";
        face: "face";
    }>>;
    media: z.ZodOptional<z.ZodString>;
    worldId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    worldSpot: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
        target: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
        player: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"clear">;
}, z.core.$strict>], "kind">;
export type AvatarPresentationEvent = z.infer<typeof AvatarPresentationEvent>;
export type PresentationNotification = z.infer<typeof PresentationNotification>;
export type PresentationSpec = z.infer<typeof PresentationSpec>;
