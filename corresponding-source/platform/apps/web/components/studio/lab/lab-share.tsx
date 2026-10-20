'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Clock, Globe, Lock, Share2, X } from 'lucide-react';
import { MOTION_SHARE_LICENCE } from '@genvr/contracts';
import { PERSON, type LabController, type MotionShareStatus } from '../../../lib/motion-lab';

/**
 * Board M14 — share a motion with the GenVR community. Every version is private on this device first; the dialog opens
 * after "Save as version" (or from My motions): similar motions we already have (keep yours / use the library one),
 * then name, description, tags, preview, score, rights checks and the licence. Sharing publishes, so the owner presses
 * "Share with the community" for each one; an agent's `share_prepare` only fills it in. Stop sharing any time.
 */
const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const STATUS: Record<MotionShareStatus, { short: string; text: string; className: string; icon: typeof Lock }> = {
  private: { short: 'Private', text: 'Private · only on this device', className: 'bg-ink/10 text-ink/70', icon: Lock },
  pending: { short: 'Waiting for your OK', text: 'Waiting for your OK to share', className: 'bg-amber-500/15 text-amber-700', icon: Clock },
  shared: { short: 'Shared', text: 'Shared with the community', className: 'bg-emerald-500/15 text-emerald-700', icon: Globe },
  blocked: { short: 'Cannot be shared', text: 'Cannot be shared (rights)', className: 'bg-coral/15 text-coral', icon: Ban },
};
const message = (e: unknown) => (e instanceof Error ? e.message.split('\n')[0]! : String(e));

