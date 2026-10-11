import type { AccessPolicy } from './access.js';

/**
 * Facts the server gathers before deciding whether a user may enter an experience.
 * The decision itself is pure so the API and the realtime server apply the same rules.
 */
export interface JoinFacts {
  policy: AccessPolicy;
  status: 'draft' | 'published' | 'suspended' | 'offline';
  isOwner: boolean;
  isMember: boolean;
  isFriendOfOwner: boolean;
  passwordMatches: boolean;
  hasValidInvite: boolean;
  hasSubscription: boolean;
  isClassMember: boolean;
}

export type JoinDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'not_available'
        | 'private'
        | 'friends_only'
        | 'invite_required'
        | 'password_required'
        | 'subscription_required'
        | 'class_only';
    };

export function decideJoin(facts: JoinFacts): JoinDecision {
  if (facts.isOwner || facts.isMember) {
    return facts.status === 'suspended' ? { allowed: false, reason: 'not_available' } : { allowed: true };
  }
  if (facts.status !== 'published') return { allowed: false, reason: 'not_available' };

  switch (facts.policy.mode) {
    case 'public':
      return { allowed: true };
    case 'private':
      return { allowed: false, reason: 'private' };
    case 'friends':
      return facts.isFriendOfOwner ? { allowed: true } : { allowed: false, reason: 'friends_only' };
    case 'invite':
      return facts.hasValidInvite ? { allowed: true } : { allowed: false, reason: 'invite_required' };
    case 'password':
      return facts.passwordMatches ? { allowed: true } : { allowed: false, reason: 'password_required' };
    case 'subscription':
      return facts.hasSubscription ? { allowed: true } : { allowed: false, reason: 'subscription_required' };
    case 'class':
      return facts.isClassMember ? { allowed: true } : { allowed: false, reason: 'class_only' };
  }
}
