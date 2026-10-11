import { describe, expect, it } from 'vitest';
import { computeAgeRating, decideJoin, type JoinFacts } from '../src/index.js';

describe('computeAgeRating', () => {
  const none = {
    violence: false,
    blood: false,
    horror: false,
    romance: false,
    userChat: false,
    paidItems: false,
  };
  it('rates from the answers', () => {
    expect(computeAgeRating(none)).toBe('all');
    expect(computeAgeRating({ ...none, violence: true })).toBe('9+');
    expect(computeAgeRating({ ...none, violence: true, blood: true })).toBe('13+');
    expect(computeAgeRating({ ...none, horror: true })).toBe('13+');
  });
});

const base: JoinFacts = {
  policy: { mode: 'public' },
  status: 'published',
  isOwner: false,
  isMember: false,
  isFriendOfOwner: false,
  passwordMatches: false,
  hasValidInvite: false,
  hasSubscription: false,
  isClassMember: false,
};

describe('decideJoin', () => {
  it('lets anyone into a published public world', () => {
    expect(decideJoin(base)).toEqual({ allowed: true });
  });

  it('keeps strangers out of drafts but lets the owner in', () => {
    expect(decideJoin({ ...base, status: 'draft' })).toEqual({ allowed: false, reason: 'not_available' });
    expect(decideJoin({ ...base, status: 'draft', isOwner: true })).toEqual({ allowed: true });
  });

  it('blocks even the owner when suspended', () => {
    expect(decideJoin({ ...base, status: 'suspended', isOwner: true })).toEqual({
      allowed: false,
      reason: 'not_available',
    });
  });

  it('applies each access mode', () => {
    expect(decideJoin({ ...base, policy: { mode: 'private' } })).toMatchObject({ reason: 'private' });
    expect(decideJoin({ ...base, policy: { mode: 'invite' } })).toMatchObject({ reason: 'invite_required' });
    expect(decideJoin({ ...base, policy: { mode: 'invite' }, hasValidInvite: true })).toEqual({
      allowed: true,
    });
    const password = { mode: 'password', passwordHash: 'x' } as const;
    expect(decideJoin({ ...base, policy: password })).toMatchObject({ reason: 'password_required' });
    expect(decideJoin({ ...base, policy: password, passwordMatches: true })).toEqual({ allowed: true });
    expect(decideJoin({ ...base, policy: { mode: 'friends' }, isFriendOfOwner: true })).toEqual({
      allowed: true,
    });
    expect(decideJoin({ ...base, policy: { mode: 'class', classId: 'c1' } })).toMatchObject({
      reason: 'class_only',
    });
  });
});