export function StatusChip({ status, local }: { status: MotionShareStatus; local?: boolean }) {
  const s = STATUS[status], Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${s.className}`} title={s.text}><Icon className="size-3" />{status === 'shared' && local ? 'Shared · local preview' : s.short}</span>;
}

/** My motions (all versions of every move) with their share state; a prepared share from an agent asks for review. */
export function MyMotions({ lab, open }: { lab: LabController; open: (version: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const mine = lab.mine();
  const asks = mine.filter((m) => m.status === 'pending' && m.share && m.share.prepared_by !== 'you');
  return (
    <section aria-label="My motions" className="flex flex-col gap-1.5">
      <span className={`${label} mt-2`}>My motions · {mine.length}</span>
      {asks.map((m) => (
        <div key={m.version} role="status" className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs">
          <span className="flex-1">{m.share!.prepared_by} prepared <b>{m.share!.name}</b> to share. It waits for your OK.</span>
          <button type="button" className="rounded bg-ink px-2 py-1 font-bold text-on-brand" onClick={() => open(m.version)}>Review</button>
        </div>
      ))}
      {mine.length === 0 ? <p className="text-xs text-ink/50">No motions yet: run, then Save as version. New versions stay on this device until you share them.</p> : null}
      <ul className="flex flex-col gap-0.5">
        {mine.map((m) => (
          <li key={m.version} className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-ink/5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{m.share && m.share.state !== 'stopped' ? m.share.name : `${m.motion} v${m.n}`}{m.best ? ' · best' : ''}</div>
              <StatusChip status={m.status} local={m.share?.where === 'local-preview'} />
            </div>
            <b className="font-mono tabular-nums">{m.score}</b>
            {m.status === 'shared' ? (
              <button type="button" className="rounded px-1.5 py-1 font-bold hover:bg-ink/10" onClick={() => { if (window.confirm(`Stop sharing "${m.share!.name}"?`)) lab.unshare(m.version).then(() => setError(null), (e) => setError(message(e))); }}>Stop sharing</button>
            ) : (
              <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 font-bold hover:bg-ink/10" title={m.status === 'blocked' ? m.blocked.join(' ') : 'Share with the GenVR community'} onClick={() => open(m.version)}><Share2 className="size-3.5" />{m.status === 'pending' ? 'Review' : 'Share…'}</button>
            )}
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{error}</p> : null}
    </section>
  );
}

export function ShareMotionDialog({ lab, version, close }: { lab: LabController; version: string; close: () => void }) {
  const v = lab.versionById(version);
  const share = lab.shareOf(version);
  const live = share && share.state !== 'stopped' ? share : undefined;
  const rights = lab.rights(version);
  const similar = useMemo(() => lab.similar(version), [lab, version]);
  const [step, setStep] = useState<1 | 2>(similar.length && !live ? 1 : 2);
  const [name, setName] = useState(live?.name ?? (v.note || `${v.motion} · ${v.settings.speed} m/s`));
  const [description, setDescription] = useState(live?.description ?? '');
  const [tags, setTags] = useState((live?.tags ?? [v.motion.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'robot']).join(', '));
  const [preview, setPreview] = useState(live?.preview_s ?? 4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [close]);
  const tagList = tags.split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const blocked = rights.reasons.length > 0;
  const local = lab.publishing === 'local-preview';
  const shareNow = async () => {
    setBusy(true);
    try {
      const draft = { name, description, tags: tagList, preview_s: preview };
      const same = live?.state === 'pending' && live.name === name && live.description === description && live.tags.join(',') === tagList.join(',') && live.preview_s === preview;
      if (!same) lab.prepareShare(version, draft, PERSON);
      await lab.share(version, PERSON);
      close();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const checks: Array<[boolean, string]> = [
    [rights.made_here, `Made in this lab${v.by === 'agent' ? ' (by your agent)' : ' by you'}`],
    [rights.not_mixamo, 'Made from a GenVR library move, not from a Mixamo move'],
    [rights.video_rights, 'No source video (or you own its rights)'],
    [rights.passes_course, `Passes the course: score ${v.score.total}${v.score.fell ? ', falls' : ', no fall'}`],
  ];
  const field = 'w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Share a motion" className="flex max-h-[90vh] w-[min(34rem,100%)] flex-col gap-3 overflow-y-auto rounded-xl border border-ink/15 bg-surface p-4 text-ink shadow-xl">
        <div className="flex items-start gap-2">
          <div className="flex-1"><div className={label}>{step === 1 ? 'Step 1 · saved' : 'Step 2 · share with the GenVR community?'}</div>
            <b className="text-sm">{v.motion} v{v.n} · {v.id}</b></div>
          <button type="button" aria-label="Close" className="rounded p-1 hover:bg-ink/10" onClick={close}><X className="size-4" /></button>
        </div>
        {step === 1 ? (
          <>
            <p className="rounded-lg bg-ink/5 p-2 text-xs"><Lock className="mr-1 inline size-3.5" /><b>Saved privately in My motions.</b> Only on this device. Nothing leaves it until you share.</p>
            <div className={label}>Similar motions we already have</div>
            <ul className="flex flex-col gap-1">
              {similar.map((s) => (
                <li key={`${s.source}-${s.name}`} className="rounded-lg border border-ink/10 p-2 text-xs">
                  <div className="flex items-center gap-2"><b className="flex-1">{s.name} · {s.source === 'library' ? 'library' : 'yours, shared'}</b><span className="font-mono font-bold">{s.alike}% alike</span></div>
                  <p className="text-ink/60">{s.note}</p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-ink/50">Alike by pace, stride, lean and step height (not pose by pose yet).</p>
            <div className="flex flex-wrap justify-end gap-2">
              {similar[0]?.source === 'library' ? <button type="button" className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold hover:bg-ink/5" onClick={() => { try { lab.useLibraryMove(version); close(); } catch (e) { setError(message(e)); } }}>Use library one</button> : null}
              <button type="button" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-on-brand" onClick={() => setStep(2)}>Keep yours</button>
            </div>
          </>
        ) : (
          <>
            {live?.state === 'pending' && live.prepared_by !== 'you' ? <p role="status" className="rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs">Prepared by your agent <b>{live.prepared_by}</b> · waits for your OK</p> : null}
            {live?.state === 'shared' ? <p role="status" className="rounded-lg bg-emerald-500/15 px-2 py-1.5 text-xs">Shared{live.where === 'local-preview' ? ' as a local preview (nothing was published)' : ''}. Stop sharing it in My motions.</p> : null}
            <label className="flex flex-col gap-1 text-xs"><span className={label}>Name</span><input className={field} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-xs"><span className={label}>Description</span><textarea className={`${field} min-h-16`} maxLength={400} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does, what it was tuned for" /></label>
            <label className="flex flex-col gap-1 text-xs"><span className={label}>Tags (comma between)</span><input className={field} value={tags} onChange={(e) => setTags(e.target.value)} />
              <span className="flex flex-wrap gap-1">{tagList.slice(0, 8).map((t) => <span key={t} className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px]">{t}</span>)}</span></label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-ink/10 p-2"><div className={label}>Made on</div><b>{v.settings.character === 'robot' ? 'Standard robot' : v.settings.character}</b></div>
              <div className="rounded-lg border border-ink/10 p-2"><div className={label}>Score</div><b className="font-mono">{v.score.total}</b></div>
              <label className="rounded-lg border border-ink/10 p-2"><div className={label}>Preview</div>
                <select className="bg-transparent font-bold outline-none" value={preview} onChange={(e) => setPreview(Number(e.target.value))}>{[2, 3, 4, 6, 8, 10].map((s) => <option key={s} value={s}>{s} s</option>)}</select></label>
            </div>
            <p className="text-[11px] text-ink/50">The preview clip is the first {preview} s of this version's run ({v.run}), replayed from its course and settings.</p>
            <div className={label}>Checks before sharing</div>
            <ul className="flex flex-col gap-1 text-xs">
              {checks.map(([ok, text]) => <li key={text} className={`flex items-center gap-2 ${ok ? '' : 'font-semibold text-coral'}`}>{ok ? <Check className="size-3.5 text-emerald-600" /> : <Ban className="size-3.5" />}{text}</li>)}
            </ul>
            <div className="rounded-lg border border-ink/10 bg-paper p-2 text-xs"><div className={label}>Licence</div><b>{MOTION_SHARE_LICENCE.name}</b><p className="text-ink/70">{MOTION_SHARE_LICENCE.text}</p></div>
            {local && !blocked ? <p className="rounded-lg border border-ink/15 bg-paper p-2 text-xs text-ink/70">Local preview. Publishing to the GenVR community needs GenVR hosting; without it the motion is only marked shared on this device and nothing leaves it.</p> : null}
            {error ? <p role="alert" className="rounded-lg bg-coral/15 px-2 py-1.5 text-xs font-semibold text-coral">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold hover:bg-ink/5" onClick={() => { if (live?.state === 'pending') void lab.unshare(version).catch(() => {}); close(); }}>Keep private</button>
              <button type="button" disabled={blocked || busy || !name.trim() || live?.state === 'shared'} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-on-brand disabled:opacity-40" onClick={() => void shareNow()}><Share2 className="size-3.5" />Share with the community</button>
            </div>
            <p className="text-[11px] text-ink/50">You can stop sharing any time (My motions › Stop sharing).</p>
          </>
        )}
      </div>
    </div>
  );
}
