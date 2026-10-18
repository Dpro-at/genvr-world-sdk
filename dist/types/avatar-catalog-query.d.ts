import { z } from 'zod';
export declare const AvatarCatalogQuery: z.ZodObject<{
    query: z.ZodDefault<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    offset: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
