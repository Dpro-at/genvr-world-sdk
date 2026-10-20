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
export interface StudioOptions { sharing?: import('./types/studio-sharing.js').StudioSharing; /** Publishes shared lab motions (board M14); without it a share is a local preview. */ motionSharing?: { publish(share: unknown, version: unknown): Promise<{ url?: string }>; unpublish(share: unknown): Promise<void> }; filmExample?: string | false; liveBridge?: { url: string; token: string }; motionLibrary?: AvatarMotionLibrary; userLibrary?: false | { scope: string; storage?: UserAvatarStorage }; presentation?: AvatarPresentationOptions; storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; initialProjectId?: string; agents?: (projectId: string) => Promise<StudioAgent[]>; catalog?: { list(): Promise<StudioCatalogItem[]>; asset(id: string): Promise<StudioProject['assets'][number]> }; }
export declare function mountStudio(container: HTMLElement, options?: StudioOptions): { dispose(): Promise<boolean> };

export declare function mountAvatarPresentation(container: HTMLElement, runtime: Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'>, options?: AvatarPresentationOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; dispose(): void };

export { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from './types/avatar-live-embed.js';

/** Choices the owner makes in Avatar Live Settings, reported to the host. */
export interface AvatarLivePrefs { size: 's' | 'm' | 'l'; speak: boolean; notifications: boolean; effects: boolean; sidePanel: boolean; notice: Record<'approvals' | 'tasks' | 'messages' | 'calendar' | 'other', boolean>; mode: 'me' | 'customers'; }
/** Host hooks for an embedded Avatar Live: with them it shows the same Settings window as the Avatar Live page. */
export interface AvatarLiveHost { voices?: readonly { id: string; name: string; language?: string | null }[]; voiceId?: string; onVoice?(voiceId: string): void; onPrefs?(prefs: AvatarLivePrefs): void; onSettings?(open: boolean): void; }
export interface AvatarLiveOptions extends AvatarPresentationOptions { recipe?: import('@genvr/contracts').CharacterRecipe; display?: Partial<import('@genvr/assistant').AvatarLiveDisplay>; projectId?: string; agent?: { name: string; detail?: string }; host?: AvatarLiveHost; }
export declare function mountAvatarLive(container: HTMLElement, options?: AvatarLiveOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; setRecipe(recipe: import('@genvr/contracts').CharacterRecipe): void; setHost(next: { agent?: { name: string; detail?: string }; host?: Partial<AvatarLiveHost> }): void; openSettings(): void; speak(input: {data:string;target:string;duration:number;text?:string}): Promise<void>; speechControl(command:string,value?:number): Promise<unknown>; snapshot(): unknown; dispose():void; };
