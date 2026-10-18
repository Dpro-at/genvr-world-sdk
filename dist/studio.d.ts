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
export interface StudioOptions { sharing?: import('./types/studio-sharing.js').StudioSharing; filmExample?: string | false; liveBridge?: { url: string; token: string }; motionLibrary?: AvatarMotionLibrary; userLibrary?: false | { scope: string; storage?: UserAvatarStorage }; presentation?: AvatarPresentationOptions; storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; initialProjectId?: string; agents?: (projectId: string) => Promise<StudioAgent[]>; catalog?: { list(): Promise<StudioCatalogItem[]>; asset(id: string): Promise<StudioProject['assets'][number]> }; }
export declare function mountStudio(container: HTMLElement, options?: StudioOptions): { dispose(): Promise<boolean> };

export declare function mountAvatarPresentation(container: HTMLElement, runtime: Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'>, options?: AvatarPresentationOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; dispose(): void };

export { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from './types/avatar-live-embed.js';

export interface AvatarLiveOptions extends AvatarPresentationOptions { recipe?: import('@genvr/contracts').CharacterRecipe; display?: Partial<import('@genvr/assistant').AvatarLiveDisplay>; projectId?: string; }
export declare function mountAvatarLive(container: HTMLElement, options?: AvatarLiveOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; setRecipe(recipe: import('@genvr/contracts').CharacterRecipe): void; speak(input: {data:string;target:string;duration:number;text?:string}): Promise<void>; speechControl(command:string,value?:number): Promise<unknown>; snapshot(): unknown; dispose():void; };
