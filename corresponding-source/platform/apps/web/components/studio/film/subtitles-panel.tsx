'use client';
import { useRef, useState } from 'react';
import { Download, Languages, Mic, Square } from 'lucide-react';
import { DEFAULT_SUBTITLE_STYLE, subtitleLines, toSrt, toVtt } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { DOWNLOAD_NOTE, SUBTITLE_LANGUAGES, buildSubtitles, languageOf } from '../../../lib/video-studio/subtitles';
import { VOICES, speak } from '../../../lib/video-studio/dubbing';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const heading = 'flex items-center gap-1.5 px-1 pb-1 text-[11px] font-bold tracking-wide text-ink/60 uppercase';
/** Caption tracks hold titles too, so at most this many languages at once (8 caption tracks). */
const MAX_LANGUAGES = 6;

const save = (text: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * Subtitles from the film's voice (FILM-12): Whisper listens in this browser, the chosen languages are translated
 * with free models, and each language becomes its own subtitle track. One language is shown (and burnt into the
 * export) at a time; each can be saved as .srt or .vtt.
 */
export function SubtitlesSection({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const [spoken, setSpoken] = useState('en');
  const [chosen, setChosen] = useState<string[]>(['en', 'ar']);
  const [working, setWorking] = useState(false);
  const cancel = useRef<AbortController | null>(null);
  const tracks = studio.project.tracks.filter((t) => t.kind === 'caption' && t.lang);
  const shown = tracks.find((t) => !t.hidden)?.lang ?? null;
  const toggle = (code: string) => setChosen((list) => list.includes(code) ? list.filter((c) => c !== code) : list.length >= MAX_LANGUAGES ? list : [...list, code]);

  const make = async () => {
    const controller = new AbortController(); cancel.current = controller; setWorking(true);
    const report = (text: string) => studio.setMessage(text);
    try {
      const { project, assets } = studio.snapshot();
      const made = await buildSubtitles(project, assets, { spoken: spoken === 'auto' ? null : spoken, languages: chosen }, report, controller.signal);
      const done = studio.batch(made.map((one, i) => ({ id: 'subtitles.set', args: { ...one, show: i === 0 } })), { label: 'Make subtitles' });
      if (!done.ok) return;
      report(`Subtitles made in ${chosen.length} language${chosen.length === 1 ? '' : 's'}; edit the lines below.`);
    } catch (error) {
      report(error instanceof Error ? error.message : 'Subtitles failed.');
    } finally { setWorking(false); cancel.current = null; }
  };

  /** Speaks one language's subtitles with its free voice and puts them on its voice track (FILM-12b). */
  const voice = async (lang: string) => {
    const controller = new AbortController(); cancel.current = controller; setWorking(true);
    const report = (text: string) => studio.setMessage(text);
    try {
      const language = languageOf(lang), lines = subtitleLines(studio.snapshot().project, lang);
      if (!lines.length) throw new Error('Make the subtitles of this language first.');
      const blob = await speak(lines, lang, report, controller.signal);
      await studio.addVoice(lang, `Voice · ${language?.native ?? lang}`, blob);
      report(`${language?.label ?? lang} voice added; it plays when ${language?.label ?? lang} is the shown language. Mute the original voice track if both should not play.`);
    } catch (error) { report(error instanceof Error ? error.message : 'The voice failed.'); }
    finally { setWorking(false); cancel.current = null; }
  };

  return <div data-film-id="film.subtitles" className="space-y-2 rounded-lg border border-ink/10 p-2">
    <h3 className={heading}><Languages className="size-3.5" />Subtitles from the voice</h3>
    <label className="flex items-center justify-between gap-2 text-xs text-ink/60">Spoken language
      <select aria-label="Spoken language" data-film-id="film.subtitles.spoken" value={spoken} disabled={off || working} onChange={(e) => setSpoken(e.target.value)}
        className="rounded-md border border-ink/10 bg-paper px-2 py-1 text-xs">
        <option value="auto">Find it</option>
        {SUBTITLE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select></label>
    <fieldset disabled={off || working} className="grid grid-cols-2 gap-1 text-xs" aria-label="Subtitle languages">
      {SUBTITLE_LANGUAGES.map((l) => <label key={l.code} className="flex items-center gap-1.5">
        <input type="checkbox" data-film-id={`film.subtitles.lang.${l.code}`} checked={chosen.includes(l.code)} onChange={() => toggle(l.code)} />
        <span>{l.label}</span><span dir={l.rtl ? 'rtl' : undefined} className="truncate text-ink/45">{l.native}</span></label>)}
    </fieldset>
    <p className="text-[10px] leading-relaxed text-ink/45">Up to {MAX_LANGUAGES} languages. Runs on this computer with free models; first use downloads them. {DOWNLOAD_NOTE}</p>
    {working
      ? <button type="button" className={`${button} w-full`} onClick={() => cancel.current?.abort()}><Square className="size-3" />Stop</button>
      : <button type="button" className={`${button} w-full`} data-film-id="film.subtitles.make" disabled={off || !chosen.length} onClick={() => void make()}>
        <Languages className="size-3" />Make subtitles</button>}
    <SubtitleLook filming={filming} />
    {tracks.length ? <div className="space-y-1">
      {tracks.map((t) => {
        const language = languageOf(t.lang!), lines = () => subtitleLines(studio.project, t.lang!);
        return <div key={t.id} className="flex items-center gap-1 text-xs">
          <label className="flex min-w-0 flex-1 items-center gap-1.5"><input type="radio" name="film-subtitle-shown" checked={shown === t.lang} disabled={off || working}
            data-film-id={`film.subtitles.show.${t.lang}`} onChange={() => studio.run('subtitles.show', { lang: t.lang })} />
            <span className="truncate" dir={language?.rtl ? 'rtl' : undefined}>{language?.native ?? t.lang} · {t.clips.length}</span></label>
          {VOICES[t.lang!] ? <button type="button" className={button} disabled={off || working} data-film-id={`film.subtitles.voice.${t.lang}`}
            title={`Speak these lines with a free ${language?.label ?? ''} voice (${VOICES[t.lang!]!.licence}${VOICES[t.lang!]!.check ? '; licence to check before release' : ''})`}
            onClick={() => void voice(t.lang!)}><Mic className="size-3" />Voice</button> : null}
          <button type="button" className={button} title="Save as .srt" onClick={() => save(toSrt(lines()), `subtitles-${t.lang}.srt`, 'application/x-subrip')}><Download className="size-3" />srt</button>
          <button type="button" className={button} title="Save as .vtt" onClick={() => save(toVtt(lines()), `subtitles-${t.lang}.vtt`, 'text/vtt')}><Download className="size-3" />vtt</button>
        </div>;
      })}
      <label className="flex items-center gap-1.5 text-xs text-ink/60"><input type="radio" name="film-subtitle-shown" checked={shown === null} disabled={off || working}
        onChange={() => studio.run('subtitles.show', { lang: null })} />No subtitles on the film</label>
      <p className="text-[10px] text-ink/45">Pick a language to show it on the film and on the timeline (one row) and to edit its lines below; the others wait here.</p>
    </div> : null}
  </div>;
}

/** The look of subtitles (FILM-12d): background or none, its colour and transparency, the text colour. A colour is saved when the picker closes, so one choice is one undo step. */
function SubtitleLook({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const style = { ...DEFAULT_SUBTITLE_STYLE, ...studio.project.subtitleStyle };
  const [opacity, setOpacity] = useState<number | null>(null);
  const set = (change: Record<string, unknown>) => studio.run('subtitles.style', change);
  return <fieldset disabled={off} data-film-id="film.subtitles.look" className="space-y-1.5 rounded-md bg-ink/5 p-2 text-xs text-ink/60">
    <legend className="sr-only">Subtitle look</legend>
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Subtitle background">
      {([['none', 'No background'], ['line', 'Box'], ['band', 'Band']] as const).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={style.box === id}
        data-film-id={`film.subtitles.box.${id}`} onClick={() => set({ box: id })}
        className={`rounded-md px-1.5 py-1 font-semibold ${style.box === id ? 'bg-ink text-paper' : 'ring-1 ring-ink/15 hover:text-ink'}`}>{label}</button>)}
    </div>
    {style.box !== 'none' ? <>
      <label className="flex items-center justify-between gap-2">Background colour
        <input type="color" aria-label="Subtitle background colour" key={style.boxColor} defaultValue={style.boxColor} onBlur={(e) => { if (e.target.value !== style.boxColor) set({ boxColor: e.target.value }); }} className="h-6 w-10 cursor-pointer bg-transparent" /></label>
      <label className="flex items-center justify-between gap-2">Transparency
        <input type="range" aria-label="Subtitle background opacity" min={0} max={1} step={0.05} value={opacity ?? style.boxOpacity} className="w-28"
          onChange={(e) => setOpacity(Number(e.target.value))}
          onPointerUp={() => { if (opacity !== null && opacity !== style.boxOpacity) set({ boxOpacity: opacity }); setOpacity(null); }}
          onKeyUp={() => { if (opacity !== null && opacity !== style.boxOpacity) set({ boxOpacity: opacity }); setOpacity(null); }} /></label>
    </> : null}
    <label className="flex items-center justify-between gap-2">Text colour
      <input type="color" aria-label="Subtitle text colour" key={style.textColor} defaultValue={style.textColor} onBlur={(e) => { if (e.target.value !== style.textColor) set({ textColor: e.target.value }); }} className="h-6 w-10 cursor-pointer bg-transparent" /></label>
  </fieldset>;
}
