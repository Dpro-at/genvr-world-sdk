import { type PresentationNotification, type PresentationSpec } from './vendor/assistant/index.js';
import type { GenvrRuntime } from './vendor/runtime/index.js';
export { AvatarPresentationEvent, EXPRESSIONS, EFFECTS, NOTIFICATION_TYPES } from './vendor/assistant/index.js';
export type { PresentationNotification, PresentationSpec } from './vendor/assistant/index.js';
export declare const PRESENTATION_ANIMATIONS: {
    id: string;
    label: string;
    clip: string;
}[];
export declare function resolvePresentationAnimation(id: string): string | null;
export interface PresentationActions {
    approve?(notification: PresentationNotification): Promise<void>;
    reply?(notification: PresentationNotification, text: string): Promise<void>;
    draftReply?(notification: PresentationNotification): Promise<string>;
}
export interface AvatarPresentationOptions {
    enabled?: boolean;
    actions?: PresentationActions;
    /** Host events for the open project; return a disposer. */
    subscribe?(projectId: string, emit: (event: unknown) => string | null): () => void;
}
export interface PresentationState {
    notifications: Array<PresentationNotification & {
        id: string;
        repliedWith?: string;
    }>;
    cards: Array<{
        id: string;
        title: string;
        spec: PresentationSpec;
        duration: number;
    }>;
    effects: Partial<Record<string, number>>;
    lastAction: string;
    motions: Array<{
        target: string;
        id: string;
        label: string;
    }>;
}
type Runtime = Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'> & Partial<Pick<GenvrRuntime, 'importAvatarMotion'>>;
/** One controller per mounted viewport. The assistant, host and sidebar use the same validated executor. */
export declare class AvatarPresentation {
    #private;
    private runtime;
    readonly options: AvatarPresentationOptions;
    constructor(runtime: () => Runtime | null, options?: AvatarPresentationOptions);
    snapshot: () => PresentationState;
    describe: () => string;
    subscribe: (listener: () => void) => () => void;
    execute: (input: unknown) => string | null;
    importMotion(target: string, label: string, data: ArrayBuffer, slot?: 'user-library'): Promise<void>;
    dismiss: (id: string) => void;
    approve(id: string): Promise<void>;
    reply(id: string, text: string): Promise<void>;
    clear(): void;
    dispose(): void;
}
