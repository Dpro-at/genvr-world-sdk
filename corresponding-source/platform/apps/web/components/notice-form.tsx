'use client';

import type { NoticeCategory } from '@genvr/contracts';
import { CircleCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, ErrorNote } from './ui';
import { api, errorMessage } from '../lib/api';
import { noticeLocation, type ReportContext } from '../lib/report-context';

const CATEGORIES: Array<{ id: NoticeCategory; label: string; hint: string }> = [
  {
    id: 'child-safety',
    label: 'Child safety',
    hint: 'Abuse of children, grooming, sexual content with minors',
  },
  { id: 'terrorism', label: 'Terrorism', hint: 'Terrorist content or propaganda' },
  {
    id: 'hate-or-violence',
    label: 'Hate or violence',
    hint: 'Illegal hate speech, threats, or calls to violence',
  },
  { id: 'harassment', label: 'Harassment', hint: 'Stalking, threats, or illegal harassment of a person' },
  { id: 'privacy', label: 'Private information', hint: 'Someone’s personal data shared without permission' },
  {
    id: 'intellectual-property',
    label: 'Copyright or trademark',
    hint: 'Your work or brand used without permission',
  },
  { id: 'scam-or-fraud', label: 'Scam or fraud', hint: 'Tricks to take money, accounts, or data' },
  { id: 'other-illegal', label: 'Something else illegal', hint: 'Content that breaks another law' },
];

const field =
  'w-full rounded-xl bg-surface px-3.5 py-3 text-[15px] outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ink';

/**
 * Notice of illegal content (task P1-14, EU Digital Services Act article 16): anyone can send
 * one, with or without an account. Linked from the Report tab in every place and from the
 * website footer. For rule-breaking that is not illegal, players use Report inside the place.
 */
