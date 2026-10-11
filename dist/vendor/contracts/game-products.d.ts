import { z } from 'zod';
/** The first sandbox grants are bounded data, never arbitrary creator code or real entitlements. */
export declare const SandboxBenefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"skin">;
    shirt: z.ZodString;
    pants: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"speed">;
    factor: z.ZodNumber;
    durationSec: z.ZodNumber;
}, z.core.$strict>], "kind">;
export type SandboxBenefit = z.infer<typeof SandboxBenefit>;
export declare const ProductActivation: z.ZodEnum<{
    script: "script";
    automatic: "automatic";
}>;
export declare const SandboxProductInput: z.ZodObject<{
    name: z.ZodString;
    priceGems: z.ZodNumber;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    activation: z.ZodDefault<z.ZodEnum<{
        script: "script";
        automatic: "automatic";
    }>>;
}, z.core.$strict>;
export declare const SandboxProduct: z.ZodObject<{
    name: z.ZodString;
    priceGems: z.ZodNumber;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    activation: z.ZodDefault<z.ZodEnum<{
        script: "script";
        automatic: "automatic";
    }>>;
    id: z.ZodUUID;
    experienceId: z.ZodString;
    mode: z.ZodLiteral<"sandbox">;
}, z.core.$strict>;
export declare const SandboxReceipt: z.ZodObject<{
    id: z.ZodUUID;
    productId: z.ZodUUID;
    experienceId: z.ZodString;
    name: z.ZodString;
    priceGems: z.ZodNumber;
    platformGems: z.ZodNumber;
    creatorGems: z.ZodNumber;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    activation: z.ZodDefault<z.ZodEnum<{
        script: "script";
        automatic: "automatic";
    }>>;
    createdAt: z.ZodISODateTime;
    expiresAt: z.ZodNullable<z.ZodISODateTime>;
    mode: z.ZodLiteral<"sandbox">;
}, z.core.$strip>;
export type SandboxReceipt = z.infer<typeof SandboxReceipt>;
/** Production IDs tested against Stripe Test; never a real-money entitlement. */
export declare const ProductReceipt: z.ZodObject<{
    id: z.ZodUUID;
    productId: z.ZodUUID;
    experienceId: z.ZodString;
    name: z.ZodString;
    priceGems: z.ZodNumber;
    platformGems: z.ZodNumber;
    creatorGems: z.ZodNumber;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    activation: z.ZodDefault<z.ZodEnum<{
        script: "script";
        automatic: "automatic";
    }>>;
    createdAt: z.ZodISODateTime;
    expiresAt: z.ZodNullable<z.ZodISODateTime>;
    mode: z.ZodEnum<{
        sandbox: "sandbox";
        "stripe-test": "stripe-test";
    }>;
    scriptRevision: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProductReceipt = z.infer<typeof ProductReceipt>;
export declare const ProductGrantState: z.ZodObject<{
    skin: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        productId: z.ZodUUID;
        experienceId: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        platformGems: z.ZodNumber;
        creatorGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodDefault<z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>>;
        createdAt: z.ZodISODateTime;
        expiresAt: z.ZodNullable<z.ZodISODateTime>;
        mode: z.ZodEnum<{
            sandbox: "sandbox";
            "stripe-test": "stripe-test";
        }>;
        scriptRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    speed: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        productId: z.ZodUUID;
        experienceId: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        platformGems: z.ZodNumber;
        creatorGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodDefault<z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>>;
        createdAt: z.ZodISODateTime;
        expiresAt: z.ZodNullable<z.ZodISODateTime>;
        mode: z.ZodEnum<{
            sandbox: "sandbox";
            "stripe-test": "stripe-test";
        }>;
        scriptRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type ProductGrantState = z.infer<typeof ProductGrantState>;
export declare const StripeTestShop: z.ZodObject<{
    mode: z.ZodLiteral<"stripe-test">;
    liveEnabled: z.ZodLiteral<false>;
    balance: z.ZodNumber;
    heldEarnings: z.ZodNumber;
    pack: z.ZodObject<{
        gems: z.ZodLiteral<1000>;
        eurCents: z.ZodLiteral<1000>;
    }, z.core.$strip>;
    currencies: z.ZodArray<z.ZodString>;
    products: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>;
        bound: z.ZodBoolean;
    }, z.core.$strip>>;
    receipts: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        productId: z.ZodUUID;
        experienceId: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        platformGems: z.ZodNumber;
        creatorGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodDefault<z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>>;
        createdAt: z.ZodISODateTime;
        expiresAt: z.ZodNullable<z.ZodISODateTime>;
        mode: z.ZodEnum<{
            sandbox: "sandbox";
            "stripe-test": "stripe-test";
        }>;
        scriptRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type StripeTestShop = z.infer<typeof StripeTestShop>;
export declare const FundingQuote: z.ZodObject<{
    id: z.ZodUUID;
    currency: z.ZodString;
    amountMinor: z.ZodNumber;
    gems: z.ZodNumber;
    eurCents: z.ZodNumber;
    expiresAt: z.ZodISODateTime;
    rateSource: z.ZodLiteral<"stripe">;
}, z.core.$strip>;
export type FundingQuote = z.infer<typeof FundingQuote>;
export declare const SandboxGrantState: z.ZodObject<{
    skin: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        productId: z.ZodUUID;
        experienceId: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        platformGems: z.ZodNumber;
        creatorGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodDefault<z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>>;
        createdAt: z.ZodISODateTime;
        expiresAt: z.ZodNullable<z.ZodISODateTime>;
        mode: z.ZodLiteral<"sandbox">;
    }, z.core.$strip>>;
    speed: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        productId: z.ZodUUID;
        experienceId: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
        platformGems: z.ZodNumber;
        creatorGems: z.ZodNumber;
        benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"skin">;
            shirt: z.ZodString;
            pants: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"speed">;
            factor: z.ZodNumber;
            durationSec: z.ZodNumber;
        }, z.core.$strict>], "kind">;
        activation: z.ZodDefault<z.ZodEnum<{
            script: "script";
            automatic: "automatic";
        }>>;
        createdAt: z.ZodISODateTime;
        expiresAt: z.ZodNullable<z.ZodISODateTime>;
        mode: z.ZodLiteral<"sandbox">;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type SandboxGrantState = z.infer<typeof SandboxGrantState>;
