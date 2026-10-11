'use client';

import { ImagePlus, Trash } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';

type Picture = {
  id: string;
  kind: 'thumbnail' | 'screenshot';
  url: string;
  status: string;
  position: number;
};

const MAX_SCREENSHOTS = 5;
/** Pictures are shrunk to this width at most before upload (16:9 place cards and pages). */
const MAX_WIDTH = 1920;

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Waiting for review', className: 'bg-ink/70 text-on-brand' },
  approved: { label: 'Shown to players', className: 'bg-mint text-on-brand' },
  rejected: { label: 'Not approved', className: 'bg-coral text-on-brand' },
};

/** Shrinks a picture in the browser and returns it as base64 WebP (JPEG where WebP is missing). */
async function prepare(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf(',') + 1);
}

/**
 * Place settings, Pictures: the thumbnail on place cards and up to five screenshots on the place
 * page. Every picture waits for review before players see it (kids first).
 */
export function PlacePictures({ placeId }: { placeId: string }) {
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [busy, setBusy] = useState<'thumbnail' | 'screenshot' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const kind = useRef<'thumbnail' | 'screenshot'>('thumbnail');

  const load = useCallback(async () => {
    const { data } = await api.GET('/v1/experiences/{id}/images', { params: { path: { id: placeId } } });
    if (data) setPictures(data.items);
  }, [placeId]);
  useEffect(() => {
    void load();
  }, [load]);

  const choose = (which: 'thumbnail' | 'screenshot') => {
    kind.current = which;
    input.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(kind.current);
    try {
      const data = await prepare(file);
      const { error: failed } = await api.POST('/v1/experiences/{id}/images', {
        params: { path: { id: placeId } },
        body: { kind: kind.current, data },
      });
      if (failed) setError(errorMessage(failed));
      await load();
    } catch {
      setError('That file is not a picture this browser can open.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    const { error: failed } = await api.DELETE('/v1/experiences/{id}/images/{imageId}', {
      params: { path: { id: placeId, imageId: id } },
    });
    if (failed) setError(errorMessage(failed));
    await load();
  };

  const thumbnail = pictures.find((picture) => picture.kind === 'thumbnail');
  const screenshots = pictures.filter((picture) => picture.kind === 'screenshot');

  const card = (picture: Picture, large = false) => (
    <figure
      key={picture.id}
      className={`group relative overflow-hidden rounded-2xl bg-paper ${large ? 'aspect-video w-full max-w-md' : 'aspect-video'}`}
    >
      <img
        src={picture.url}
        alt={picture.kind === 'thumbnail' ? 'Thumbnail' : 'Screenshot'}
        className="size-full object-cover"
      />
      <span
        className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[picture.status]?.className ?? ''}`}
      >
        {STATUS[picture.status]?.label ?? picture.status}
      </span>
      <button
        type="button"
        onClick={() => void remove(picture.id)}
        aria-label="Remove picture"
        title="Remove"
        className="absolute top-2 right-2 rounded-lg bg-surface/90 p-1.5 text-coral hover:bg-surface"
      >
        <Trash className="size-4" aria-hidden />
      </button>
    </figure>
  );

  const addButton = (which: 'thumbnail' | 'screenshot', label: string) => (
    <button
      type="button"
      onClick={() => choose(which)}
      disabled={busy !== null}
      className="flex aspect-video w-full max-w-md flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 text-sm font-bold text-ink/60 hover:border-ink/30 hover:text-ink disabled:opacity-50"
    >
      <ImagePlus className="size-6" aria-hidden />
      {busy === which ? 'Uploading…' : label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
      ) : null}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">Thumbnail</h4>
        <p className="text-sm text-ink/60">Shown on place cards. A wide picture (16:9) looks best.</p>
        {thumbnail ? card(thumbnail, true) : addButton('thumbnail', 'Add a thumbnail')}
        {thumbnail ? (
          <button
            type="button"
            onClick={() => choose('thumbnail')}
            disabled={busy !== null}
            className="self-start text-sm font-bold text-ink/70 underline hover:text-ink"
          >
            {busy === 'thumbnail' ? 'Uploading…' : 'Replace thumbnail'}
          </button>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">
          Screenshots ({screenshots.length} of {MAX_SCREENSHOTS})
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {screenshots.map((picture) => card(picture))}
          {screenshots.length < MAX_SCREENSHOTS ? addButton('screenshot', 'Add a screenshot') : null}
        </div>
      </section>
      <p className="text-xs text-ink/50">
        Every picture is checked before players see it. Pictures must be from your place and safe for kids.
      </p>
    </div>
  );
}
