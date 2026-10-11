import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
export { Page, ErrorNote, Badge } from './ui-content';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-dark shadow-[0_4px_0_0_var(--color-brand-dark)]',
  secondary: 'bg-surface text-ink border-2 border-ink/10 hover:border-brand',
  danger: 'bg-coral text-on-brand hover:brightness-95',
  ghost: 'bg-transparent text-ink hover:bg-ink/5',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold transition active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none select-none';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = 'primary',
  children,
  className = '',
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] bg-surface p-6 shadow-sm ring-1 ring-ink/5 ${className}`}>
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="animate-pulse text-ink/50">Loading…</p>;
}
