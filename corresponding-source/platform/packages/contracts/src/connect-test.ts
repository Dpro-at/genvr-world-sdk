import { z } from 'zod';

export const ConnectTestOperation = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  transferId: z.string().nullable(),
  payoutId: z.string().nullable(),
  amountMinor: z.literal(100),
  currency: z.literal('eur'),
  status: z.enum(['requested', 'transferred', 'pending', 'in_transit', 'paid', 'failed', 'canceled']),
  failureCode: z.string().nullable(),
  checkedAt: z.string().nullable(),
});
export const ConnectTestStatus = z.object({
  mode: z.literal('connect-test'),
  enabled: z.boolean(),
  eligible: z.boolean(),
  accountId: z.string().nullable(),
  country: z.string().nullable(),
  detailsSubmitted: z.boolean(),
  transfersActive: z.boolean(),
  payoutsEnabled: z.boolean(),
  currentlyDue: z.array(z.string()),
  disabledReason: z.string().nullable(),
  checkedAt: z.string().nullable(),
  operation: ConnectTestOperation.nullable(),
});
export const ConnectTestLink = z.object({ mode: z.literal('connect-test'), url: z.string().url() });
export const ConnectTestRequest = z.object({ requestId: z.uuid() }).strict();
export const ConnectTestAdmin = z.object({
  mode: z.literal('connect-test'),
  enabled: z.boolean(),
  liveEnabled: z.literal(false),
  recipients: z.array(
    z.object({
      userId: z.string(),
      accountId: z.string().nullable(),
      country: z.string(),
      payoutsEnabled: z.boolean(),
      checkedAt: z.string().nullable(),
    }),
  ),
  operations: z.array(ConnectTestOperation.extend({ userId: z.string() })),
});
