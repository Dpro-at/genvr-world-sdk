'use client';

import { useEffect, useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const desktopSnapshot = () =>
  /\bGenvrDesktop\/\d+\.\d+\.\d+\b/.test(navigator.userAgent) ||
  (window as unknown as { genvrDesktop?: { isDesktop?: boolean } }).genvrDesktop?.isDesktop === true;
export const useIsDesktop = () => useSyncExternalStore(subscribe, desktopSnapshot, () => false);

/** Keep legal/website links out of Next client routing so Electron can open them externally. */
export function DesktopShell() {
  const desktop = useIsDesktop();
  useEffect(() => {
    if (!desktop) return;
    const external = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!link) return;
      let url: URL;
      let path: string;
      try {
        url = new URL(link.getAttribute('href')!, location.href);
        path = decodeURIComponent(url.pathname);
      } catch {
        return;
      }
      const core =
        path === '/' ||
        path === '/report-illegal-content' ||
        path === '/report-illegal-content/status' ||
        /^\/(?:market|places|items|create|character|play|settings|login|onboarding|link)(?:\/|$)/.test(
          path,
        ) ||
        path === '/sources/signed-in' ||
        path.startsWith('/api/auth/');
      if (url.origin === location.origin && !core) {
        event.preventDefault();
        event.stopPropagation();
        location.assign(url.href);
      }
    };
    document.addEventListener('click', external, true);
    return () => document.removeEventListener('click', external, true);
  }, [desktop]);
  return null;
}
