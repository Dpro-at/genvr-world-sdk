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
export interface StudioOptions { sharing?: import('./types/studio-sharing.js').StudioSharing; /** Publishes shared lab motions (board M14); without it a share is a local preview. */ motionSharing?: { publish(share: unknown, version: unknown): Promise<{ url?: string }>; unpublish(share: unknown): Promise<void> }; filmExample?: string | false; liveBridge?: { url: string; token: string }; motionLibrary?: AvatarMotionLibrary; userLibrary?: false | { scope: string; storage?: UserAvatarStorage }; presentation?: AvatarPresentationOptions; storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; initialProjectId?: string; agents?: (projectId: string) => Promise<StudioAgent[]>; catalog?: { list(): Promise<StudioCatalogItem[]>; asset(id: string): Promise<StudioProject['assets'][number]> };
  /** Told which world is open (on open, tab change, rename), so a host's own chat knows the place. */
  onContext?: (context: StudioContext) => void;
  /** A host's own chat: the chat shows on every tab with the place, its folder and who answers. Pair it with `model`. */
  chat?: StudioChatOptions;
  /** A host with its own place list: My projects (after saving) returns to the host instead of the Studio's own project page, and that page is not shown. */
  onHome?: () => void;
  /** Open the owner's motion lab at once (made the first time), like the Motion lab button. */
  openLab?: boolean;
  /** A desktop host: the full editor (tabs, panels, Lab) in any window with a mouse, also when it is narrow. */
  desktopLayout?: boolean;
  /** Open with this market item ready to place: the Items tab shows it. */
  placeItem?: string; }
/** The world open in the Studio. */
export interface StudioContext { projectId: string; name: string; tab: 'build' | 'items' | 'avatar' | 'filming' | 'lab'; look: 'realistic' | 'blocky' | 'anime' | 'voxel'; kind: 'valley' | 'island' | 'plain' | 'mountains' | 'empty'; }
/** What a host's chat shows about the place; `color` is #rrggbb. */
export interface StudioChatInfo { folder?: string; answerer?: { name: string; detail?: string; color?: string }; /** The host's earlier lines of this place's chat, oldest first. */ history?: { role: 'user' | 'assistant'; text: string }[]; /** The names of the agents in this place. */ team?: string[]; }
export interface StudioChatOptions extends StudioChatInfo { /** Opens the host's own picker for who answers. */ chooseAnswerer?: () => void; /** Opens this same chat in the host's chat window. */ openChat?: () => void; /** Shows the place's folder in the file manager. */ openFolder?: () => void; }
export declare function mountStudio(container: HTMLElement, options?: StudioOptions): { /** Change what the chat shows (needs the chat option). */ setChat(info: StudioChatInfo): void; dispose(): Promise<boolean> };

export declare function mountAvatarPresentation(container: HTMLElement, runtime: Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'>, options?: AvatarPresentationOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; dispose(): void };

export { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from './types/avatar-live-embed.js';

/** Choices the owner makes in Avatar Live Settings, reported to the host. */
export interface AvatarLivePrefs { size: 's' | 'm' | 'l'; speak: boolean; notifications: boolean; effects: boolean; sidePanel: boolean; notice: Record<'approvals' | 'tasks' | 'messages' | 'calendar' | 'other', boolean>; mode: 'me' | 'customers'; }
/** Host hooks for an embedded Avatar Live: with them it shows the same Settings window as the Avatar Live page. */
export interface AvatarLiveHost { voices?: readonly { id: string; name: string; language?: string | null }[]; voiceId?: string; onVoice?(voiceId: string): void; onPrefs?(prefs: AvatarLivePrefs): void; onSettings?(open: boolean): void; }
export interface AvatarLiveOptions extends AvatarPresentationOptions { recipe?: import('@genvr/contracts').CharacterRecipe; display?: Partial<import('@genvr/assistant').AvatarLiveDisplay>; projectId?: string; agent?: { name: string; detail?: string }; host?: AvatarLiveHost; }
export declare function mountAvatarLive(container: HTMLElement, options?: AvatarLiveOptions): { execute: AvatarPresentation['execute']; controller: AvatarPresentation; setRecipe(recipe: import('@genvr/contracts').CharacterRecipe): void; setHost(next: { agent?: { name: string; detail?: string }; host?: Partial<AvatarLiveHost> }): void; openSettings(): void; speak(input: {data:string;target:string;duration:number;text?:string}): Promise<void>; speechControl(command:string,value?:number): Promise<unknown>; snapshot(): unknown; dispose():void; };

/** GV1c v2: the Studio's Items catalog on its own, for a host's market page. */
export interface MarketOptions { catalog: { list(): Promise<unknown[]> }; onAdd?: (itemId: string) => void; style?: 'blocky' | 'realistic' | 'voxel' | 'anime'; }
export declare function mountMarket(container: HTMLElement, options: MarketOptions): { dispose(): void };