export function NoticeForm({
  context,
  initialLocation = '',
  onClose,
}: {
  context?: ReportContext;
  initialLocation?: string;
  onClose?: () => void;
}) {
  const [location, setLocation] = useState(context ? noticeLocation(context) : initialLocation.slice(0, 500));
  const locationEdited = useRef(false);
  useEffect(() => {
    if (context && !locationEdited.current) setLocation(noticeLocation(context));
  }, [context]);
  const [category, setCategory] = useState<NoticeCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ reference: string; token: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const anonymousAllowed = category === 'child-safety';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!category) {
      setError('Choose what kind of illegal content it is.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    // Clear, specific messages before sending (the server checks the same rules).
    const problem =
      text('location').length < 3
        ? 'Add a link or the exact name of the content under "Where is it?".'
        : text('explanation').length < 20
          ? 'Explain why it is illegal in at least 20 characters.'
          : !anonymousAllowed && !text('name')
            ? 'Add your name. It is needed for this kind of notice.'
            : !anonymousAllowed && !text('email')
              ? 'Add your email so we can tell you the decision.'
              : text('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text('email'))
                ? 'Check your email address.'
                : form.get('goodFaith') !== 'on'
                  ? 'Confirm that the notice is accurate and complete.'
                  : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: failed } = await api.POST('/v1/notices', {
        body: {
          category,
          location: text('location'),
          explanation: text('explanation'),
          ...(text('name') ? { reporterName: text('name') } : {}),
          ...(text('email') ? { reporterEmail: text('email') } : {}),
          goodFaith: form.get('goodFaith') === 'on',
        } as never,
      });
      if (data) setSent(data);
      else setError(errorMessage(failed, 'Check the fields and try again.'));
    } catch {
      setError('Could not send the notice. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const statusLink = `/report-illegal-content/status?ref=${sent.reference}&token=${encodeURIComponent(sent.token)}`;
    return (
      <div className="flex flex-col gap-5">
        <CircleCheck className="size-10" strokeWidth={1.75} aria-hidden />
        <h1 className="text-3xl font-black tracking-tight">We received your notice</h1>
        <p className="max-w-prose text-ink/70">
          Your reference is <strong className="font-black text-ink">{sent.reference}</strong>. Our safety team
          reviews every notice, child safety first, and decides what happens to the content.
        </p>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-ink/10">
          <p className="text-sm font-bold">Keep this link to see the decision</p>
          <Link
            href={statusLink}
            onClick={
              onClose
                ? async (event) => {
                    event.preventDefault();
                    setStatus('Checking notice status…');
                    try {
                      const { data } = await api.GET('/v1/notices/{reference}', {
                        params: { path: { reference: sent.reference }, query: { token: sent.token } },
                      });
                      setStatus(
                        data
                          ? `Status: ${data.status}${data.decision ? ` — ${data.decision}` : ''}`
                          : 'Could not check the notice. Try again.',
                      );
                    } catch {
                      setStatus('Could not check the notice. Try again.');
                    }
                  }
                : undefined
            }
            className="mt-1 block break-all text-sm text-ink/70 underline"
          >
            {typeof window === 'undefined' ? statusLink : `${window.location.origin}${statusLink}`}
          </Link>
          {status ? (
            <p className="mt-3 text-sm" aria-live="polite">
              {status}
            </p>
          ) : null}
        </div>
        <Link
          href="/"
          onClick={
            onClose
              ? (event) => {
                  event.preventDefault();
                  onClose();
                }
              : undefined
          }
          className="self-start text-sm font-bold underline"
        >
          Return to where you were
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-7" noValidate>
      <div className="flex flex-col gap-3">
        <ShieldAlert className="size-9" strokeWidth={1.75} aria-hidden />
        <h1 className="text-3xl leading-tight font-black tracking-tight sm:text-4xl">
          Report illegal content
        </h1>
        <p className="max-w-prose text-ink/70">
          Use this form for content on Genvr that breaks the law. You do not need an account. For rude players
          or content that only breaks our rules, use Report inside the place instead.
        </p>
      </div>

      {context ? (
        <section
          aria-label="Report context"
          className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-ink/10"
        >
          <p className="font-bold">
            {context.title ??
              (context.kind === 'place'
                ? 'This place or game'
                : context.kind === 'item'
                  ? 'This item'
                  : 'This page')}
          </p>
          {context.creator ? <p>by {context.creator}</p> : null}
          <p className="mt-2 break-all text-ink/60">{context.sourcePath}</p>
          <p className="mt-2 text-ink/60">
            The location below is filled in. Add what happened; nothing is sent until you choose Send notice.
          </p>
        </section>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-extrabold">What kind of illegal content is it?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-xl px-3.5 py-3 ring-1 transition-colors ${
                category === entry.id
                  ? 'bg-ink text-on-brand ring-ink'
                  : 'bg-surface ring-ink/10 hover:ring-ink/30'
              }`}
            >
              <input
                type="radio"
                name="category"
                value={entry.id}
                checked={category === entry.id}
                onChange={() => setCategory(entry.id)}
                className="sr-only"
              />
              <span className="text-sm font-extrabold">{entry.label}</span>
              <span className={`text-xs ${category === entry.id ? 'opacity-75' : 'text-ink/55'}`}>
                {entry.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-extrabold">Where is it?</span>
        <span className="text-sm text-ink/60">A link to the place, item, or profile, or its exact name.</span>
        <textarea
          name="location"
          rows={4}
          required
          minLength={3}
          maxLength={500}
          value={location}
          onChange={(event) => {
            locationEdited.current = true;
            setLocation(event.target.value);
          }}
          placeholder="https://genvr.net/places/…"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-extrabold">Why is it illegal?</span>
        <span className="text-sm text-ink/60">
          Describe what you saw and where exactly (for example near the start, on a sign, in the chat).
        </span>
        <textarea
          name="explanation"
          required
          minLength={20}
          maxLength={4000}
          rows={5}
          className={`${field} resize-y`}
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px] font-extrabold">
          Your name and email{anonymousAllowed ? ' (optional for child safety)' : ''}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            maxLength={100}
            placeholder="Name"
            autoComplete="name"
            className={field}
            aria-label="Name"
          />
          <input
            name="email"
            type="email"
            maxLength={200}
            placeholder="Email"
            autoComplete="email"
            className={field}
            aria-label="Email"
          />
        </div>
        <p className="text-sm text-ink/60">
          We use them only to handle this notice and tell you the decision.
        </p>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="goodFaith" required className="mt-1 size-4 accent-[var(--color-ink)]" />
        <span className="text-sm">
          I believe in good faith that the information in this notice is accurate and complete.
        </span>
      </label>

      <ErrorNote message={error} />
      <Button type="submit" disabled={busy} className="self-start px-6 py-3">
        {busy ? 'Sending…' : 'Send notice'}
      </Button>
    </form>
  );
}
