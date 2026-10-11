'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import LoginPage from '../app/login/page';
import { authClient } from '../lib/auth-client';
import { desktopAuthState, desktopLoginTarget } from '../lib/desktop-auth-policy';
import { useIsDesktop } from './desktop-shell';
import { WebRespectSupport } from './web-respect-support';
import { ReportLink } from './context-report';

/** Keep desktop app content closed until the persistent server session is checked. */
export function DesktopAuthGate({ children }: { children: ReactNode }) {
  const desktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending, error, refetch } = authClient.useSession();
  // Public safety notices remain available without opening any authenticated app content.
  const publicNotice =
    pathname === '/report-illegal-content' || pathname === '/report-illegal-content/status';
  const state = publicNotice ? 'open' : desktopAuthState(desktop, isPending, !!session?.user, !!error);

  useEffect(() => {
    if (state === 'login' && pathname !== '/login') {
      router.replace(desktopLoginTarget(location.pathname + location.search + location.hash));
    }
  }, [state, pathname, router]);

  return (
    <div
      data-desktop-gate
      data-desktop-ready={desktop ? 'true' : undefined}
      className="flex min-h-dvh flex-col"
    >
      {state === 'open' ? (
        children
      ) : state === 'login' ? (
        <>
          <div id="genvr-accessible-content" className="flex min-h-dvh flex-col">
            <LoginPage />
            <footer className="mx-auto mt-auto px-6 py-8 text-sm">
              <ReportLink className="text-ink/55 hover:text-ink hover:underline" />
              <div id="genvr-support-controls" data-web-only />
            </footer>
          </div>
          <WebRespectSupport />
        </>
      ) : (
        <main className="m-auto max-w-md p-6 text-center" aria-live="polite">
          <h1 className="text-2xl font-black">Genvr</h1>
          <p className="my-4">
            {state === 'error'
              ? 'Could not check your sign-in. Check your connection and try again.'
              : 'Checking your sign-in…'}
          </p>
          {state === 'error' ? (
            <button
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          ) : null}
        </main>
      )}
    </div>
  );
}
