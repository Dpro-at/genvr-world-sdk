'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CharacterStage } from '@genvr/runtime/character';
import type { StoreEntry } from './store-items';
import type { AvatarLook } from '@genvr/contracts';
import type { AvatarPresentationEvent } from '@genvr/assistant';
import type { ChatModel } from '@genvr/assistant';

export interface StudioHost {
  platform: boolean;
  avatarVoice?: import('@genvr/assistant').AssistantHost['avatarVoice'];
  userAvatarLibrary?: import('@genvr/assistant').AssistantHost['userAvatarLibrary'];
  userAvatarControls?: (section: 'characters' | 'motions', search?: string, onSelfBody?: (id: `user.${string}` | 'classic') => void) => ReactNode;
  presentationControls?: (section: 'motions' | 'expressions' | 'effects' | 'notifications' | 'cards', search?: string) => ReactNode;
  presentationOverlay?: () => ReactNode;
  characterBody?: (change: (id: import('@genvr/contracts').BodyId) => void) => () => void;
  shareStudio?: import('@genvr/assistant').AssistantHost['shareStudio'];
  share?: () => void;
  avatarLive?: () => void;
  /** Opens the Avatar voice window (voice library, clone, models); the Avatar tab's Voice tab uses it. */
  openVoice?: () => void;
  characterRecipe?: (recipe: import('@genvr/contracts').CharacterRecipe) => void;
  characterLook?: (look: AvatarLook) => void;
  presentationStage?: (stage: CharacterStage | null) => void;
  presentationInfo?: () => string;
  presentAvatar?: (event: AvatarPresentationEvent) => string | null;
  catalog?: { list(): Promise<StoreEntry[]> };
  model?: ChatModel;
  leave?: () => void;
  settings?: () => void;
}
const Context = createContext<StudioHost>({ platform: true });
export function StudioHostProvider({ value, children }: { value: StudioHost; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useStudioHost = () => useContext(Context);
