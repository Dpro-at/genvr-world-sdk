'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { API_URL } from '../../lib/api';
import { Badge, Button, Card, ErrorNote, Loading } from '../ui';

type Channel = { id: string; title: string };
type Account = { available: boolean; channels: Channel[] };
type Sent = { progress: number; videoId: string | null };

/** What the API's consent answer (`?youtube=`) means for the creator. */
const RESULTS: Record<string, { tone: 'good' | 'error'; text: string }> = {
  connected: { tone: 'good', text: 'Your YouTube channel is linked.' },
  cancelled: { tone: 'error', text: 'Linking was cancelled.' },
  no_channel: {
    tone: 'error',
    text: 'This Google account has no YouTube channel yet. Create one on YouTube, then link it here.',
  },
  error: { tone: 'error', text: 'Linking did not work. Please try again.' },
};

const field =
  'rounded-xl border-2 border-ink/10 bg-surface px-4 py-3 font-normal outline-none focus:border-brand';

async function readAccount(): Promise<Account | null> {
  const response = await fetch(`${API_URL}/v1/youtube/account`, { credentials: 'include' });
  return response.ok ? ((await response.json()) as Account) : null;
}

/** Sends the film straight to YouTube's upload address, reporting progress; resolves with the new video id. */
function sendFilm(
  uploadUrl: string,
  file: File,
  onProgress: (share: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve((JSON.parse(request.responseText) as { id?: string }).id ?? null);
        } catch {
          resolve(null);
        }
      } else reject(new Error(`YouTube answered ${request.status}.`));
    };
    request.onerror = () => reject(new Error('The upload stopped. Check the connection and try again.'));
    request.send(file);
  });
}

/**
 * Linked YouTube channels in Settings (owner N-120, N-125, N-132): link one or more channels, then publish films to
 * the chosen one (FILM-13, FILM-13b). Linking is a separate Google consent for YouTube only; signing in to Genvr
 * never asks for it. Google asks which account and channel on every link, so each link adds one channel.
 */
export function YoutubeSection() {
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'error'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    readAccount().then(setAccount);
    const params = new URLSearchParams(window.location.search);
    const result = params.get('youtube');
    if (result) {
      setNotice(RESULTS[result] ?? RESULTS.error!);
      params.delete('youtube');
      const rest = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
      );
    }
  }, []);

  const link = () => {
    const back = `${window.location.origin}/settings#accounts`;
    window.location.href = `${API_URL}/v1/youtube/connect?back=${encodeURIComponent(back)}`;
  };

  const unlink = async (channel: Channel) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`${API_URL}/v1/youtube/channels/${encodeURIComponent(channel.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) setError('Could not unlink the channel. Please try again.');
    const next = await readAccount();
    if (next) setAccount(next);
    setNotice(null);
    setBusy(false);
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('film');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose the film file first.');
      return;
    }
    setError(null);
    setBusy(true);
    setSent({ progress: 0, videoId: null });
    try {
      const response = await fetch(`${API_URL}/v1/youtube/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId: String(form.get('channel') ?? '') || undefined,
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? ''),
          tags: String(form.get('tags') ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          privacy: String(form.get('privacy') ?? 'private'),
          madeForKids: form.get('madeForKids') === 'yes',
          size: file.size,
          contentType: file.type || 'video/mp4',
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        uploadUrl?: string;
        message?: string;
      } | null;
      if (!response.ok || !body?.uploadUrl) throw new Error(body?.message ?? 'YouTube refused the upload.');
      const videoId = await sendFilm(body.uploadUrl, file, (progress) =>
        setSent({ progress, videoId: null }),
      );
      setSent({ progress: 1, videoId });
    } catch (failure) {
      setSent(null);
      setError(failure instanceof Error ? failure.message : 'The upload did not work.');
    }
    setBusy(false);
  };

  if (!account) return <Loading />;
  const { channels } = account;

  return (
    <div>
      {notice ? (
        <p
          role="status"
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            notice.tone === 'good' ? 'bg-mint/15 text-mint' : 'bg-coral/10 text-coral'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="size-10 text-[#ff0000]" aria-hidden>
              <path
                fill="currentColor"
                d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z"
              />
            </svg>
            <div>
              <h2 className="text-xl font-extrabold">YouTube</h2>
              <p className="text-ink/60">
                {channels.length === 0
                  ? 'Not linked'
                  : channels.length === 1
                    ? '1 channel linked'
                    : `${channels.length} channels linked`}
              </p>
            </div>
          </div>
          {!account.available ? (
            <Badge tone="warn">Not set up on this server yet</Badge>
          ) : (
            <Button variant={channels.length ? 'secondary' : 'primary'} disabled={busy} onClick={link}>
              {channels.length ? 'Link another channel' : 'Link YouTube'}
            </Button>
          )}
        </div>
        {channels.length ? (
          <ul className="mt-5 divide-y divide-ink/10 border-t border-ink/10">
            {channels.map((channel) => (
              <li key={channel.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate font-bold">{channel.title}</span>
                <Button variant="ghost" disabled={busy} onClick={() => unlink(channel)}>
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {channels.length ? (
        <Card>
          <h2 className="mb-1 text-xl font-extrabold">Publish a film</h2>
          <p className="mb-5 text-sm text-ink/60">
            Export your film from the Filming editor, then choose the file here.
          </p>
          <form onSubmit={publish} className="flex flex-col gap-4">
            {channels.length > 1 ? (
              <label className="flex flex-col gap-1 font-bold">
                Channel
                <select name="channel" required defaultValue={channels[0]!.id} className={field}>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="channel" value={channels[0]!.id} />
            )}
            <label className="flex flex-col gap-1 font-bold">
              Film file
              <input name="film" type="file" accept="video/*" required className={field} />
            </label>
            <label className="flex flex-col gap-1 font-bold">
              Title
              <input name="title" required maxLength={100} className={field} />
            </label>
            <label className="flex flex-col gap-1 font-bold">
              Description
              <textarea name="description" rows={4} maxLength={5000} className={field} />
            </label>
            <label className="flex flex-col gap-1 font-bold">
              Tags (comma separated)
              <input name="tags" className={field} placeholder="genvr, adventure" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-bold">
                Who can watch
                <select name="privacy" defaultValue="private" className={field}>
                  <option value="private">Only me (private)</option>
                  <option value="unlisted">Anyone with the link</option>
                  <option value="public">Everyone (public)</option>
                </select>
              </label>
              <fieldset className="flex flex-col gap-1 font-bold">
                <legend>Made for kids?</legend>
                <div className="flex gap-4 py-3 font-normal">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="madeForKids" value="yes" required /> Yes
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="madeForKids" value="no" required /> No
                  </label>
                </div>
              </fieldset>
            </div>
            <Button type="submit" disabled={busy}>
              Publish to YouTube
            </Button>
            {sent ? (
              sent.progress < 1 ? (
                <div role="status" className="flex flex-col gap-2">
                  <div className="h-3 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full bg-brand transition-[width]"
                      style={{ width: `${Math.round(sent.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-sm text-ink/60">Uploading… {Math.round(sent.progress * 100)}%</p>
                </div>
              ) : (
                <p role="status" className="rounded-xl bg-mint/15 px-4 py-3 text-sm font-semibold text-mint">
                  Uploaded. YouTube is processing it now.{' '}
                  {sent.videoId ? (
                    <a
                      className="underline"
                      href={`https://www.youtube.com/watch?v=${sent.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open on YouTube
                    </a>
                  ) : null}
                </p>
              )
            ) : null}
            <ErrorNote message={error} />
          </form>
        </Card>
      ) : null}
    </div>
  );
}
