'use client';

import { authClient } from './auth-client';
import { useStudioFilming } from './use-studio-filming';
import type { RefObject } from 'react';
import type { GenvrRuntime } from '@genvr/runtime';

/** Website identity only; shared film editing never fabricates an authenticated session. */
export function usePlatformFilming(place: string, runtime: RefObject<GenvrRuntime | null>, container: RefObject<HTMLDivElement | null>, log: (text: string) => void, editing: () => boolean) {
  const { data: session } = authClient.useSession();
  return useStudioFilming(place, runtime, container, log, editing, session?.user.id ? `${session.user.id}:${place}` : null);
}
