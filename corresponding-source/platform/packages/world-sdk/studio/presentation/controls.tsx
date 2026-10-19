import { useState, useSyncExternalStore } from 'react';
import { EFFECTS, EXPRESSIONS, NOTIFICATION_TYPES } from '@genvr/assistant';
import { avatarMotionEntries, motionCategories } from '@genvr/runtime';
import {
  AtSign, Banknote, BarChart3, Bell, Bot, Brain, Calendar, CheckSquare, CircleHelp, CloudRain, CloudSnow, Code2, CreditCard, Eye, Film, Flame, Frown, Ghost,
  Hash, Image, KeyRound, LayoutGrid, Mail, Meh, MessageCircle, Monitor, PartyPopper, ScanFace, Smile, Sparkles, Star, Sun, Terminal, TrendingUp, Tv, Type,
  Upload, Zap, Angry, ListChecks, Gauge, type LucideIcon,
} from 'lucide-react';
import { PRESENTATION_ANIMATIONS } from '../../src/avatar-presentation';
import { AvatarPresentation } from '../../src/avatar-presentation';
import { ALL_UI_COMPONENTS } from './catalog';
export type PresentationSection = 'motions' | 'expressions' | 'effects' | 'notifications' | 'cards';

/** Plain names for the ids (ITEMS-I5): first capital, words instead of codes. */
const NAMES: Record<string, string> = {
  msg: 'Message', sms_otp: 'Text code', otp: 'One-time code', faceid: 'Face check', applepay: 'Phone wallet', gif: 'GIF', starfield: 'Star field',
};
export const plainName = (id: string) => NAMES[id] ?? (id.charAt(0).toUpperCase() + id.slice(1)).replace(/_/g, ' ');

