'use client';

import { useState, type ReactNode } from 'react';
import { Bot, Check, Hand, Info, Send, Trash2, X } from 'lucide-react';
import type { StudioFilming } from '../../../lib/use-studio-filming';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const ASK: Record<'transition' | 'colour' | 'effect', { ai: string; placeholder: string }> = {
  transition: { ai: 'AI picks the cut', placeholder: 'calm, slow cuts for a gentle start' },
  colour: { ai: 'AI suggests a look', placeholder: 'make it feel like late afternoon' },
  effect: { ai: 'AI suggests', placeholder: 'make the storm feel stronger' },
};

/**
 * AI suggests | By hand (FILM-D1, boards 17–19). Asking writes a request agents read through MCP; their answer comes
 * back as a pending suggestion that changes nothing until the owner keeps it (one undo step) or drops it.
 */
export function SuggestBlock({ filming, kind, clip, children }: { filming: StudioFilming; kind: 'transition' | 'colour' | 'effect'; clip: string; children: ReactNode }) {
  const studio = filming.studio, off = filming.busy || studio.rendering;
  const [mode, setMode] = useState<'hand' | 'ai'>('hand'), [prompt, setPrompt] = useState('');
  const pending = (studio.project.suggestions ?? []).filter((s) => s.clip === clip && s.kind === kind && s.status === 'pending');
  const open = (studio.project.requests ?? []).filter((r) => r.clip === clip && r.kind === kind && r.status === 'open');
  const keep = (id: string, steps: Array<{ id: string; args: Record<string, unknown> }>, label: string) => {
    const result = studio.batch([...steps, { id: 'suggestion.mark', args: { suggestion: id, status: 'kept' } }], { label: `Keep suggestion: ${label}` });
    if (!result.ok) studio.setMessage(`The suggestion could not be applied: ${result.failed.reason}`);
  };
  const run = (id: string, args: unknown) => { const r = studio.run(id, args); if (!r.ok) studio.setMessage(r.reason); return r.ok; };
  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={`${kind} by`} className="inline-flex rounded-md border border-ink/10 p-0.5">
        <button type="button" role="radio" aria-checked={mode === 'ai'} onClick={() => setMode('ai')} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${mode === 'ai' ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}><Bot className="size-3.5" />{ASK[kind].ai}</button>
        <button type="button" role="radio" aria-checked={mode === 'hand'} onClick={() => setMode('hand')} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${mode === 'hand' ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}><Hand className="size-3.5" />By hand</button>
      </div>
      <span title="Agents connected through MCP answer the request. A suggestion changes nothing until you keep it." aria-label="About AI suggestions" className="text-ink/45"><Info className="size-3.5" /></span>
    </div>
    {mode === 'ai' ? <div className="flex gap-1.5">
      <input aria-label={`Ask for a ${kind} suggestion`} className="flex-1 rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs" maxLength={300} placeholder={ASK[kind].placeholder} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && prompt.trim() && run('suggestion.ask', { kind, clip, prompt: prompt.trim() })) setPrompt(''); }} />
      <button type="button" className={button} disabled={off || !prompt.trim()} onClick={() => { if (run('suggestion.ask', { kind, clip, prompt: prompt.trim() })) setPrompt(''); }}><Send className="size-3.5" />Ask</button>
    </div> : null}
    {open.map((r) => <div key={r.id} className="flex items-center gap-2 rounded-md border border-dashed border-ink/20 px-2 py-1.5 text-xs text-ink/60">
      <span className="size-1.5 rounded-full bg-sky-400" /><span className="flex-1 truncate">Asked: “{r.prompt}” · waiting for an agent</span>
      <button type="button" className={icon} aria-label="Delete request" disabled={off} onClick={() => run('suggestion.forget', { request: r.id })}><Trash2 className="size-3.5" /></button></div>)}
    {pending.map((s) => <div key={s.id} className="flex items-center gap-2 rounded-md border border-dashed border-amber-400/60 px-2 py-1.5 text-xs">
      <span className="size-1.5 rounded-full bg-amber-400" /><span className="flex-1 truncate">AI: {s.label}</span>
      <button type="button" className={`${icon} text-green-600`} aria-label="Keep suggestion" title="Keep (one undo step)" disabled={off} onClick={() => keep(s.id, s.steps, s.label)}><Check className="size-4" /></button>
      <button type="button" className={`${icon} text-red-500`} aria-label="Drop suggestion" title="Drop" disabled={off} onClick={() => run('suggestion.mark', { suggestion: s.id, status: 'dropped' })}><X className="size-4" /></button></div>)}
    {mode === 'hand' ? children : null}
  </div>;
}
