'use client';

import { Monitor, Smartphone, Tv } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { authClient } from '../../lib/auth-client';
import { Button, Card, ErrorNote } from '../ui';

type Device = {
  token: string;
  userAgent?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/** "Chrome on Windows" from a user agent (the API names devices the same way for the QR sign-in). */
function deviceName(userAgent: string | null | undefined): {
  name: string;
  kind: 'phone' | 'tv' | 'computer';
} {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'A browser';
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iPhone or iPad'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'an unknown device';
  const tv = /SmartTV|SMART-TV|Tizen|Web0S|AFT|BRAVIA|HbbTV/i.test(ua);
  const phone = /Android|iPhone|iPad|iPod|Mobile/.test(ua);
  return {
    name: `${browser} on ${system}${tv ? ' (TV)' : ''}`,
    kind: tv ? 'tv' : phone ? 'phone' : 'computer',
  };
}

const when = (value: Date | string) => {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Active ${minutes} min ago`;
  if (minutes < 60 * 24) return `Active ${Math.round(minutes / 60)} h ago`;
  return `Active ${date.toLocaleDateString()}`;
};

/**
 * Where this account is signed in (owner N-151): every device with its browser, system and last activity; sign out
 * one device, or every device except this one.
 */
export function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [list, session] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    if (list.error) setError('Could not load your devices.');
    setDevices(
      [...((list.data ?? []) as Device[])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    );
    setCurrent(session.data?.session.token ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = async (token: string) => {
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.revokeSession({ token });
    if (failed) setError('Could not sign out that device. Please try again.');
    await load();
    setBusy(false);
  };

  const signOutOthers = async () => {
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.revokeOtherSessions();
    if (failed) setError('Could not sign out the other devices. Please try again.');
    await load();
    setBusy(false);
  };

  const others = devices?.filter((device) => device.token !== current).length ?? 0;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">Signed-in devices</p>
          <p className="text-sm text-ink/60">
            {devices
              ? `Your account is signed in on ${devices.length} ${devices.length === 1 ? 'device' : 'devices'}.`
              : 'Loading…'}
          </p>
        </div>
        {others > 0 ? (
          <Button variant="secondary" disabled={busy} onClick={signOutOthers}>
            Sign out all other devices
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-ink/10 border-t border-ink/10">
        {devices?.map((device) => {
          const { name, kind } = deviceName(device.userAgent);
          const Icon = kind === 'phone' ? Smartphone : kind === 'tv' ? Tv : Monitor;
          const here = device.token === current;
          return (
            <li key={device.token} className="flex items-center gap-3 py-3">
              <Icon className="size-6 shrink-0 text-ink/70" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{name}</p>
                <p className="text-sm text-ink/60">
                  {here ? 'This device' : when(device.updatedAt)} · signed in{' '}
                  {new Date(device.createdAt).toLocaleDateString()}
                </p>
              </div>
              {here ? null : (
                <Button variant="ghost" disabled={busy} onClick={() => signOut(device.token)}>
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote message={error} />
    </Card>
  );
}
