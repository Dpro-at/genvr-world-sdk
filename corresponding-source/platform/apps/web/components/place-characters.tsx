'use client';

import type { BodyId } from '@genvr/contracts';
import { Check, Clock, Upload, UserRound, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';

type MyBody = {
  id: string;
  name: string;
  use: 'place' | 'store';
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'removed';
};

/** Largest file the API takes (32 MB). */
const MAX_BYTES = 32 * 1024 * 1024;

/** A body the place may use now: the creator's own place-only body, or their store body once approved. */
const usable = (body: MyBody) =>
  body.use === 'place' ? body.status !== 'removed' : body.status === 'approved';

const STATE: Record<MyBody['status'], string> = {
  draft: 'Your places only',
  in_review: 'Waiting for review',
  approved: 'In the store',
  rejected: 'Not accepted',
  removed: 'Removed',
};

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * The place owner's own characters (uploaded bodies, 2026-10-03), in Place settings > Avatars: upload a rigged
 * character (GLB with Mixamo bone names, T-pose) for your own places or for the store, and choose one for everyone
 * here. A character for your places is yours at once; one for the store is reviewed first.
 */
export function PlaceCharacters({
  selected,
  onChoose,
}: {
  selected: BodyId | 'any';
  onChoose: (id: BodyId) => void;
}) {
  const [bodies, setBodies] = useState<MyBody[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [use, setUse] = useState<'place' | 'store'>('place');
  const [mayUse, setMayUse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  /** A new file field after each upload, so the chosen file's name does not stay in it. */
  const [field, setField] = useState(0);

  const load = useCallback(async () => {
    const { data } = await api.GET('/v1/me/bodies');
    setBodies(data?.bodies ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || busy) return;
    if (file.size > MAX_BYTES) {
      setNote({ text: 'The file is bigger than 32 MB.', bad: true });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const model = await base64(file);
      const { data, error } = await api.POST('/v1/bodies', {
        body: { name: name.trim() || file.name.replace(/\.glb$/i, ''), use, mayUse, model },
      });
      if (!data) throw new Error(errorMessage(error));
      setFile(null);
      setField((n) => n + 1);
      setName('');
      setMayUse(false);
      setNote({
        text:
          use === 'place'
            ? 'Uploaded. Choose it below to make everyone here wear it.'
            : 'Uploaded. It shows in the store once a moderator accepts it.',
        bad: false,
      });
      await load();
    } catch (failure) {
      setNote({ text: failure instanceof Error ? failure.message : 'The upload failed.', bad: true });
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3 sm:max-w-lg">
      <div>
        <h3 className="font-extrabold">Your characters</h3>
        <p className="text-xs text-ink/60">
          A rigged character (.glb, Mixamo bone names, standing in a T-pose). Mixamo&apos;s free auto-rigger
          can rig your own model.
        </p>
      </div>

      {bodies && bodies.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Your characters">
          {bodies.map((body) => {
            const on = selected === body.id;
            const ok = usable(body);
            const Icon =
              body.status === 'rejected' ? XCircle : body.status === 'in_review' ? Clock : UserRound;
            return (
              <li key={body.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-3 py-1.5">
                <Icon className="size-4 shrink-0 text-ink/60" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{body.name}</span>
                  <span className="block truncate text-[11px] text-ink/50">{STATE[body.status]}</span>
                </span>
                <button
                  type="button"
                  disabled={!ok || on}
                  onClick={() => onChoose(body.id as BodyId)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold disabled:opacity-40 ${
                    on ? 'bg-ink/10' : 'bg-ink text-on-brand'
                  }`}
                >
                  {on ? <Check className="size-3.5" aria-hidden /> : null}
                  {on ? 'Everyone wears it' : 'Use for everyone'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {note ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-bold ${note.bad ? 'bg-coral/15 text-coral' : 'bg-paper text-ink/70'}`}
        >
          {note.text}
        </p>
      ) : null}

      <form onSubmit={(event) => void upload(event)} className="flex flex-col gap-2 rounded-2xl bg-paper p-3">
        <input
          key={field}
          type="file"
          accept=".glb,model/gltf-binary"
          aria-label="Character file (.glb)"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Name of the character"
          aria-label="Name of the character"
          className="h-10 rounded-xl bg-surface px-3 text-sm"
        />
        <div role="radiogroup" aria-label="Where it may be used" className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['place', 'My places only', 'Yours at once. Any character you may use in a game.'],
              [
                'store',
                'In the store',
                'Reviewed first; then others can wear it. It must be yours to share.',
              ],
            ] as const
          ).map(([id, title, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={use === id}
              onClick={() => setUse(id)}
              className={`flex flex-col items-start gap-0.5 rounded-xl bg-surface px-2.5 py-2 text-left ${
                use === id ? 'ring-2 ring-ink' : ''
              }`}
            >
              <span className="text-xs font-bold">{title}</span>
              <span className="text-[11px] text-ink/60">{hint}</span>
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 text-xs text-ink/70">
          <input type="checkbox" checked={mayUse} onChange={(event) => setMayUse(event.target.checked)} />
          {use === 'place'
            ? 'I may use this character in my game.'
            : 'This character is mine, or I may share it with others.'}
        </label>
        <button
          type="submit"
          disabled={!file || !mayUse || busy}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-bold text-on-brand disabled:opacity-40"
        >
          <Upload className="size-4" aria-hidden />
          {busy ? 'Uploading…' : 'Upload character'}
        </button>
      </form>
    </div>
  );
}
