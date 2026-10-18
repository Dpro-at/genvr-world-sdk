import { z } from 'zod';
export const StudioShareRequest = z.object({
  projectId: z.string().min(1).max(120),
  surface: z.enum(['world', 'avatar-live']),
  layout: z.enum(['large','desktop','browser','compact','banner','circle','watch']).optional(),
  access: z.enum(['private','public','invite']),
  guests: z.array(z.string().trim().min(1).max(254)).max(100),
  password: z.string().min(4).max(128).optional(),
  allowJoining: z.boolean(),
}).strict().superRefine((request,ctx)=>{if(request.access==='invite'&&!request.guests.length)ctx.addIssue({code:'custom',message:'Choose at least one invited person.'});});
export type StudioShareRequest = z.infer<typeof StudioShareRequest>;
