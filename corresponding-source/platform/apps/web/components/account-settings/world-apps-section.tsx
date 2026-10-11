'use client';
import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/api';
import { Button, Card, ErrorNote, Loading } from '../ui';
type Grant = { id: string; clientName: string; scopes: string[]; expiresAt: string; revokedAt: string | null };
export function WorldAppsSection() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const load = async (targetPage = page) => {
    const response = await fetch(`${API_URL}/v1/me/world-apps?page=${targetPage}`, { credentials: 'include' });
    const body = await response.json(); if (!response.ok) throw new Error(body.message ?? 'Unable to load linked apps.');
    setGrants(body.grants);
    setPage(targetPage); setNextPage(body.nextPage);
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  const revoke = async (id: string) => {
    setBusy(id); setError(null);
    try {
      const response = await fetch(`${API_URL}/v1/me/world-apps/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Unable to disconnect app.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to disconnect app.'); }
    finally { setBusy(null); }
  };
  return <Card><div className="space-y-4"><h3 className="text-xl font-bold">World apps</h3>
    <p>Apps you allowed to save worlds or submit creations to your Genvr account.</p>
    <ErrorNote message={error} />
    {!grants && !error ? <Loading /> : null}
    {grants?.length === 0 ? <p>No linked world apps.</p> : null}
    {grants?.map(grant => <div key={grant.id} className="space-y-2 rounded-xl border border-ink/10 p-4">
      <p className="break-words font-bold">{grant.clientName}</p>
      <p className="break-words text-sm">{grant.scopes.join(', ')}</p>
      <p className="text-sm">{grant.revokedAt ? 'Disconnected' : Date.parse(grant.expiresAt) <= Date.now() ? 'Expired' : `Expires ${new Date(grant.expiresAt).toLocaleDateString()}`}</p>
      {!grant.revokedAt && Date.parse(grant.expiresAt) > Date.now() ? <Button disabled={busy !== null} onClick={() => void revoke(grant.id)}>Disconnect</Button> : null}
    </div>)}
    <div className="flex flex-wrap gap-3">
      {page > 0 ? <Button disabled={busy !== null} onClick={() => void load(page - 1).catch(e => setError(e.message))}>Previous apps</Button> : null}
      {nextPage !== null ? <Button disabled={busy !== null} onClick={() => void load(nextPage).catch(e => setError(e.message))}>More apps</Button> : null}
    </div>
  </div></Card>;
}
