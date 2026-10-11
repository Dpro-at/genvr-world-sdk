import type { ReactNode } from 'react';

export function Page({ title, children }: { title?: string; children: ReactNode }) {
  return <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
    {title ? <h1 className="mb-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1> : null}
    {children}
  </main>;
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">{message}</p> : null;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const tones = { neutral: 'bg-ink/5 text-ink/70', good: 'bg-mint/15 text-mint', warn: 'bg-sun/25 text-ink/70' };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}
