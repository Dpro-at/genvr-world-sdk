'use client';

import type { PlayDevice } from '@genvr/contracts';
import { Play } from 'lucide-react';
import Link from 'next/link';
import { DEVICES } from './play-settings';

/** The first letters of the first two words ("Crystal Space Park" gives "CS"). */
const initials = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');

/**
 * The cover of a place: its picture, or, until it has one, its initials set very large and
 * cropped by the frame on a dotted ground (never an empty grey box, and never the name twice).
 */
export function PlaceCover({ title, thumbnailUrl }: { title: string; thumbnailUrl: string | null }) {
  if (thumbnailUrl)
    return <img src={thumbnailUrl} alt="" className="aspect-video w-full bg-paper object-cover" />;
  return (
    <div
      aria-hidden
      className="relative aspect-video w-full overflow-hidden bg-ink/[0.05] text-ink"
      style={{
        backgroundImage:
          'radial-gradient(color-mix(in srgb, currentColor 13%, transparent) 1px, transparent 1.4px)',
        backgroundSize: '14px 14px',
      }}
    >
      <span className="absolute -bottom-[0.2em] left-[0.08em] text-[46cqw] leading-none font-black tracking-[-0.06em] select-none">
        {initials(title)}
      </span>
    </div>
  );
}

const plays = (count: number) => (count === 1 ? '1 play' : `${count.toLocaleString('en')} plays`);

/** A place in a list: cover, name, maker, plays, and the devices it is made for. */
export function PlaceCard({
  href,
  title,
  subtitle,
  thumbnailUrl,
  devices,
  playCount,
}: {
  href: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string | null;
  devices?: readonly PlayDevice[];
  playCount?: number;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface ring-1 ring-ink/5 outline-none transition-shadow hover:ring-ink/20 focus-visible:ring-2 focus-visible:ring-ink [container-type:inline-size]"
    >
      <PlaceCover title={title} thumbnailUrl={thumbnailUrl} />
      <div className="flex flex-col gap-0.5 px-3.5 pt-3 pb-3.5">
        <h3 className="truncate text-[15px] font-extrabold">{title}</h3>
        <p className="truncate text-[13px] text-ink/55">{subtitle}</p>
        {playCount !== undefined || devices ? (
          <div className="mt-2 flex items-center gap-3 text-[13px] text-ink/55">
            {playCount !== undefined ? (
              <span className="inline-flex items-center gap-1 font-bold">
                <Play className="size-3.5" aria-hidden />
                {plays(playCount)}
              </span>
            ) : null}
            {devices ? (
              <span
                className="ml-auto flex items-center gap-1.5"
                aria-label={`Made for: ${devices.map((d) => DEVICES[d].label).join(', ')}`}
              >
                {devices.map((device) => {
                  const { Icon } = DEVICES[device];
                  return <Icon key={device} className="size-3.5" aria-hidden />;
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
