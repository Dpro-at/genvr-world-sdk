import { z } from 'zod';

/** The first sandbox grants are bounded data, never arbitrary creator code or real entitlements. */
export const SandboxBenefit = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('skin'),
      shirt: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      pants: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('speed'),
      factor: z.number().min(1.1).max(2),
      durationSec: z.number().int().min(5).max(60),
    })
    .strict(),
]);
export type SandboxBenefit = z.infer<typeof SandboxBenefit>;
export const ProductActivation = z.enum(['automatic', 'script']);
export const SandboxProductInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceGems: z.number().int().min(0).max(1000),
    benefit: SandboxBenefit,
    activation: ProductActivation.default('automatic'),
  })
  .strict();
export const SandboxProduct = SandboxProductInput.extend({
  id: z.uuid(),
  experienceId: z.string(),
  mode: z.literal('sandbox'),
});
export const SandboxReceipt = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  experienceId: z.string(),
  name: z.string(),
  priceGems: z.number().int(),
  platformGems: z.number().int(),
  creatorGems: z.number().int(),
  benefit: SandboxBenefit,
  activation: ProductActivation.default('automatic'),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  mode: z.literal('sandbox'),
});
export type SandboxReceipt = z.infer<typeof SandboxReceipt>;
/** Production IDs tested against Stripe Test; never a real-money entitlement. */
export const ProductReceipt = SandboxReceipt.extend({ mode: z.enum(['sandbox', 'stripe-test']), scriptRevision:z.string().regex(/^[a-f0-9]{64}$/).optional() }).refine(r=>r.mode!=='stripe-test'||Boolean(r.scriptRevision));
export type ProductReceipt = z.infer<typeof ProductReceipt>;
export const ProductGrantState = z.object({
  skin: ProductReceipt.refine(r => r.benefit.kind === 'skin' && r.expiresAt === null).nullable(),
  speed: ProductReceipt.refine(r => r.benefit.kind === 'speed' && r.expiresAt !== null).nullable(),
}).strict();
export type ProductGrantState = z.infer<typeof ProductGrantState>;
export const StripeTestShop = z.object({
  mode: z.literal('stripe-test'), liveEnabled: z.literal(false),
  balance: z.number().int().min(0), heldEarnings: z.number().int().min(0),
  pack: z.object({ gems: z.literal(1000), eurCents: z.literal(1000) }),
  currencies: z.array(z.string()),
  products: z.array(z.object({ id: z.uuid(), name: z.string(), priceGems: z.number().int(), benefit: SandboxBenefit, activation: ProductActivation, bound: z.boolean() })),
  receipts: z.array(ProductReceipt),
});
export type StripeTestShop = z.infer<typeof StripeTestShop>;
export const FundingQuote = z.object({
  id:z.uuid(), currency:z.string(), amountMinor:z.number().int().positive(),
  gems:z.number().int().positive(), eurCents:z.number().int().positive(),
  expiresAt:z.iso.datetime(), rateSource:z.literal('stripe'),
});
export type FundingQuote = z.infer<typeof FundingQuote>;
export const SandboxGrantState = z
  .object({
    skin: SandboxReceipt.refine((r) => r.benefit.kind === 'skin' && r.expiresAt === null).nullable(),
    speed: SandboxReceipt.refine((r) => r.benefit.kind === 'speed' && r.expiresAt !== null).nullable(),
  })
  .strict();
export type SandboxGrantState = z.infer<typeof SandboxGrantState>;

/** Definition-only promotion: never a purchase, entitlement, balance or checkout activation. */
export const PreparedGameProduct = SandboxProductInput.extend({
  id: z.uuid(),
  sourceProductId: z.uuid(),
  experienceId: z.string(),
  scriptRevision: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.literal('production'),
  status: z.literal('prepared'),
  checkoutEnabled: z.literal(false),
});
export type PreparedGameProduct = z.infer<typeof PreparedGameProduct>;
export const ScriptProductPurchase = z.object({
  type: z.literal('product_purchased'),
  actor: z.string().regex(/^p[1-9][0-9]*$/),
  productId: z.uuid(),
  receiptId: z.uuid(),
  mode: z.enum(['sandbox', 'stripe-test']),
  benefit: SandboxBenefit,
  /** Remaining duration, never a fresh duration on restore. */
  remainingMs: z.number().min(0).nullable(),
}).strict();
export type ScriptProductPurchase = z.infer<typeof ScriptProductPurchase>;
