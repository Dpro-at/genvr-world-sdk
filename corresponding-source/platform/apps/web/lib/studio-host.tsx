'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ChatModel } from '@genvr/assistant';

export interface StudioHost {
  platform: boolean;
  model?: ChatModel;
  leave?: () => void;
  settings?: () => void;
}
const Context = createContext<StudioHost>({ platform: true });
export function StudioHostProvider({ value, children }: { value: StudioHost; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useStudioHost = () => useContext(Context);