const EFFECT_ICONS: Record<string, LucideIcon> = {
  matrix: Code2, emoji: Smile, snow: CloudSnow, fireflies: Sparkles, starfield: Star, rain: CloudRain, fire: Flame, lightning: Zap,
  aurora: Sun, glitch: Tv, scanlines: Monitor, hologram: Ghost, vignette: Eye, confetti: PartyPopper,
};
const EXPRESSION_ICONS: Record<string, LucideIcon> = { neutral: Meh, smile: Smile, angry: Angry, sad: Frown, surprised: CircleHelp, thinking: Brain };
/** Notification samples in groups (ITEMS-I5); a type outside every group still shows, after them. */
const NOTIFICATION_GROUPS: Array<{ label: string; Icon: LucideIcon; types: readonly string[] }> = [
  { label: 'Messages', Icon: MessageCircle, types: ['msg', 'email', 'whatsapp', 'telegram', 'discord'] },
  { label: 'Social', Icon: AtSign, types: ['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'snapchat', 'youtube', 'reddit', 'twitch', 'gif'] },
  { label: 'Tasks', Icon: CheckSquare, types: ['task', 'approval', 'calendar', 'terminal'] },
  { label: 'Money', Icon: Banknote, types: ['stripe', 'paypal', 'bank', 'applepay', 'stock'] },
  { label: 'Security', Icon: KeyRound, types: ['otp', 'sms_otp', 'faceid'] },
];
const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  msg: MessageCircle, email: Mail, task: ListChecks, approval: CheckSquare, calendar: Calendar, terminal: Terminal, stock: TrendingUp, bank: Banknote,
  stripe: CreditCard, paypal: CreditCard, applepay: CreditCard, otp: KeyRound, sms_otp: KeyRound, faceid: ScanFace, gif: Image, youtube: Film, twitch: Tv,
};
const CARD_ICONS: Record<string, LucideIcon> = { Demo: Sparkles, Layout: LayoutGrid, Typography: Type, Data: Gauge, Charts: BarChart3, Interactive: Bot };

/**
 * Content slots inside the existing library and character docks; never an overlay toolbar. Items as picture tiles with
 * plain names (ITEMS-I5); `target` lets the Items Moves section share one "Plays on" for every source (ITEMS-I4).
 */
export function PresentationControls({ controller, section, agents, search = '', includeAvailableMotions = false, target: sharedTarget }: {
  controller: AvatarPresentation; section: PresentationSection; agents: Array<{ id: string; name: string }>; search?: string; includeAvailableMotions?: boolean;
  /** The avatar these moves and faces play on, chosen once by the caller; the section's own picker otherwise. */
  target?: string | undefined;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [category, setCategory] = useState('all');
  const available = [...PRESENTATION_ANIMATIONS.map(row => ({ id: row.id, label: row.label, categories: motionCategories(row.clip) })), ...avatarMotionEntries().map(row => ({ id: row.id, label: row.name, categories: motionCategories(row.name, row.category) }))];
  const filtered = available.filter(row => row.label.toLowerCase().includes(search.toLowerCase()) && (category === 'all' || row.categories.some(value => value === category)));
  const [ownTarget, setTarget] = useState('self'), [error, setError] = useState('');
  const target = sharedTarget ?? ownTarget;
  const execute = (event: unknown) => setError(controller.execute(event) ?? '');
  const matches = (value: string) => `${value} ${plainName(value)}`.toLowerCase().includes(search.toLowerCase());
  const tile = (key: string, label: string, Icon: LucideIcon, onClick: () => void, active = false) => <button key={key} type="button" onClick={onClick} aria-pressed={active} title={label}
    className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold ${active ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'}`}><Icon className="size-5" strokeWidth={1.8} aria-hidden /><span className="w-full truncate text-center">{label}</span></button>;
  const grid = 'grid grid-cols-3 gap-1.5';
  const heading = (text: string) => <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">{text}</h3>;
  const notify = (type: string) => execute({ kind: 'notification', notification: { type, title: `${plainName(type)} preview`, body: 'Example notification — connect your application for live events.' } });
  const ungrouped = NOTIFICATION_TYPES.filter(type => !NOTIFICATION_GROUPS.some(group => group.types.includes(type)) && matches(type));
  return <section aria-label={`Avatar ${section}`} className="space-y-2 text-ink">
    {(section === 'motions' || section === 'expressions') && sharedTarget === undefined ? <label className="block text-xs font-bold">Plays on<select aria-label={`${section} target`} value={target} onChange={e => setTarget(e.target.value)} className="mt-1 block w-full rounded-lg bg-paper p-2"><option value="self">My avatar</option>{agents.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label> : null}
    {section === 'motions' ? <>
      {includeAvailableMotions ? <><label className="block text-xs">Category<select aria-label="Live motion category" value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full rounded bg-paper p-2"><option value="all">All motions</option>{[...new Set(available.flatMap(row => row.categories))].sort().map(row => <option key={row} value={row}>{row}</option>)}</select></label><p className="text-xs text-ink/60">{filtered.length} motions</p><div className={grid}>{filtered.slice(0, 60).map(row => tile(row.id, row.label, Sparkles, () => execute({ kind: 'animation', target, animation: row.id })))}</div>{filtered.length > 60 ? <p className="text-xs text-ink/60">Search to narrow these results.</p> : null}</> : null}
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-paper px-2 py-2 text-xs font-bold hover:bg-ink/10"><Upload className="size-3.5" aria-hidden />Import GLB motion<input aria-label="Import avatar motion" type="file" accept=".glb" className="sr-only" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { if (file.size > 16 * 1024 * 1024) throw new Error('Motion exceeds 16 MB.'); await controller.importMotion(target, file.name, await file.arrayBuffer()); setError(''); } catch (e) { setError(String(e)); } }} /></label>
      <div className={grid}>{state.motions.filter(row => row.target === target && matches(row.label)).map(row => tile(row.id, row.label, Sparkles, () => execute({ kind: 'animation', target, animation: row.id })))}</div>
    </> : null}
    {section === 'expressions' ? <>{heading('Faces')}<div className={grid}>{EXPRESSIONS.filter(matches).map(expression => tile(expression, plainName(expression), EXPRESSION_ICONS[expression] ?? Smile, () => execute({ kind: 'expression', target, expression })))}</div></> : null}
    {section === 'effects' ? <>{heading('Screen effects · click to turn on')}<div className={grid}>{EFFECTS.filter(matches).map(effect => tile(effect, plainName(effect), EFFECT_ICONS[effect] ?? Sparkles, () => execute({ kind: 'effect', effect, enabled: state.effects[effect] === undefined, duration: 60000 }), state.effects[effect] !== undefined))}</div>
      {EFFECTS.some(effect => state.effects[effect] !== undefined) ? <div className="space-y-1.5 rounded-xl border border-ink/10 p-2">{heading('On now')}{EFFECTS.filter(effect => state.effects[effect] !== undefined).map(effect => <label key={effect} className="flex items-center gap-2 text-xs font-bold"><span className="w-20 truncate">{plainName(effect)}</span><input aria-label={`${effect} intensity`} className="min-w-0 flex-1 accent-ink" type="range" min="0" max="1" step=".05" value={state.effects[effect]} onChange={e => execute({ kind: 'effect', effect, enabled: true, intensity: Number(e.target.value), duration: 60000 })} /><span className="w-8 text-right tabular-nums">{Math.round((state.effects[effect] ?? 0) * 100)}%</span></label>)}</div> : null}
      <button type="button" onClick={() => { for (const effect of EFFECTS) execute({ kind: 'effect', effect, enabled: false }); }} className="w-full rounded-xl bg-paper px-2 py-2 text-xs font-bold hover:bg-ink/10">Clear screen effects</button></> : null}
    {section === 'notifications' ? <><p className="text-xs text-ink/60">Preview cards. Your application supplies live events.</p>
      {NOTIFICATION_GROUPS.map(group => { const types = group.types.filter(type => (NOTIFICATION_TYPES as readonly string[]).includes(type) && matches(type)); return types.length ? <div key={group.label} className="space-y-1">{heading(group.label)}<div className={grid}>{types.map(type => tile(type, plainName(type), NOTIFICATION_ICONS[type] ?? group.Icon, () => notify(type)))}</div></div> : null; })}
      {ungrouped.length ? <div className={grid}>{ungrouped.map(type => tile(type, plainName(type), Bell, () => notify(type)))}</div> : null}</> : null}
    {section === 'cards' ? <><p className="text-xs text-ink/60">Card previews use example data.</p>
      {[...new Set(ALL_UI_COMPONENTS.map(row => row.category))].map(name => { const rows = ALL_UI_COMPONENTS.filter(row => row.category === name && matches(row.name)); return rows.length ? <div key={name} className="space-y-1">{heading(name)}<div className={grid}>{rows.map(row => tile(row.id, row.name.replace(/([a-z])([A-Z])/g, '$1 $2'), CARD_ICONS[name] ?? Hash, () => execute({ kind: 'card', title: row.name, spec: row.spec, duration: row.duration })))}</div></div> : null; })}</> : null}
    {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
  </section>;
}
