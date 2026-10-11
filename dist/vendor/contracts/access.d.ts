import { z } from 'zod';
/**
 * Who may enter an experience. Always evaluated on the server (API and realtime),
 * never trusted from the client. See docs/PLATFORM.md and docs/CREATOR-FLOW.md.
 */
export declare const AccessPolicy: z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"private">;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"friends">;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"invite">;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"password">;
    passwordHash: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"public">;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"subscription">;
    productId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"class">;
    classId: z.ZodString;
}, z.core.$strip>], "mode">;
export type AccessPolicy = z.infer<typeof AccessPolicy>;
export declare const ACCESS_MODES: readonly ["private", "friends", "invite", "password", "public", "subscription", "class"];
/** Modes whose experiences may appear in public feeds. */
export declare function isListed(policy: AccessPolicy): boolean;
