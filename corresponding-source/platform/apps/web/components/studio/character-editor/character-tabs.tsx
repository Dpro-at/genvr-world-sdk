'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Bookmark, Check, ChevronRight, Info, Mic, Palette, PersonStanding, Radio, Ruler, Save, Smile, type LucideIcon } from 'lucide-react';
import { EXPRESSIONS } from '@genvr/assistant';
import { useStudioHost } from '../../../lib/studio-host';
import type { CharacterEditor } from './use-character-editor';
import { BodySection, ColorSection, FaceSection, RecipeSection, ShapeSection } from './character-controls';

type Tab = 'look' | 'shape' | 'face' | 'colours' | 'voice' | 'saved';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'look', label: 'Look', icon: PersonStanding }, { id: 'shape', label: 'Shape', icon: Ruler }, { id: 'face', label: 'Face', icon: Smile },
  { id: 'colours', label: 'Colours', icon: Palette }, { id: 'voice', label: 'Voice', icon: Mic }, { id: 'saved', label: 'Saved', icon: Bookmark },
];
const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
/** The tab other parts of the studio ask for (a right-click on the avatar, the header). */
let wanted: Tab | null = null; const listeners = new Set<(t: Tab) => void>();
export const openAvatarTab = (tab: Tab) => { wanted = tab; listeners.forEach((l) => l(tab)); };

/** A closed row that shows its value and opens its tab (design rule 10, board A1). */
function Summary({ icon: Icon, title, value, open }: { icon: LucideIcon; title: string; value: string; open: () => void }) {
  return <button type="button" onClick={open} className="flex w-full items-center gap-2 border-b border-ink/10 py-2 text-left text-xs hover:bg-ink/5">
    <ChevronRight className="size-3.5 text-ink/45" /><Icon className="size-3.5" /><b>{title}</b><span className="ml-auto truncate text-ink/55">{value}</span></button>;
}

/**
 * The left dock of the Avatar tab (design A1–A9): Look · Shape · Face · Colours · Voice · Saved. Every control of the
 * old single column is kept, each in its tab; agents change the same character with the avatar_studio MCP tool.
 */
export function CharacterTabs({ editor }: { editor: CharacterEditor }) {
  const host = useStudioHost();
  const [tab, setTab] = useState<Tab>(wanted ?? 'look');
  useEffect(() => { const l = (t: Tab) => setTab(t); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const { recipe } = editor, shape = recipe.shape;
  const face = editor.info?.expressionSupported ? `${editor.info.expression}` : 'no face on this body';
  const body = <div className="space-y-3">
    {host.userAvatarControls ? <div>{host.userAvatarControls('characters', '', (b) => editor.change((r) => ({ ...r, body: b })))}</div> : null}
    <BodySection editor={editor} />
    <div>
      <Summary icon={Ruler} title="Shape" value={`${Math.round(shape.height * 100)}% · ${editor.info?.height ? `${editor.info.height.toFixed(2)} m` : ''} · muscle ${shape.muscle >= 0 ? '+' : ''}${shape.muscle.toFixed(1)}`} open={() => setTab('shape')} />
      <Summary icon={Smile} title="Face" value={face} open={() => setTab('face')} />
      <Summary icon={Palette} title="Colours" value={recipe.colors.top} open={() => setTab('colours')} />
      <Summary icon={Mic} title="Voice" value="choose or clone" open={() => setTab('voice')} />
    </div>
    <p className="text-[11px] text-ink/55">Right-click the avatar for colours, shape and the face close-up.</p>
  </div>;
  const faceTab = <div className="space-y-3">
    <div className="flex items-center gap-2"><span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50">Expression · try it on the face</span>
      <button type="button" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10" aria-label="Face close-up" title="Face close-up" onClick={() => editor.stage.current?.focusFace()}><Smile className="size-4" /></button></div>
    {editor.info?.expressionSupported === false ? <p className="text-xs text-ink/60">This body has no face controls. Bodies marked “face” (for example Starter) have them.</p>
      : <div role="radiogroup" aria-label="Expression" className="grid grid-cols-3 gap-1">{EXPRESSIONS.map((e) => <button key={e} type="button" role="radio" aria-checked={editor.info?.expression === e}
        onClick={() => { if (host.presentAvatar) host.presentAvatar({ kind: 'expression', target: 'self', expression: e, duration: 60000 }); else editor.stage.current?.presentExpression(e); }}
        className="rounded-lg border border-ink/10 py-2 text-xs font-semibold capitalize hover:bg-ink/5 aria-checked:border-ink aria-checked:bg-ink aria-checked:text-paper">{e}</button>)}</div>}
    <div className="border-t border-ink/10 pt-2"><FaceSection editor={editor} /></div>
  </div>;
  const voiceTab = <div className="space-y-3 text-xs">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Voice of this avatar</p>
    <p className="text-ink/60">The voice window has the voice library, Clone my voice, models and a bar to try a line in any language.</p>
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" className={button} disabled={!host.openVoice} onClick={() => host.openVoice?.()}><Mic className="size-3.5" />Choose voice…</button>
      <button type="button" className={button} disabled={!host.openVoice} onClick={() => host.openVoice?.()}><Mic className="size-3.5" />Clone a voice</button>
    </div>
    <div className="flex items-center gap-2 border-t border-ink/10 pt-3"><span className="flex-1"><b className="block">Avatar Live</b><span className="text-ink/55">Talk to your avatar; the same settings as in Dpro chat.</span></span>
      <button type="button" className={button} disabled={!host.avatarLive} onClick={() => host.avatarLive?.()}><Radio className="size-3.5" />Open</button></div>
    {!host.openVoice ? <p className="text-ink/50">Voices need the local voice service (a live Studio).</p> : null}
  </div>;
  const content: Record<Tab, ReactNode> = {
    look: body, shape: <ShapeSection editor={editor} />, face: faceTab, colours: <ColorSection editor={editor} />, voice: voiceTab,
    saved: <div className="space-y-2"><div className="flex items-center gap-1.5"><span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50">Name, save, export, import · my characters</span><Help text="Private on this device. Agents save with avatar_studio save." /></div><RecipeSection editor={editor} /></div>,
  };
  const isSaved = editor.saved.some((s) => JSON.stringify(s.recipe) === JSON.stringify(recipe));
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center gap-1.5 border-b border-ink/10 px-2 py-1.5">
      <input aria-label="Character name" value={recipe.name} maxLength={60} onChange={(e) => { const name = e.target.value; editor.change((r) => ({ ...r, name: name.trim() ? name : r.name })); }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-bold text-ink outline-none hover:bg-ink/5 focus:bg-paper focus:ring-1 focus:ring-ink/30" />
      <button type="button" onClick={() => { editor.save(); }} title="Save in this browser" className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1.5 text-xs font-bold text-paper">
        {isSaved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}{isSaved ? 'Saved' : 'Save'}</button>
      <button type="button" aria-label="More: export, import, my characters" title="Export, import, my characters" onClick={() => setTab('saved')} className="inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10"><Bookmark className="size-4" /></button>
    </div>
    <div role="tablist" aria-label="Avatar tools" className="flex gap-0.5 border-b border-ink/10 bg-surface p-1">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} title={label} onClick={() => setTab(id)}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold ${tab === id ? 'flex-1 bg-ink text-paper' : 'min-w-8 text-ink/60 hover:bg-ink/5 hover:text-ink'}`}><Icon className="size-4" />{tab === id ? label : null}</button>)}
    </div>
    <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-width:none]">{content[tab]}</div>
  </div>;
}

