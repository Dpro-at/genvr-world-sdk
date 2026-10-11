import { z } from 'zod';
export declare const ConnectTestOperation: z.ZodObject<{
    id: z.ZodUUID;
    requestId: z.ZodUUID;
    transferId: z.ZodNullable<z.ZodString>;
    payoutId: z.ZodNullable<z.ZodString>;
    amountMinor: z.ZodLiteral<100>;
    currency: z.ZodLiteral<"eur">;
    status: z.ZodEnum<{
        paid: "paid";
        failed: "failed";
        requested: "requested";
        transferred: "transferred";
        pending: "pending";
        in_transit: "in_transit";
        canceled: "canceled";
    }>;
    failureCode: z.ZodNullable<z.ZodString>;
    checkedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const ConnectTestStatus: z.ZodObject<{
    mode: z.ZodLiteral<"connect-test">;
    enabled: z.ZodBoolean;
    eligible: z.ZodBoolean;
    accountId: z.ZodNullable<z.ZodString>;
    country: z.ZodNullable<z.ZodString>;
    detailsSubmitted: z.ZodBoolean;
    transfersActive: z.ZodBoolean;
    payoutsEnabled: z.ZodBoolean;
    currentlyDue: z.ZodArray<z.ZodString>;
    disabledReason: z.ZodNullable<z.ZodString>;
    checkedAt: z.ZodNullable<z.ZodString>;
    operation: z.ZodNullable<z.ZodObject<{
        id: z.ZodUUID;
        requestId: z.ZodUUID;
        transferId: z.ZodNullable<z.ZodString>;
        payoutId: z.ZodNullable<z.ZodString>;
        amountMinor: z.ZodLiteral<100>;
        currency: z.ZodLiteral<"eur">;
        status: z.ZodEnum<{
            paid: "paid";
            failed: "failed";
            requested: "requested";
            transferred: "transferred";
            pending: "pending";
            in_transit: "in_transit";
            canceled: "canceled";
        }>;
        failureCode: z.ZodNullable<z.ZodString>;
        checkedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ConnectTestLink: z.ZodObject<{
    mode: z.ZodLiteral<"connect-test">;
    url: z.ZodString;
}, z.core.$strip>;
export declare const ConnectTestRequest: z.ZodObject<{
    requestId: z.ZodUUID;
}, z.core.$strict>;
export declare const ConnectTestAdmin: z.ZodObject<{
    mode: z.ZodLiteral<"connect-test">;
    enabled: z.ZodBoolean;
    liveEnabled: z.ZodLiteral<false>;
    recipients: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        accountId: z.ZodNullable<z.ZodString>;
        country: z.ZodString;
        payoutsEnabled: z.ZodBoolean;
        checkedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    operations: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        requestId: z.ZodUUID;
        transferId: z.ZodNullable<z.ZodString>;
        payoutId: z.ZodNullable<z.ZodString>;
        amountMinor: z.ZodLiteral<100>;
        currency: z.ZodLiteral<"eur">;
        status: z.ZodEnum<{
            paid: "paid";
            failed: "failed";
            requested: "requested";
            transferred: "transferred";
            pending: "pending";
            in_transit: "in_transit";
            canceled: "canceled";
        }>;
        failureCode: z.ZodNullable<z.ZodString>;
        checkedAt: z.ZodNullable<z.ZodString>;
        userId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
