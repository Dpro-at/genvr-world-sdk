'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { API_URL } from '../../lib/api';
import { Badge, Button, Card, ErrorNote, Loading } from '../ui';

type Token = {
  id: string;
  name: string;
  client: string;
  prefix: string;
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

const field =
  'rounded-xl border-2 border-ink/10 bg-surface px-4 py-3 font-normal outline-none focus:border-brand';
const day = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * MCP in Settings (owner N-125): the address an AI tool (Claude Code, Codex ...) connects to, and the creator's
 * tokens for it: create (shown once), see when each was last used, revoke. The server offers tokens only where
 * MCP is on; elsewhere the section says so.
 */
export function McpSection() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`${API_URL}/v1/me/mcp-tokens`, { credentials: 'include' });
    if (response.status === 404) {
      setAvailable(false);
      setTokens([]);
      return;
    }
    const body = (await response.json().catch(() => null)) as { tokens?: Token[] } | null;
    setTokens(body?.tokens ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    setCopied(false);
    const response = await fetch(`${API_URL}/v1/me/mcp-tokens`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: String(form.get('name') ?? ''),
        client: String(form.get('client') ?? ''),
        days: Number(form.get('days') ?? 30),
      }),
    });
    const body = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
    if (!response.ok || !body?.token) setError(body?.message ?? 'Could not create the token.');
    else {
      setCreated(body.token);
      formElement.reset();
    }
    await load();
    setBusy(false);
  };

  const revoke = async (id: string) => {
    setBusy(true);
    const response = await fetch(`${API_URL}/v1/me/mcp-tokens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) setError('Could not revoke the token.');
    await load();
    setBusy(false);
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setError('Copy did not work; select the token and copy it by hand.');
    }
  };

  if (!tokens) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="mb-1 text-lg font-extrabold">Connect an AI tool</h3>
        <p className="mb-3 text-sm text-ink/60">
          Tools such as Claude Code or Codex can build in your places through Genvr&apos;s MCP server. Give
          the tool this address and one of your tokens.
        </p>
        <code className="block overflow-x-auto rounded-xl bg-ink/5 px-4 py-3 text-sm">{API_URL}/mcp</code>
      </Card>

      {!available ? (
        <Card>
          <Badge tone="warn">Not open on this server yet</Badge>
          <p className="mt-3 text-sm text-ink/60">
            MCP tokens come with the public MCP sign-in. Until then they work only on development servers.
          </p>
        </Card>
      ) : (
        <Card>
          <h3 className="mb-3 text-lg font-extrabold">Your tokens</h3>
          {created ? (
            <div role="status" className="mb-4 rounded-xl bg-mint/15 p-4 text-sm">
              <p className="mb-2 font-bold text-mint">
                New token. It is shown only now; copy it into your tool.
              </p>
              <code className="block overflow-x-auto rounded-lg bg-surface px-3 py-2">{created}</code>
              <Button variant="secondary" className="mt-3 px-4! py-2!" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          ) : null}
          {tokens.length === 0 ? (
            <p className="mb-4 text-sm text-ink/60">No tokens yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col divide-y divide-ink/5">
              {tokens.map((token) => (
                <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">
                      {token.name} <span className="font-normal text-ink/50">({token.client})</span>
                    </p>
                    <p className="text-xs text-ink/50">
                      {token.prefix}… · ends {day(token.expiresAt)} ·{' '}
                      {token.lastUsedAt ? `last used ${day(token.lastUsedAt)}` : 'never used'}
                    </p>
                  </div>
                  {token.revokedAt ? (
                    <Badge>Revoked</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      className="px-3! py-2!"
                      disabled={busy}
                      onClick={() => revoke(token.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Name
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Claude Code at home"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Tool
              <input name="client" required maxLength={60} placeholder="claude-code" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Days
              <select name="days" defaultValue="30" className={field}>
                <option value="7">7</option>
                <option value="30">30</option>
                <option value="90">90</option>
              </select>
            </label>
            <Button type="submit" disabled={busy}>
              New token
            </Button>
          </form>
          <div className="mt-3">
            <ErrorNote message={error} />
          </div>
        </Card>
      )}
    </div>
  );
}
