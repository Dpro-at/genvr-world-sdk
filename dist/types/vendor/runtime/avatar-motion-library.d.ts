import type { AnimationClip, Object3D } from 'three/webgpu';
export interface AvatarMotionEntry {
    id: string;
    name: string;
    category: string;
    loop: boolean;
    /** The host supplies private, self-contained motion-only GLB data. */
    load(): Promise<ArrayBuffer>;
}
export interface AvatarMotionLibrary {
    entries: readonly AvatarMotionEntry[];
    /** Native clip names mapped to library IDs; omitting a name keeps its original clip. */
    replacements?: Readonly<Record<string, string>>;
    onError?(id: string, error: unknown): void;
}
export declare const avatarMotionLibraryRevision: () => number;
export declare const subscribeAvatarMotionLibrary: (listener: () => void) => () => void;
/** Installs a host-owned catalog for every compatible avatar; disposing restores native clips. */
export declare function registerAvatarMotionLibrary(library: AvatarMotionLibrary): () => void;
export declare function avatarMotionEntry(name: string): AvatarMotionEntry | undefined;
export declare function resolveAvatarLibraryMotion(root: Object3D, name: string): Promise<{
    clip: AnimationClip;
    loop: boolean;
} | null>;
export declare function avatarMotionEntries(): readonly AvatarMotionEntry[];
