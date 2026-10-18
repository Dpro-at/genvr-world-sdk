import type { AvatarMotionLibrary } from './types/vendor/runtime/index.js';
import type { GenvrRuntime } from './types/vendor/runtime/index.js';
import type { AvatarPresentation } from './types/avatar-presentation.js';
import type { AvatarPresentationOptions } from './types/avatar-presentation.js';
import type { ChatModel } from './types/vendor/assistant/index.js';
import type { StudioStorage } from './types/studio-project.js';
import type { UserAvatarStorage } from './types/user-avatar-library.js';
import type { StudioAgent } from './types/studio-agents.js';
import type { StudioProject } from './types/studio-project.js';
import type { GenvrManifest } from './types/vendor/contracts/index.js';
export interface StudioCatalogItem { manifest: GenvrManifest; picture: string | null; caption: string | null; tags: string[]; }
export interface StudioOptions { filmExample?: string | false; liveBridge?: { url: string; token: string }; motionLibrary?: AvatarMotionLibrary; userLibrary?: false | { scope: string; storage?: UserAvatarStorage }; presentation?: AvatarPresentationOptions; storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; initialProjectId?: string; agents?: (projectId: string) => Promise<StudioAgent[]>; catalog?: { list(): Promise<StudioCatalogItem[]>; asset(id: string): Promise<StudioProject['assets'][number]> }; }
export declare function mountStudio(container: HTMLElement, options?: StudioOptions): { dispose(): Promise<boolean> };

export declare function mountAvatarPresentation(container: HTMLElement, runtime: Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'>, options?: AvatarPresentationOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; dispose(): void };
