export declare const MOTION_CATEGORIES: readonly ["Idle", "Walking", "Running", "Jumping", "Turning", "Crouching", "Swimming", "Traversal", "Gestures", "Conversation", "Dance", "Combat", "Reactions", "Interactions", "Fitness", "Sports", "Poses", "Utility", "Review"];
export type MotionCategory = typeof MOTION_CATEGORIES[number];
/** Action words take precedence over posture adjectives such as standing or sitting. */
export declare function motionCategories(name: string, sourceCategory?: string): MotionCategory[];
