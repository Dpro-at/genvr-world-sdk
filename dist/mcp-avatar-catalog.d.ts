/** Reads metadata only from an operator-configured catalog, never model or motion bytes. */
export declare function listAvatarMotions(input: unknown, catalogPath?: string): Promise<{
    total: number;
    matched: number;
    offset: number;
    entries: {
        id: string;
        name: string;
        categories: ("Dance" | "Idle" | "Walking" | "Running" | "Jumping" | "Turning" | "Crouching" | "Swimming" | "Traversal" | "Gestures" | "Conversation" | "Combat" | "Reactions" | "Interactions" | "Fitness" | "Sports" | "Poses" | "Utility" | "Review")[];
        source: string;
    }[];
    expressions: readonly ["neutral", "smile", "angry", "sad", "surprised", "thinking"];
    viewportConnected: boolean;
    note: string;
}>;
