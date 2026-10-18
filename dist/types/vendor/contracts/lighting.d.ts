import { z } from 'zod';
export declare const SceneLight: z.ZodObject<{
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
}, z.core.$strict>;
export type SceneLight = z.infer<typeof SceneLight>;
export declare const SceneLights: z.ZodArray<z.ZodObject<{
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
}, z.core.$strict>>;