/** Definition-only promotion: never a purchase, entitlement, balance or checkout activation. */
export declare const PreparedGameProduct: z.ZodObject<{
    name: z.ZodString;
    priceGems: z.ZodNumber;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    activation: z.ZodDefault<z.ZodEnum<{
        script: "script";
        automatic: "automatic";
    }>>;
    id: z.ZodUUID;
    sourceProductId: z.ZodUUID;
    experienceId: z.ZodString;
    scriptRevision: z.ZodString;
    mode: z.ZodLiteral<"production">;
    status: z.ZodLiteral<"prepared">;
    checkoutEnabled: z.ZodLiteral<false>;
}, z.core.$strict>;
export type PreparedGameProduct = z.infer<typeof PreparedGameProduct>;
export declare const ScriptProductPurchase: z.ZodObject<{
    type: z.ZodLiteral<"product_purchased">;
    actor: z.ZodString;
    productId: z.ZodUUID;
    receiptId: z.ZodUUID;
    mode: z.ZodEnum<{
        sandbox: "sandbox";
        "stripe-test": "stripe-test";
    }>;
    benefit: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"skin">;
        shirt: z.ZodString;
        pants: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"speed">;
        factor: z.ZodNumber;
        durationSec: z.ZodNumber;
    }, z.core.$strict>], "kind">;
    remainingMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type ScriptProductPurchase = z.infer<typeof ScriptProductPurchase>;
