import { z } from 'zod';
const point=z.tuple([z.number().finite().min(-60000).max(60000),z.number().finite().min(-60000).max(60000),z.number().finite().min(-60000).max(60000)]);
export const SceneLight=z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(80),enabled:z.boolean().default(true),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),intensity:z.number().min(0).max(200).default(20),angle:z.number().min(5).max(85).default(35),softness:z.number().min(0).max(1).default(.5),distance:z.number().min(1).max(200).default(30),actor:z.string().min(1).max(120).nullable().default('self'),position:point.default([2,3,3]),target:point.default([0,1.5,0])}).strict();
export type SceneLight=z.infer<typeof SceneLight>;
export const SceneLights=z.array(SceneLight).max(4).refine(lights=>new Set(lights.map(l=>l.id)).size===lights.length,'Light IDs must be unique');
