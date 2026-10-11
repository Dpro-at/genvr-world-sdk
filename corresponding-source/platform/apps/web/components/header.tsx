'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  Compass,
  LayoutGrid,
  LogOut,
  MonitorSmartphone,
  Package,
  Plus,
  Settings,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { GenvrMark } from './genvr-mark';
import { ThemePicker } from './theme-picker';
import { ButtonLink } from './ui';
import { useIsDesktop } from './desktop-shell';

const NAV: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Discover', Icon: Compass },
  { href: '/market', label: 'Marketplace', Icon: Store },
  { href: '/download', label: 'Download', Icon: MonitorSmartphone },
];

/** The signed-in person's Google picture, or their initials when there is none. */
function Avatar({ name, image, size = 'size-9' }: { name: string; image?: string | null; size?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?';
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element -- the Google profile picture, already small
    <img
      src={image}
      alt=""
      referrerPolicy="no-referrer"
      className={`${size} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-on-brand`}
    >
      {initials}
    </span>
  );
}

const menuItem =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold text-ink/85 hover:bg-ink/5 hover:text-ink';

/**
 * The top bar (owner N-154): Discover and Marketplace on the left; Create and the profile menu on the right. The
 * profile menu (picture or initials) holds My places, My items, Settings, signing in another device, the theme and
 * Sign out. Only discovery and marketplace show this global bar (owner N-212).
 */
export function Header() {
  const desktop = useIsDesktop();
  const navigation = desktop ? NAV.filter(({ href }) => href !== '/download') : NAV;
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (pathname !== '/' && pathname !== '/market') return null;

  const signOut = async () => {
    setOpen(false);
    await authClient.signOut();
    router.push('/');
    router.refresh();
  };

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-ink/5 bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-black tracking-tight text-ink sm:text-2xl"
        >
          <GenvrMark className="size-8" />
          <span className="hidden min-[400px]:inline">GENVR</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navigation.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              data-web-only={href === '/download' ? true : undefined}
              aria-current={active(href) ? 'page' : undefined}
              className={`rounded-xl px-3 py-2 font-bold transition-colors ${
                active(href) ? 'bg-ink/5 text-ink' : 'text-ink/60 hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Phones: the Marketplace stays one tap away. */}
          <Link
            href="/market"
            aria-label="Marketplace"
            title="Marketplace"
            className="inline-flex size-10 items-center justify-center rounded-2xl text-ink hover:bg-ink/5 md:hidden"
          >
            <Store className="size-5" aria-hidden />
          </Link>
          {isPending ? (
            <span className="size-10" />
          ) : user ? (
            <>
              <ButtonLink href="/create" className="inline-flex items-center gap-1.5 px-3! py-2 sm:px-4!">
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Create</span>
              </ButtonLink>
              <div ref={menu} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label="Your account"
                  onClick={() => setOpen((value) => !value)}
                  className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 ring-1 ring-ink/10 hover:ring-ink/30"
                >
                  <Avatar name={user.name || user.email} image={user.image} />
                  <ChevronDown className="size-4 text-ink/60" aria-hidden />
                </button>
                {open ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface p-2 shadow-xl ring-1 ring-ink/10"
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <Avatar name={user.name || user.email} image={user.image} size="size-11" />
                      <div className="min-w-0">
                        <p className="truncate font-bold">{user.name || 'Your account'}</p>
                        <p className="truncate text-sm text-ink/55">{user.email}</p>
                      </div>
                    </div>
                    <div className="my-1 border-t border-ink/10" />
                    <div className="md:hidden">
                      {navigation.map(({ href, label, Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          role="menuitem"
                          className={menuItem}
                          data-web-only={href === '/download' ? true : undefined}
                        >
                          <Icon className="size-5 text-ink/60" aria-hidden />
                          {label}
                        </Link>
                      ))}
                    </div>
                    <Link href="/places" role="menuitem" className={menuItem}>
                      <LayoutGrid className="size-5 text-ink/60" aria-hidden />
                      My places
                    </Link>
                    <Link href="/items" role="menuitem" className={menuItem}>
                      <Package className="size-5 text-ink/60" aria-hidden />
                      My items
                    </Link>
                    <Link href="/settings" role="menuitem" className={menuItem}>
                      <Settings className="size-5 text-ink/60" aria-hidden />
                      Settings
                    </Link>
                    <Link href="/link" role="menuitem" className={menuItem}>
                      <MonitorSmartphone className="size-5 text-ink/60" aria-hidden />
                      Sign in another device
                    </Link>
                    <div className="my-1 border-t border-ink/10" />
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm font-semibold text-ink/70">Theme</span>
                      <ThemePicker compact />
                    </div>
                    <div className="my-1 border-t border-ink/10" />
                    <button type="button" role="menuitem" onClick={signOut} className={menuItem}>
                      <LogOut className="size-5 text-ink/60" aria-hidden />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <ButtonLink href="/login" className="px-4 py-2">
              Sign in
            </ButtonLink>
          )}
        </div>
      </nav>
    </header>
  );
}
