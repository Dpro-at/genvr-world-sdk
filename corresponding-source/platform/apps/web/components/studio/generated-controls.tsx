'use client';
import { describeGeneratedControls, generatedControlValueError, type GeneratedControl, type GeneratedParam, type GeneratedControlGroup } from '@genvr/core-library';
import { useId, useState } from 'react';

function Control({ control, value, overridden, onPatch }: {
  control: GeneratedControl; value: unknown; overridden: boolean;
  onPatch: (patch: Record<string, GeneratedParam | null>) => void;
}) {
  const id = useId(), [draft, setDraft] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const commit = (next: unknown) => {
    const invalid = generatedControlValueError(control, next);
    setError(invalid);
    if (!invalid) { setDraft(null); if (next !== value) onPatch({ [control.key]: next as GeneratedParam }); }
  };
  const textCommit = () => {
    if (draft === null) return;
    if (control.type === 'number' && draft.trim() === '') { setError('Enter a number.'); return; }
    commit(control.type === 'number' ? Number(draft) : draft);
  };
  const cls = 'min-w-0 rounded-md bg-paper px-2 py-1 text-xs text-ink outline-none focus:ring-2 focus:ring-ink/30';
  return <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="flex-1 text-xs font-bold">{control.label}</label>
      {control.type === 'boolean' ? <input id={id} type="checkbox" checked={value === true} onChange={e => commit(e.target.checked)} />
        : control.values ? <select id={id} className={cls} value={String(value)} onChange={e => commit(e.target.value)}>
          {control.values.map(v => <option key={v} value={v}>{v}</option>)}
        </select> : <input id={id} className={cls + ' w-24'} type={control.type === 'number' ? 'number' : 'text'}
          min={control.min} max={control.max} step="any" value={draft ?? String(value)}
          aria-describedby={id + '-help'} aria-invalid={!!error}
          onChange={e => setDraft(e.target.value)} onBlur={textCommit}
          onKeyDown={e => { e.stopPropagation(); if(e.key === 'Enter') textCommit(); if(e.key === 'Escape') {setDraft(null);setError(null);} }} />}
      {control.unit && <span className="shrink-0 text-xs text-ink/50">{control.unit}</span>}
      <button type="button" disabled={!overridden} className="text-xs text-ink/60 disabled:opacity-30"
        onClick={() => {setDraft(null);setError(null);onPatch({[control.key]:null});}}>Reset</button>
    </div>
    <p id={id + '-help'} className="text-[11px] text-ink/50">{control.description} {overridden ? 'Instance override.' : 'Using item default.'}</p>
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
  </div>;
}
/** Selected Core generator settings. Reset inherits the original item default, not world defaults. */
export function GeneratedControls({ itemId, params, onPatch, disabled = false }: {
  disabled?: boolean;
  itemId: string; params: Readonly<Record<string, unknown>>; onPatch: (patch: Record<string, GeneratedParam | null>) => void;
}) {
  const info = describeGeneratedControls(itemId);
  const [active, setActive] = useState<GeneratedControlGroup>('appearance');
  const tabId = useId();
  if (!info || !info.controls.length) return null;
  const titles: Record<GeneratedControlGroup, string> = {
    appearance: 'Appearance', motion: 'Motion', behavior: 'Behavior', distribution: 'Distribution', general: 'General',
  };
  const groups = (Object.keys(titles) as GeneratedControlGroup[]).filter(group => info.controls.some(c=>c.group===group));
  const selected = groups.includes(active) ? active : groups[0]!;
  return <section className="flex flex-col gap-2">
    <p className="text-[11px] font-black uppercase tracking-wide text-ink/50">Item settings</p>
    <div role="tablist" aria-label="Generated item settings" className="flex flex-wrap gap-1 rounded-lg bg-paper p-1">
      {groups.map((group,index)=><button key={group} type="button" role="tab" id={`${tabId}-tab-${group}`}
        aria-selected={selected===group} aria-controls={`${tabId}-panel-${group}`} tabIndex={selected===group?0:-1}
        onClick={()=>setActive(group)} onKeyDown={event=>{
          const target=event.key==='ArrowRight' ? (index+1)%groups.length : event.key==='ArrowLeft' ? (index+groups.length-1)%groups.length
            : event.key==='Home' ? 0 : event.key==='End' ? groups.length-1 : -1;
          if(target<0)return;
          event.preventDefault();event.stopPropagation();setActive(groups[target]!);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
        }} className={`min-h-11 md:min-h-8 rounded-md px-2 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-ink ${selected===group?'bg-ink text-on-brand':'text-ink/60 hover:bg-ink/10'}`}>
        {titles[group]}</button>)}
    </div>
    {groups.map(group=><div key={group} role="tabpanel" id={`${tabId}-panel-${group}`}
      aria-labelledby={`${tabId}-tab-${group}`} hidden={selected!==group} tabIndex={0}>
      <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-40">
        {info.controls.filter(c=>c.group===group).map(control => <Control key={control.key} control={control}
          value={params[control.key] ?? control.default} overridden={params[control.key] !== undefined && params[control.key] !== null}
          onPatch={patch=>{if(!disabled)onPatch(patch);}} />)}
      </fieldset>
    </div>)}
    <a href={info.source.page} target="_blank" rel="noreferrer" className="text-[11px] text-ink/50 underline">{info.source.name} | {info.source.license}</a>
  </section>;
}
