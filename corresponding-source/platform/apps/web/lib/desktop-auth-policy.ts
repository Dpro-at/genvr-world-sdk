/** Desktop presentation gate; API authorization remains enforced by the server. */
export function desktopAuthState(desktop: boolean, pending: boolean, signedIn: boolean, failed: boolean) {
  if (!desktop) return 'open';
  if (pending) return 'loading';
  if (failed) return 'error';
  if (signedIn) return 'open';
  return 'login';
}

/** Only local app destinations can be restored after sign-in. */
export function desktopLoginTarget(path: string) {
  if (path === '/login' || path.startsWith('/login?')) return '/login';
  return `/login?next=${encodeURIComponent(path)}`;
}
