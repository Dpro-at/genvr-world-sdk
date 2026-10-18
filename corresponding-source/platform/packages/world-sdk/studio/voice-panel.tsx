import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  Download,
  Globe2,
  LoaderCircle,
  Mic,
  Play,
  Search,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { wav } from '../../../apps/web/lib/video-studio/dubbing';
import type { LiveStudioOptions } from './live-studio';
type Model = {
  id: string;
  name: string;
  languages: string[];
  downloadBytes: number;
  installed: boolean;
  voiceDesign?: boolean;
  license: string;
};
type Voice = {
  id: string;
  name: string;
  model: string;
  voiceType?: string;
  sourceModel?: string;
  description?: string;
  demoId?: string;
  language?: string;
};
type Demo = {
  id: string;
  name: string;
  language: string;
  referenceText: string;
};
type Recording = { id: string; duration: number; text: string; design?: boolean; language?: string; voiceType?: string; model?: string; sourceModel?: string; description?: string };
type Job = {
  id: string;
  status: string;
  error?: string;
  result?: Recording & { errors?: Array<{ id: string; error: string }> };
  progress?: { completed: number; total: number; name: string };
};
const languageName = (code: string) =>
  new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
const nativeName = (code: string) =>
  new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
export function VoicePanel({
  connection,
  projectId,
  agents,
  close,
  playerHost,
}: {
  connection: LiveStudioOptions;
  projectId: string;
  agents: Array<{ id: string; name: string }>;
  close(): void;
  playerHost: (element: HTMLDivElement | null) => void;
}) {
  const [models, setModels] = useState<Model[]>([]),
    [voices, setVoices] = useState<Voice[]>([]),
    [demos, setDemos] = useState<Demo[]>([]),
    [recordings, setRecordings] = useState<Recording[]>([]),
    [model, setModel] = useState('chatterbox-multilingual-v3'),
    [voice, setVoice] = useState(''),
    [target, setTarget] = useState('self'),
    [language, setLanguage] = useState('ar');
  const [removeModel, setRemoveModel] = useState<string | null>(null);
  const [tab, setTab] = useState<'generate' | 'library' | 'clone' | 'models'>('generate'),
    [filter, setFilter] = useState(''),
    [name, setName] = useState('My voice'),
    [consent, setConsent] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [text, setText] = useState('مرحباً بكم في عالمنا. هيا نكتشف شيئاً جديداً ونصنع حكاية جميلة معاً.'),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [voiceType, setVoiceType] = useState('female');
  const [description, setDescription] = useState('Warm, clear and friendly, with natural pacing.');
  const [draft, setDraft] = useState<Recording | null>(null);
  useEffect(() => { setDraft(null); }, [voiceType, language, description, text]);
  const input = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    abort = useRef(new AbortController());
  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    return () => {
      alive.current = false;
      abort.current.abort();
    };
  }, []);
  const call = async (body: unknown) => {
    const response = await fetch(
      new URL('/studio-bridge/voice', connection.url),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: abort.current.signal,
      },
    );
    const json = await response.json();
    if (!response.ok || json.error)
      throw new Error(json.error ?? 'Voice request failed.');
    return json.result;
  };
  const refresh = async () => {
    const [catalog, library, clips] = await Promise.all([
      call({ action: 'models' }),
      call({ action: 'voices' }),
      call({ action: 'recordings' }),
    ]);
    if (!alive.current) return;
    const progress = catalog.jobs?.at(-1)?.progress;
    if (catalog.busy && progress)
      setStatus(
        `Preparing ${progress.completed} / ${progress.total} · ${progress.name}`,
      );
    setDemos(catalog.demos);
    setModels(catalog.models);
    setVoices(library.voices);
    setRecordings(clips.recordings);
    setVoice(library.assignments[projectId + ':' + target] || '');
  };
  useEffect(() => {
    void refresh().catch((error) => setError(error.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [target]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error ? error.message : 'Voice operation failed.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const wait = async (job: Job) => {
    while (job.status === 'running' && alive.current) {
      setStatus(
        job.progress
          ? `Downloading ${job.progress.completed} / ${job.progress.total} · ${job.progress.name}`
          : 'Working locally…',
      );
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (!alive.current) return;
      job = await call({ action: 'job', jobId: job.id });
    }
    if (job.status === 'failed') throw new Error(job.error);
    if (job.result?.errors?.length)
      throw new Error(
        `${job.result.errors.length} samples could not download. Retry to fetch only missing samples.`,
      );
    if (alive.current) setStatus('Ready.');
    return job.result;
  };
  const upload = async () => {
    if (!file) throw new Error('Choose a recording first.');
    if (file.size > 20 * 1024 * 1024)
      throw new Error('Use a recording smaller than 20 MB.');
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration < 3 || decoded.duration > 30)
        throw new Error('Choose a clear 3–30 second recording.');
      const offline = new OfflineAudioContext(
          1,
          Math.ceil(decoded.duration * 16000),
          16000,
        ),
        source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const buffer = await offline.startRendering(),
        blob = wav(buffer.getChannelData(0), 16000),
        audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]!);
          reader.onerror = () =>
            reject(new Error('Recording could not be read.'));
          reader.readAsDataURL(blob);
        });
      const created = await call({
        action: 'clone',
        model,
        name,
        language,
        consent,
        audio,
      });
      setTab('library');
      setStatus(`${created.name} saved. Choose Use to assign it to an avatar.`);
    } finally {
      await context.close();
    }
  };
  const preview = (demo: Demo) =>
    void run(async () => {
      await wait(
        await call({
          action: 'preview_demo',
          demoId: demo.id,
          model,
          target,
          projectId,
        }),
      );
    });
  const choose = (row: Voice) =>
    void run(async () => {
      await call({ action: 'assign', voiceId: row.id, target, projectId });
      setVoice(row.id);
      if (row.language) setLanguage(row.language);
      setModel(row.model);
      setStatus(`${row.name} is assigned to this speaker.`);
    });
  const field =
    'w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40';
  const button =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold hover:bg-ink/5 disabled:opacity-40';
  const selected = voices.find((row) => row.id === voice),
    visibleDemos = demos.filter((row) =>
      `${row.name} ${nativeName(row.language)} ${row.language}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
  return (
    <section
      role="dialog"
      aria-label="Avatar voice"
      className="fixed inset-x-4 bottom-4 top-16 z-50 mx-auto flex max-w-[1040px] flex-col overflow-hidden rounded-xl border border-ink/15 bg-surface text-ink shadow-2xl"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink/10 px-4">
        <Mic className="size-5" />
        <div className="flex-1">
          <h2 className="text-sm font-bold">Avatar voice</h2>
          <p className="text-[10px] text-ink/50">
            Local voice library · {voices.length} saved voices
          </p>
        </div>
        <select
          aria-label="Voice speaker"
          className="max-w-40 rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-xs"
          value={target}
          disabled={busy}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="self">My avatar</option>
          {agents.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button
          aria-label="Close avatar voice"
          className="rounded p-1 hover:bg-ink/10"
          onClick={close}
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Voice workspace"
          className="flex w-40 shrink-0 flex-col gap-1 border-r border-ink/10 bg-paper/40 p-2 max-sm:w-14"
        >
          {(
            [
              { id: 'generate', label: 'Voice generator', Icon: Mic },
              { id: 'library', label: 'Voice library', Icon: Globe2 },
              { id: 'clone', label: 'Clone my voice', Icon: UserRound },
              { id: 'models', label: 'Models', Icon: Cpu },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-pressed={tab === id}
              title={label}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs ${tab === id ? 'bg-ink/10 font-bold' : 'text-ink/60 hover:bg-ink/5'}`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="max-sm:hidden">{label}</span>
            </button>
          ))}
          <p className="mt-auto p-2 text-[10px] leading-relaxed text-ink/40 max-sm:hidden">
            Voice recordings and models stay on this computer.
          </p>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'generate' ? (
              <div className="mx-auto max-w-xl">
                <h3 className="text-base font-bold">Create a new voice</h3>
                <p className="mb-5 mt-1 text-xs text-ink/50">Design a voice, listen, then save it. Assign it to an avatar from your library.</p>
                {draft ? <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <div className="flex items-center gap-2"><span className="flex-1 text-xs font-semibold">{languageName(draft.language!)} · {draft.voiceType === 'child' ? 'Child-style' : draft.voiceType} · {draft.duration.toFixed(1)} s</span><button className={button} disabled={busy} onClick={() => void run(async () => { await call({ action: 'replay', audioId: draft.id, target, projectId }); })}><Play className="size-3" /> Listen</button></div>
                  <label className="mt-3 block text-xs font-semibold">Save voice as<input aria-label="Designed voice name" className={field + ' mt-2'} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
                  <button className={button + ' mt-3 w-full'} disabled={busy || !name.trim()} onClick={() => void run(async () => { const saved = await call({ action: 'save_design', audioId: draft.id, name }); setDraft(null); setTab('library'); setStatus(`${saved.name} saved. Choose Use to assign it to an avatar.`); })}><Check className="size-4" /> Save to voice library</button>
                </div> : null}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold">Language
                    <select aria-label="Generator language" className={field + ' mt-2'} value={language} disabled={busy} onChange={e => { setLanguage(e.target.value); const demo = demos.find(row => row.language === e.target.value); if (demo) setText(demo.referenceText); }}>
                      {models.find(row => row.id === 'chatterbox-multilingual-v3')?.languages.map(code => <option key={code} value={code}>{nativeName(code)} · {languageName(code)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold">Voice type
                    <select aria-label="Generator voice type" className={field + ' mt-2'} value={voiceType} disabled={busy} onChange={e => setVoiceType(e.target.value)}>
                      <option value="male">Male</option><option value="female">Female</option><option value="child">Child-style</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 block text-xs font-semibold">Voice character
                  <textarea aria-label="Voice character" className={field + ' mt-2 h-20 resize-none'} value={description} maxLength={400} disabled={busy} onChange={e => setDescription(e.target.value)} />
                </label>
                <label className="mt-4 block text-xs font-semibold">Preview text
                  <textarea aria-label="Generator preview text" dir="auto" className={field + ' mt-2 h-24 resize-none'} value={text} maxLength={600} disabled={busy} onChange={e => setText(e.target.value)} />
                </label>
                <p className="my-3 text-[11px] text-ink/50">Each generation creates a new synthetic voice. Listen before saving; timbre and accent can vary.</p>
                {!models.find(row => row.id === 'voice-design-4bit')?.installed ? <button className={button + ' mb-3 w-full'} onClick={() => setTab('models')}>Download Voice Designer · 2.3 GB</button> : null}
                <button className={button + ' w-full bg-ink text-paper'} disabled={busy || !text.trim() || !models.find(row => row.id === 'voice-design-4bit')?.installed || !models.find(row => row.id === 'chatterbox-multilingual-v3')?.installed} onClick={() => void run(async () => { setDraft(null); const result = await wait(await call({ action: 'design', language, voiceType, description, text, target, projectId })); if (result) setDraft(result); })}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />} Generate preview
                </button>

              </div>
            ) : null}
            {tab === 'library' ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold">
                      Choose a saved voice
                    </h3>
                    <p className="mt-1 text-xs text-ink/50">
                      Choose a ready voice for this avatar. Preview it first, or generate a new voice.
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() =>
                      void run(async () => {
                        await wait(
                          await call({ action: 'prepare_previews', model }),
                        );
                      })
                    }
                  >
                    <Download className="size-3.5" />
                    Get language examples
                  </button>
                </div>
                <label className="mb-4 flex items-center gap-2 rounded-lg border border-ink/15 bg-paper px-3">
                  <Search className="size-4 text-ink/40" />
                  <input
                    aria-label="Search voice languages"
                    placeholder="Search voices or languages"
                    className="w-full bg-transparent py-2 text-sm outline-none"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <button className={button + ' mb-3'} onClick={() => setTab('generate')}><Mic className="size-3.5" /> Create a new voice</button>
                {voices.some((row) => !row.demoId) ? (
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-bold">Saved voices</h3>
                    {voices
                      .filter((row) => !row.demoId && `${row.name} ${row.language ?? ''} ${row.language ? languageName(row.language) : ''} ${row.voiceType ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
                      .map((row) => (
                        <div
                          key={row.id}
                          className="mb-2 flex items-center gap-2 rounded-lg border border-ink/10 p-2"
                        >
                          <UserRound className="size-4" />
                          <div className="min-w-0 flex-1"><strong className="block text-xs">{row.name}</strong><span className="text-[10px] text-ink/50">{row.language ? languageName(row.language) : 'Language unspecified'} · {row.voiceType === 'child' ? 'Child-style' : row.voiceType ?? 'Reference voice'} · {models.find(item => item.id === row.model)?.name ?? row.model}{row.sourceModel ? ' · Designed' : ''}</span></div>
                          <button aria-label={`Download ${row.name}`} title="Download WAV with voice information" className={button} disabled={busy} onClick={() => void run(async () => {
                            const exported = await call({ action: 'export_voice', voiceId: row.id });
                            const bytes = Uint8Array.from(atob(exported.data), c => c.charCodeAt(0));
                            const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
                            const anchor = document.createElement('a'); anchor.href = url; anchor.download = exported.filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
                            setStatus(`Downloaded ${row.name} with language, voice type and model information embedded in the WAV.`);
                          })}><Download className="size-3" /></button>
                          <button
                            aria-label={`Preview ${row.name}`}
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await call({
                                  action: 'preview',
                                  voiceId: row.id,
                                  target,
                                  projectId,
                                });
                              })
                            }
                          >
                            <Play className="size-3" />
                          </button>
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() => choose(row)}
                          >
                            {voice === row.id ? 'Selected' : 'Use'}
                          </button>
                        </div>
                      ))}
                  </div>
                ) : null}
                <section className="mt-5"><h3 className="mb-3 text-sm font-bold">Language voices · {demos.length} languages</h3>
                <div
                  className="grid grid-cols-2 gap-3 lg:grid-cols-3"
                  aria-label="Language voice samples"
                >
                  {visibleDemos.map((demo) => {
                    const saved = voices.find((row) => row.demoId === demo.id),
                      active = saved?.id === voice;
                    return (
                      <article
                        key={demo.id}
                        className={`flex min-h-36 flex-col rounded-xl border p-3 ${active ? 'border-cyan-500 bg-cyan-500/5' : 'border-ink/10 bg-paper/40'}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <h4 dir="auto" className="text-sm font-bold">
                              {nativeName(demo.language)}
                            </h4>
                            <p className="mt-0.5 text-[10px] text-ink/40">
                              {languageName(demo.language)}
                              {saved ? ' · On device' : ''}
                            </p>
                          </div>
                          {active ? (
                            <Check className="size-4 text-cyan-500" />
                          ) : null}
                        </div>
                        <p
                          dir="auto"
                          className="my-3 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-ink/60"
                        >
                          {demo.referenceText}
                        </p>
                        <div className="mt-auto flex items-center gap-2">
                          <button
                            aria-label={`Preview ${languageName(demo.language)} voice`}
                            disabled={busy}
                            className={button + ' flex-1'}
                            onClick={() => preview(demo)}
                          >
                            <Play className="size-3" />
                            Listen
                          </button>
                          {saved ? (
                            <button
                              aria-label={`Use ${languageName(demo.language)} voice`}
                              disabled={busy}
                              className={button}
                              onClick={() => choose(saved)}
                            >
                              {active ? 'Selected' : 'Use'}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                </section>
                <div className="mt-5 rounded-xl border border-ink/10 bg-paper/40 p-4">
                  <div className="flex items-center gap-2">
                    <UserRound className="size-4" />
                    <h3 className="text-sm font-bold">Create your own voice</h3>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      aria-label="New voice language"
                      className="min-w-40 flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-xs"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      {models
                        .find((row) => row.id === model)
                        ?.languages.map((code) => (
                          <option key={code} value={code}>
                            {nativeName(code)} · {languageName(code)}
                          </option>
                        ))}
                    </select>
                    <button className={button} onClick={() => setTab('clone')}>
                      <Upload className="size-3.5" />
                      Clone my voice
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {tab === 'clone' ? (
              <div className="mx-auto max-w-lg">
                <h3 className="text-base font-bold">Clone my voice</h3>
                <p className="mb-5 mt-1 text-xs text-ink/50">
                  Add a clear recording. Your agent reuses its voice locally.
                </p>
                <input
                  ref={input}
                  type="file"
                  hidden
                  accept="audio/*"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                <button
                  className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-ink/20 bg-paper/40 p-8 hover:border-ink/40"
                  onClick={() => input.current?.click()}
                >
                  <Upload className="size-7 text-ink/50" />
                  <strong className="text-sm">
                    {file ? file.name : 'Choose a voice recording'}
                  </strong>
                  <span className="text-xs text-ink/40">
                    3–30 seconds · one speaker · up to 20 MB
                  </span>
                </button>
                <label className="mt-5 block text-xs font-semibold">
                  Voice name
                  <input
                    aria-label="Voice name"
                    className={field + ' mt-2'}
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="mt-4 block text-xs font-semibold">
                  Recording language
                  <select
                    aria-label="Recording language"
                    className={field + ' mt-2'}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {models
                      .find((row) => row.id === model)
                      ?.languages.map((code) => (
                        <option key={code} value={code}>
                          {nativeName(code)} · {languageName(code)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="my-5 flex items-start gap-2 text-xs text-ink/60">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I own this voice or have the speaker’s permission to use it.
                </label>
                <button
                  className={
                    button + ' w-full bg-ink text-paper hover:bg-ink/90'
                  }
                  disabled={busy || !file || !consent || !name.trim()}
                  onClick={() => void run(upload)}
                >
                  <Mic className="size-4" />
                  Save to voice library
                </button>
              </div>
            ) : null}
            {tab === 'models' ? (
              <>
                <h3 className="text-base font-bold">Local models</h3>
                <p className="mb-5 mt-1 text-xs text-ink/50">
                  Install only what you need. Voice samples are separate from
                  model weights.
                </p>
                {models.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-xl border border-ink/10 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Cpu className="size-6 text-ink/50" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold">{row.name}</h4>
                        <p className="mt-1 text-xs text-ink/40">
                          Apple Silicon · {row.languages.length} languages ·{' '}
                          {(row.downloadBytes / 1e9).toFixed(1)} GB ·{' '}
                          {row.license}
                          {row.voiceDesign ? ' · Voice design · requires Multilingual Voice' : ' · Speech and cloning'}
                        </p>
                      </div>
                      {row.installed ? (
                        <div className="flex flex-col items-end gap-2">
                          <span className="flex items-center gap-1 text-xs text-cyan-500">
                            <Check className="size-4" />
                            Installed
                          </span>
                          {removeModel === row.id ? (
                            <div className="flex gap-2">
                              <button
                                disabled={busy}
                                className={button + ' text-coral'}
                                onClick={() =>
                                  void run(async () => {
                                    await wait(
                                      await call({
                                        action: 'remove',
                                        model: row.id,
                                        confirm: true,
                                      }),
                                    );
                                    setRemoveModel(null);
                                    setStatus(
                                      'Model removed. Saved voices and recordings are kept.',
                                    );
                                  })
                                }
                              >
                                Confirm removal
                              </button>
                              <button
                                className={button}
                                onClick={() => setRemoveModel(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={busy}
                              className="text-xs text-ink/50 underline"
                              onClick={() => setRemoveModel(row.id)}
                            >
                              Remove model
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await wait(
                                await call({
                                  action: 'install',
                                  model: row.id,
                                }),
                              );
                            })
                          }
                        >
                          <Download className="size-4" />
                          Download
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </>
            ) : null}
          </div>
          <footer className="shrink-0 border-t border-ink/10 bg-paper/20 p-3">
            {tab !== 'generate' ? <><div className="mb-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {selected ? `${selected.name} · ${selected.language ? languageName(selected.language) : 'Reference'} · ${selected.voiceType === 'child' ? 'Child-style' : selected.voiceType ?? 'Reference voice'} · ${models.find(row => row.id === selected.model)?.name ?? selected.model}` : 'Choose a saved voice for this avatar'}
              </span>
              <select
                aria-label="Speech language"
                disabled={busy}
                className="max-w-36 rounded border border-ink/15 bg-paper p-1 text-xs"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {models
                  .find((row) => row.id === model)
                  ?.languages.map((code) => (
                    <option key={code} value={code}>
                      {languageName(code)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex gap-2">
              <textarea
                aria-label="Speech text"
                disabled={busy}
                dir="auto"
                className={field + ' h-12 resize-none py-2 text-xs'}
                maxLength={1200}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                className={
                  button + ' shrink-0 bg-ink text-paper hover:bg-ink/90'
                }
                disabled={
                  busy ||
                  !voice ||
                  !text.trim() ||
                  !models.find((row) => row.id === model)?.installed
                }
                onClick={() =>
                  void run(async () => {
                    await wait(
                      await call({
                        action: 'speak',
                        model,
                        voiceId: voice,
                        target,
                        projectId,
                        text,
                        language,
                      }),
                    );
                  })
                }
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Speak
              </button>
            </div>
            </> : null}
            <div ref={playerHost} className="mt-2" />
            {tab !== 'generate' && recordings.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {recordings
                  .slice(-2)
                  .reverse()
                  .map((clip) => (
                    <button
                      key={clip.id}
                      className="max-w-60 truncate rounded border border-ink/10 px-2 py-1 text-[10px] text-ink/50 hover:bg-ink/5"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await call({
                            action: 'replay',
                            audioId: clip.id,
                            target,
                            projectId,
                          });
                        })
                      }
                    >
                      {clip.text}
                    </button>
                  ))}
              </div>
            ) : null}
            <p role="status" className="mt-1 text-[10px] text-ink/50">
              {status}
            </p>
            {error ? (
              <p role="alert" className="mt-1 text-xs text-coral">
                {error}
              </p>
            ) : null}
          </footer>
        </div>
      </div>
    </section>
  );
}
