'use client';

import { ChevronDown, Ellipsis, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Native disclosure with outside-click/Escape dismissal and keyboard focus restoration. */
export function ToolbarMenu({
  label,
  children,
  compact = false,
  icon: Icon,
  closeOnAction = false,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
  compact?: boolean;
  closeOnAction?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute('open');
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.removeAttribute('open');
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={label}
        title={label}
        className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-ink/10 [&::-webkit-details-marker]:hidden"
      >
        {compact ? (
          <Ellipsis aria-hidden className="size-4" />
        ) : (
          <>
            {Icon ? <Icon aria-hidden className="size-4" /> : null}{label}
            <ChevronDown aria-hidden className="size-3" />
          </>
        )}
      </summary>
      <div
        onClick={(event) => {
          if (closeOnAction && (event.target as Element).closest('button')) {
            ref.current?.removeAttribute('open');
            ref.current?.querySelector('summary')?.focus();
          }
        }}
        className={`absolute top-full right-0 z-50 mt-2 flex max-h-[70dvh] ${compact ? 'w-48' : 'w-72'} flex-col gap-2 overflow-y-auto rounded-xl border border-ink/10 bg-surface p-3 text-sm text-ink shadow-xl`}
      >
        {children}
      </div>
    </details>
  );
}
