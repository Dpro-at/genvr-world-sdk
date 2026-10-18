import { z } from 'zod';
export const AvatarCatalogQuery = z.object({ query: z.string().max(200).default(''), category: z.string().max(80).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }).strict();
