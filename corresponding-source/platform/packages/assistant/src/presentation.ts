import { z } from 'zod';
import { CORE_ANIMATIONS } from '@genvr/core-library';

export const EXPRESSIONS = ['neutral', 'smile', 'angry', 'sad', 'surprised', 'thinking'] as const;
export const EFFECTS = ['matrix', 'emoji', 'snow', 'fireflies', 'starfield', 'rain', 'fire', 'lightning', 'aurora', 'glitch', 'scanlines', 'hologram', 'vignette', 'confetti'] as const;
export const NOTIFICATION_TYPES = ['msg', 'task', 'approval', 'email', 'whatsapp', 'facebook', 'instagram', 'telegram', 'discord', 'stripe', 'paypal', 'bank', 'applepay', 'stock', 'calendar', 'terminal', 'gif', 'twitter', 'tiktok', 'linkedin', 'snapchat', 'youtube', 'reddit', 'twitch', 'otp', 'faceid', 'sms_otp'] as const;
const Text = z.string().max(4000);
const Url = z.string().max(2048).refine(value => /^(https?:\/\/|blob:|\/[^/])/.test(value), 'Expected HTTP, blob or local URL.');
export const PresentationNotification = z.object({
  type: z.enum(NOTIFICATION_TYPES), title: z.string().min(1).max(200), body: Text,
  sourceId: z.string().max(200).optional(),
  from: z.string().max(200).optional(), needsApproval: z.boolean().optional(), canReply: z.boolean().optional(),
  terminalCmd: Text.optional(), terminalOutput: Text.optional(), gifUrl: Url.optional(), otpCode: z.string().max(32).optional(),
  biometricDevice: z.string().max(200).optional(), phoneNumber: z.string().max(100).optional(),
}).strict();
export const PresentationSpec = z.object({
  root: z.string().min(1).max(100),
  elements: z.record(z.string().max(100), z.object({ type: z.string().max(80), props: z.record(z.string(), z.unknown()), children: z.array(z.string().max(100)).max(40) }).strict()),
}).superRefine((spec, ctx) => {
  if (Object.keys(spec.elements).length > 100 || JSON.stringify(spec).length > 32000) ctx.addIssue({ code: 'custom', message: 'Card exceeds display limits.' });
  if (!Object.hasOwn(spec.elements, spec.root)) ctx.addIssue({ code: 'custom', message: 'Missing card root.' });
  let visits = 0;
  const visit = (id: string, ancestors: Set<string>, depth: number) => {
    if (++visits > 300) { ctx.addIssue({ code: 'custom', message: 'Card tree exceeds render budget.' }); return; }
    const node = Object.hasOwn(spec.elements, id) ? spec.elements[id] : undefined;
    if (!node || ancestors.has(id) || depth > 12) { ctx.addIssue({ code: 'custom', message: 'Invalid card tree.' }); return; }
    const next = new Set(ancestors).add(id);
    for (const child of node.children) visit(child, next, depth + 1);
  };
  visit(spec.root, new Set(), 0);
});
const Target = z.string().regex(/^(self|[A-Za-z0-9_-]{1,100})$/).default('self');
const Duration = z.number().int().min(200).max(60000).default(5500);
const WorldPoint = z.object({ x:z.number().finite(), y:z.number().finite(), z:z.number().finite() }).strict();
export const AvatarLiveDisplay = z.object({
  open: z.boolean().default(false),
  layout: z.enum(['large', 'desktop', 'browser', 'compact', 'banner', 'circle', 'watch']).default('large'),
  background: z.enum(['world', 'color', 'transparent', 'office', 'living_room', 'conference', 'stage', 'studio', 'classroom', 'image', 'video']).default('color'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#101827'),
  media: Url.optional(),
  worldId: z.string().min(1).max(200).nullable().optional(),
  worldSpot: z.object({position:WorldPoint,target:WorldPoint,player:WorldPoint}).strict().nullable().optional(),
  framing: z.enum(['full', 'bust', 'face']).default('full'),
}).strict();
export type AvatarLiveDisplay = z.infer<typeof AvatarLiveDisplay>;
export const AvatarPresentationEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('animation'), target: Target, animation: z.string().min(1).max(150).describe('Available animation IDs: idle, ' + CORE_ANIMATIONS.map(row => row.manifest.id).join(', ')), duration: Duration }).strict(),
  z.object({ kind: z.literal('expression'), target: Target, expression: z.enum(EXPRESSIONS), duration: Duration }).strict(),
  z.object({ kind: z.literal('effect'), effect: z.enum(EFFECTS), enabled: z.boolean(), intensity: z.number().min(0).max(1).default(0.6), duration: Duration }).strict(),
  z.object({ kind: z.literal('notification'), notification: PresentationNotification, duration: Duration }).strict(),
  z.object({ kind: z.literal('card'), title: z.string().max(200), spec: PresentationSpec, duration: Duration }).strict(),
  z.object({ kind: z.literal('display'),
    open: AvatarLiveDisplay.shape.open.removeDefault().optional(),
    layout: AvatarLiveDisplay.shape.layout.removeDefault().optional(),
    background: AvatarLiveDisplay.shape.background.removeDefault().optional(),
    color: AvatarLiveDisplay.shape.color.removeDefault().optional(),
    framing: AvatarLiveDisplay.shape.framing.removeDefault().optional(),
    media: AvatarLiveDisplay.shape.media,
    worldId: AvatarLiveDisplay.shape.worldId,
    worldSpot: AvatarLiveDisplay.shape.worldSpot,
  }).strict(),
  z.object({ kind: z.literal('clear') }).strict(),
]);
export type AvatarPresentationEvent = z.infer<typeof AvatarPresentationEvent>;
export type PresentationNotification = z.infer<typeof PresentationNotification>;
export type PresentationSpec = z.infer<typeof PresentationSpec>;
