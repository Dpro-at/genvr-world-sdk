'use client';
import { useEffect, useState } from 'react';
import { Camera, Clapperboard, Film, SlidersHorizontal, X } from 'lucide-react';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { FilmingPanel } from '../filming-panel';
import { VideoEditor, VideoSceneInspector } from '../video-editor';

type Pane = 'timeline' | 'camera' | 'clip';
const PANES: { id: Pane; label: string; Icon: typeof Film }[] = [
  { id: 'timeline', label: 'Timeline', Icon: Film },
  { id: 'camera', label: 'Camera', Icon: Camera },
  { id: 'clip', label: 'Clip', Icon: SlidersHorizontal },
];

/**
 * Studio Filming on a phone (FILM-04b): the world or the monitors on top, one panel at a time below
 * (Timeline, Camera or Shots, Clip / Scene / Captions / Sound / Colour by workspace). The same
 * components and commands as the desktop Studio, so nothing behaves differently.
 */
export function PhoneFilming({ filming, onClose }: { filming: StudioFilming; onClose: () => void }) {
  const studio = filming.studio;
  const [pane, setPane] = useState<Pane>('timeline');
  useEffect(() => {
    studio.setOpen(true);
    return () => { studio.setPreviewing(false); studio.setOpen(false); };
  }, []);
  return <div role="dialog" aria-label="Filming" data-film-id="film.phone" className="absolute inset-0 z-40 flex flex-col text-ink">
    <div className="flex shrink-0 items-center gap-2 bg-surface/95 px-3 py-2 shadow">
      <Clapperboard className="size-4 text-brand" /><strong className="text-sm">Filming</strong>
      <span className="truncate text-[11px] text-ink/50">{studio.message}</span>
      <button className="ml-auto inline-flex size-8 items-center justify-center rounded-lg hover:bg-ink/10" aria-label="Close filming" data-film-id="film.phone.close"
        disabled={studio.rendering || filming.busy} onClick={onClose}><X className="size-5" /></button>
    </div>
    {/* The world shows through here while shooting; the monitors cover it in the other workspaces. */}
    <div id="genvr-film-stage" aria-hidden={!studio.previewing}
      className={`relative min-h-0 flex-1 ${studio.previewing ? 'bg-black' : 'pointer-events-none opacity-0'}`} />
    <div className="flex h-[48dvh] shrink-0 flex-col bg-surface landscape:h-[60dvh]">
      <div role="tablist" aria-label="Filming panel" className="flex shrink-0 border-b border-ink/10">
        {PANES.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={pane === id} data-film-id={`film.phone.${id}`}
          className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs font-bold ${pane === id ? 'border-b-2 border-brand text-ink' : 'text-ink/50'}`}
          onClick={() => setPane(id)}><Icon className="size-4" />{id === 'camera' && studio.workspace !== 'shoot' ? 'Shots' : label}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* The timeline stays mounted (it owns playback and the monitors); the other panes sit on top of it. */}
        <div className={pane === 'timeline' ? 'h-full' : 'hidden'}><VideoEditor filming={filming} /></div>
        {pane === 'camera' ? <div className="py-2"><FilmingPanel filming={filming} /></div> : null}
        {pane === 'clip' ? <div className="py-2"><VideoSceneInspector filming={filming} /></div> : null}
      </div>
    </div>
  </div>;
}
