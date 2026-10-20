import { Check, FileUp, FolderOpen, LoaderCircle, LockKeyhole, PersonStanding, Play, Search, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { UserAvatarMetadata, UserAvatarStorage } from '../src/user-avatar-library';
import { userAvatarThumbnail } from './user-avatar-thumbnail';
import { importUserAvatar } from './user-avatar-import';
import { droppedFiles, IMPORT_FILE } from './dropped-files';

export function UserAvatarPanel({ storage, section, search = '', agents, assign, play, target: sharedTarget }: {
  storage: UserAvatarStorage; section: 'characters' | 'motions'; search?: string;
  /** One "Plays on" chosen by the caller (ITEMS-I4); the panel's own "Use for" otherwise. */
  target?: string | undefined;
  agents: Array<{ id: string; name: string }>;
  assign(target: string, id: string | null): Promise<void>;
  play(target: string, id: string): Promise<void>;
}) {
  const [rows, setRows] = useState<UserAvatarMetadata[]>([]), [ownTarget, setTarget] = useState('self');
  const target = sharedTarget ?? ownTarget;
  const [filter, setFilter] = useState(''), [importOpen, setImportOpen] = useState(false), [selected, setSelected] = useState<string | null>(null), [progress, setProgress] = useState({ current: 0, total: 0 });
  const filesInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [report, setReport] = useState<string[]>([]);
  const thumbnailWork = useRef(false), thumbnailAttempts = useRef(new Set<string>()), thumbnailQueue = useRef<UserAvatarMetadata[]>([]), cardGrid = useRef<HTMLDivElement>(null);
  const alive = useRef(true), serial = useRef(0);
  const [dragItems, setDragItems] = useState(0), dragDepth = useRef(0);
  useEffect(() => { alive.current = true; const refresh = () => { void storage.list().then(rows => { if (alive.current) setRows(rows); }).catch(error => { if (alive.current) setError(String(error)); }); }; refresh(); const stop = storage.subscribe?.(refresh); return () => { alive.current = false; serial.current++; stop?.(); }; }, [storage]);
  useEffect(() => {
    const grid = cardGrid.current;
    if (busy || section !== 'characters' || !grid) return;
    const drain = async () => {
      if (thumbnailWork.current) return;
      thumbnailWork.current = true;
      try {
        while (thumbnailQueue.current.length && alive.current) {
          const row = thumbnailQueue.current.shift()!;
          try { const asset = await storage.get(row.id); if (asset && !asset.metadata.thumbnail) { const thumbnail = await userAvatarThumbnail(asset.data); await storage.put({ ...asset, metadata: { ...asset.metadata, thumbnail } }); } } catch { /* A portrait failure does not prevent character selection. */ }
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      } finally { thumbnailWork.current = false; }
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const id = (entry.target as HTMLElement).dataset.avatarId, row = rows.find(row => row.id === id);
        if (row && !row.thumbnail && !thumbnailAttempts.current.has(row.id)) { thumbnailAttempts.current.add(row.id); thumbnailQueue.current.push(row); }
        observer.unobserve(entry.target);
      }
      void drain();
    }, { root: grid, rootMargin: '60px' });
    grid.querySelectorAll('[data-avatar-id]').forEach(element => observer.observe(element));
    void drain();
    return () => observer.disconnect();
  }, [rows, busy, storage, section, filter, search]);
  useEffect(() => { if (target !== 'self' && !agents.some(row => row.id === target)) setTarget('self'); }, [agents, target]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (alive.current) setBusy(false); }
  };
  const ingest = async (files: File[]) => {
    const version = ++serial.current, all = files.filter(file => /\.(fbx|glb)$/i.test(file.name));
    if (!all.length) throw new Error('Select FBX/GLB files. Extract ZIP archives first.');
    const existing = await storage.list(), known = new Set(existing.map(row => row.id)), messages: string[] = [];
    const importedCharacters = new Set(existing.filter(row => row.kind === 'character').map(row => row.originalFile));
    let added = 0, duplicates = 0;
    for (let i = 0; i < all.length; i++) {
      if (!alive.current || serial.current !== version) break;
      const file = all[i]!; setProgress({ current: i + 1, total: all.length }); setStatus(`Importing ${i + 1}/${all.length}: ${file.name}`);
      const folder = file.webkitRelativePath.split('/').slice(0, -1).join('/');
      const companions = files.filter(other => !/\.(fbx|glb)$/i.test(other.name) && (!folder || other.webkitRelativePath.startsWith(folder + '/')));
      try {
        if (section === 'characters' && importedCharacters.has(file.name)) { duplicates++; continue; }
        const assets = await importUserAvatar(file, section === 'characters' ? 'character' : 'motion', companions, section !== 'characters');
        for (const asset of assets) {
          if (known.has(asset.metadata.id)) { duplicates++; continue; }
          if (!alive.current || serial.current !== version) break;
          await storage.put(asset); known.add(asset.metadata.id); added++;
        }
      } catch (error) { messages.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`); if (alive.current) setReport([...messages]); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (alive.current) { setRows(await storage.list()); setStatus(`${added} added · ${duplicates} duplicates · ${messages.length} files failed`); setReport(messages); }
  };
  const kind = section === 'characters' ? 'character' : 'motion';
  const visible = rows.filter(row => row.kind === kind && row.name.toLowerCase().includes(search.toLowerCase()) && row.name.toLowerCase().includes(filter.toLowerCase()));
  const libraryCount = new Set(rows.filter(row => row.kind === kind).map(row => `${row.originalFile}:${row.name}`)).size;
  const unique = visible.filter((row, index) => visible.findIndex(other => other.kind === row.kind && other.originalFile === row.originalFile && other.name === row.name) === index);
  const Icon = kind === 'character' ? PersonStanding : Play;
  // Drop files or a folder anywhere on the panel (board A13): the same import as the buttons; other files are listed as skipped.
  const dropFiles = (data: DataTransfer) => void run(async () => {
    const files = await droppedFiles(data), skipped = files.filter(file => !IMPORT_FILE.test(file.name));
    try { await ingest(files.filter(file => IMPORT_FILE.test(file.name))); }
    finally { if (skipped.length && alive.current) setReport(lines => [...lines, ...skipped.map(file => `${file.name}: skipped (not an FBX, GLB or texture file).`)]); }
  });
  const dragging = dragItems > 0;
  return <section aria-label={`User ${section} library`} className={`space-y-3 rounded-lg border-t border-ink/10 pt-3 text-ink ${dragging ? 'ring-2 ring-sky-400' : ''}`}
    onDragEnter={event => { if (!busy && event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setDragItems(event.dataTransfer.items.length || 1); } }}
    onDragOver={event => { if (!busy && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
    onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragItems(0); }}
    onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragItems(0); if (!busy && event.dataTransfer.types.includes('Files')) dropFiles(event.dataTransfer); }}>
    <div className="flex items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-1.5 text-xs font-bold"><Icon size={15} />My {section}<span className="text-ink/50">{libraryCount}</span></h3>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/50"><LockKeyhole size={11} />Private on this device</p></div>
      <button type="button" aria-label={`Import ${section}`} aria-expanded={importOpen} onClick={() => setImportOpen(open => !open)} className="flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-2 text-xs font-bold text-paper"><Upload size={13} />Import</button>
    </div>
    {importOpen || busy ? <div className="space-y-2 rounded-lg border border-ink/15 bg-paper/50 p-3" aria-label={`Import ${section} options`}>
      <div className="flex items-center justify-between"><span className="text-xs font-bold">Add {section}</span><button type="button" aria-label="Close import options" onClick={() => setImportOpen(false)}><X size={14} /></button></div>
      <p className="text-[11px] leading-relaxed text-ink/60">Choose FBX or GLB files, or a folder with textures. Extract ZIP files first.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => filesInput.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-2 py-2 text-xs hover:bg-ink/5 disabled:opacity-40"><FileUp size={14} />Choose files</button>
        <button type="button" disabled={busy} onClick={() => folderInput.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-2 py-2 text-xs hover:bg-ink/5 disabled:opacity-40"><FolderOpen size={14} />Choose folder</button>
      </div>
      <input ref={filesInput} aria-label={`Import user ${section}`} className="hidden" type="file" accept=".fbx,.glb,.png,.jpg,.jpeg,.webp,.tga" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void run(() => ingest(files)); }} />
      <input ref={folderInput} aria-label={`Import user ${section} folder`} {...{ webkitdirectory: '' }} className="hidden" type="file" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void run(() => ingest(files)); }} />
      {busy ? <div className="space-y-1.5"><div className="flex items-center gap-1.5 text-[11px]"><LoaderCircle size={12} className="animate-spin" />Importing {progress.current} of {progress.total}</div><progress aria-label="Import progress" className="h-1.5 w-full accent-current" value={progress.current} max={progress.total || 1} /></div> : null}
    </div> : null}
    {rows.some(row => row.kind === kind) ? <>
      <label className="flex items-center gap-2 rounded-lg border border-ink/10 px-2.5 py-2"><Search size={13} className="shrink-0 text-ink/50" /><input aria-label={`Search my ${section}`} placeholder={`Search ${section}`} value={filter} onChange={event => setFilter(event.target.value)} className="min-w-0 w-full bg-transparent text-xs outline-none" /></label>
      {sharedTarget === undefined ? <label className="block text-[11px] text-ink/60">Use for<select aria-label={`User ${section} target`} className="mt-1 w-full rounded-lg border border-ink/10 bg-paper p-2 text-xs text-ink" value={target} disabled={busy} onChange={event => setTarget(event.target.value)}><option value="self">My avatar</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label> : null}
      <div ref={cardGrid} className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label={`Private ${section}`}>
        {unique.map(row => { const active = selected === row.id; const name = row.name.split('__')[0]!.replace(/_/g, ' '); return <button type="button" key={row.id} data-avatar-id={row.id} disabled={busy} aria-label={`${kind === 'character' ? 'Use' : 'Play'} ${row.name}`} aria-pressed={active} className={`group relative overflow-hidden rounded-lg border text-left transition-colors disabled:opacity-40 ${active ? 'border-ink bg-ink/10' : 'border-ink/10 hover:border-ink/40'}`} title={row.name} onClick={() => void run(async () => { if (kind === 'character') await assign(target, row.id); else await play(target, row.id); if (alive.current) { setSelected(row.id); setStatus(`${kind === 'character' ? 'Using' : 'Playing'} ${name}`); } })}>
          <div className="flex h-20 items-center justify-center bg-ink/5">{row.thumbnail ? <img src={row.thumbnail} alt={name} className="h-full w-full object-contain" /> : <Icon size={kind === 'character' ? 38 : 24} strokeWidth={1.25} className="text-ink/50" />}</div>
          {active ? <span className="absolute right-1.5 top-1.5 rounded-full bg-ink p-1 text-paper"><Check size={10} /></span> : null}
          <div className="px-2 py-2"><span className="block truncate text-[11px] font-bold">{kind === 'character' ? name : row.name}</span><span className="mt-0.5 block text-[10px] text-ink/50">{kind === 'character' ? 'Use character' : `${row.duration?.toFixed(1) ?? '—'} seconds`}</span></div>
        </button>; })}
      </div>
      {!unique.length ? <p className="py-3 text-center text-xs text-ink/50">No matches. Try another name.</p> : null}
    </> : null}
    {dragging || !rows.some(row => row.kind === kind) ? <div className={`rounded-lg border border-dashed p-5 text-center ${dragging ? 'border-2 border-sky-400 bg-sky-400/10' : 'border-ink/20'}`}><Icon size={30} strokeWidth={1.2} className="mx-auto mb-2 text-ink/40" />
      {dragging ? <><p className="text-xs font-bold">Drop to import</p><p className="mt-1 text-[11px] leading-relaxed text-ink/60">{dragItems} {dragItems === 1 ? 'item' : 'items'} · FBX, GLB, their textures or a folder</p></>
        : <><p className="text-xs font-bold">Your {section}, ready to use</p><p className="mt-1 text-[11px] leading-relaxed text-ink/50">Drop FBX or GLB files or a folder here, or choose them with Import.</p></>}</div> : null}
    {status ? <p role="status" className="break-words text-[11px] leading-relaxed text-ink/60">{status}</p> : null}{error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    <details className="border-t border-ink/10 pt-2"><summary className="cursor-pointer text-[11px] text-ink/50">Library details{report.length ? ` (${report.length} import issues)` : ''}</summary>
      <p className="mt-2 text-[11px] leading-relaxed text-ink/50">Files stay in this browser profile. They are excluded from public packages and world exports.</p>
      {section === 'characters' ? <button type="button" disabled={busy} className="mt-2 text-[11px] underline" onClick={() => void run(async () => { await assign(target, null); setSelected(null); setStatus('Default character restored.'); })}>Restore default character</button> : null}
      {report.length ? <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-[11px] text-red-600">{report.map((row, i) => <li key={i}>{row}</li>)}</ul> : null}
    </details>
  </section>;
}
