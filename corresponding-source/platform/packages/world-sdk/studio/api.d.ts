import type { ChatModel } from './types/vendor/assistant/index.js';
import type { StudioStorage } from './types/studio-project.js';
export interface StudioOptions { storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; }
export declare function mountStudio(container: HTMLElement, options?: StudioOptions): { dispose(): Promise<boolean> };
