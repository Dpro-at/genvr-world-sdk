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
export type JoinDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: 'not_available' | 'private' | 'friends_only' | 'invite_required' | 'password_required' | 'subscription_required' | 'class_only';
};
export declare function decideJoin(facts: JoinFacts): JoinDecision;
