import { z } from 'zod';
export declare const StudioShareRequest: z.ZodObject<{
    projectId: z.ZodString;
    surface: z.ZodEnum<{
        world: "world";
        "avatar-live": "avatar-live";
    }>;
    layout: z.ZodOptional<z.ZodEnum<{
        large: "large";
        desktop: "desktop";
        browser: "browser";
        compact: "compact";
        banner: "banner";
        circle: "circle";
        watch: "watch";
    }>>;
    access: z.ZodEnum<{
        private: "private";
        invite: "invite";
        public: "public";
    }>;
    guests: z.ZodArray<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    allowJoining: z.ZodBoolean;
}, z.core.$strict>;
export type StudioShareRequest = z.infer<typeof StudioShareRequest>;
