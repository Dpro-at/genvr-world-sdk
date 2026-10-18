import { findAvatarMotion, avatarMotionEntries, motionCategories } from '@genvr/runtime';
import { AvatarPresentationEvent, type PresentationNotification, type PresentationSpec } from '@genvr/assistant';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
export { AvatarPresentationEvent, EXPRESSIONS, EFFECTS, NOTIFICATION_TYPES } from '@genvr/assistant';
export type { PresentationNotification, PresentationSpec } from '@genvr/assistant';

export const PRESENTATION_ANIMATIONS = CORE_ANIMATIONS.map(row => ({ id: row.manifest.id, label: row.manifest.name, clip: row.clip }));
const aliases: Record<string, string> = { expr_wave: 'Wave', expr_think: 'Think', expr_happy: 'Cheer', expr_confident: 'Salute', expr_wonder: 'Cheer', expr_nod: 'Clap', expr_shrug: 'Stretch', talk: 'Point', talk_explain: 'Point', talk_calm: 'Think', talk_excited: 'Cheer', dance_hype: 'Dance', dance: 'Dance', run: 'Run', walk: 'Walk' };
export function resolvePresentationAnimation(id: string): string | null {
  if (id === 'idle') return id;
  if (findAvatarMotion(id)) return id;
  return PRESENTATION_ANIMATIONS.find(row => row.id === id || row.clip === id || row.clip === aliases[id])?.id ?? null;
}
export interface PresentationActions {
  approve?(notification: PresentationNotification): Promise<void>;
  reply?(notification: PresentationNotification, text: string): Promise<void>;
  draftReply?(notification: PresentationNotification): Promise<string>;
}
export interface AvatarPresentationOptions {
  enabled?: boolean;
  actions?: PresentationActions;
  /** Host events for the open project; return a disposer. */
  subscribe?(projectId: string, emit: (event: unknown) => string | null): () => void;
}
export interface PresentationState {
  notifications: Array<PresentationNotification & { id: string; repliedWith?: string }>;
  cards: Array<{ id: string; title: string; spec: PresentationSpec; duration: number }>;
  effects: Partial<Record<string, number>>;
  lastAction: string;
  motions: Array<{ target: string; id: string; label: string }>;
}
type Runtime = Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'> & Partial<Pick<GenvrRuntime, 'importAvatarMotion'>>;
/** One controller per mounted viewport. The assistant, host and sidebar use the same validated executor. */
export class AvatarPresentation {
  #state: PresentationState = { notifications: [], cards: [], effects: {}, lastAction: '', motions: [] };
  #listeners = new Set<() => void>();
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #disposed = false;
  #serial = 0;
  constructor(private runtime: () => Runtime | null, readonly options: AvatarPresentationOptions = {}) {}
  snapshot = () => this.#state;
  describe = () => 'Shared library: '+avatarMotionEntries().map(row=>`${row.id} (${row.name}, ${motionCategories(row.name, row.category).join('/')})`).join('; ')+'; Imported motion IDs: ' + this.#state.motions.map(row => `${row.id} (${row.label}, target ${row.target})`).join('; ');
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(next: Partial<PresentationState>) { this.#state = { ...this.#state, ...next }; for (const listener of this.#listeners) listener(); }
  #later(key: string, duration: number, task: () => void) {
    this.#cancel(key);
    this.#timers.set(key, setTimeout(() => { this.#timers.delete(key); if (!this.#disposed) task(); }, duration));
  }
  #cancel(key: string) { const timer = this.#timers.get(key); if (timer) clearTimeout(timer); this.#timers.delete(key); }
  execute = (input: unknown): string | null => {
    if (this.#disposed || this.options.enabled === false) return 'Avatar presentation is disabled.';
    const parsed = AvatarPresentationEvent.safeParse(input);
    if (!parsed.success) return 'Invalid avatar presentation event.';
    const event = parsed.data, rt = this.runtime();
    if (event.kind === 'animation' || event.kind === 'expression') {
      const target = event.target === 'self' ? 'self' : `host-agent:${event.target}`;
      if (!rt) return 'Avatar is not ready.';
      if (event.kind === 'animation') {
        const custom = this.#state.motions.find(row => row.target === event.target && row.id === event.animation);
        const id = custom?.id ?? resolvePresentationAnimation(event.animation);
        if (!id || !rt.presentAnimation(target, id)) return 'Animation or target is unavailable.';
        this.#later(`animation:${target}`, event.duration, () => { rt.presentAnimation(target, 'idle'); });
      } else {
        if (!rt.presentExpression(target, event.expression)) return 'The selected avatar has no supported facial controls, or the target is unavailable.';
        this.#later(`expression:${target}`, event.duration, () => { rt.presentExpression(target, 'neutral'); });
      }
    } else if (event.kind === 'effect') {
      const effects = { ...this.#state.effects };
      this.#cancel(`effect:${event.effect}`);
      if (event.enabled) { effects[event.effect] = event.intensity; this.#later(`effect:${event.effect}`, event.duration, () => { const next = { ...this.#state.effects }; delete next[event.effect]; this.#publish({ effects: next }); }); }
      else delete effects[event.effect];
      this.#publish({ effects });
    } else if (event.kind === 'notification') {
      const id = `notice-${++this.#serial}`;
      const notification = { ...event.notification, id };
      // A display event cannot create host action authority.
      notification.canReply = !!notification.canReply && !!this.options.actions?.reply;
      this.#publish({ notifications: [...this.#state.notifications.slice(-4), notification] });
      if (!notification.needsApproval) this.#later(id, event.duration, () => this.dismiss(id));
    } else if (event.kind === 'card') {
      const id = `card-${++this.#serial}`;
      this.#publish({ cards: [...this.#state.cards.slice(-2), { ...event, id }] });
      this.#later(id, event.duration, () => this.dismiss(id));
    } else this.clear();
    this.#publish({ lastAction: event.kind });
    return null;
  };
  async importMotion(target: string, label: string, data: ArrayBuffer, slot?: 'user-library'): Promise<void> {
    if (this.#disposed || this.options.enabled === false) throw new Error('Avatar presentation is disabled.');
    const replacing = slot && this.#state.motions.some(row => row.target === target && row.id === `motion:${slot}`);
    if (!replacing && this.#state.motions.length >= 32) throw new Error('At most 32 imported motions per viewport.');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(target) || data.byteLength > 16 * 1024 * 1024) throw new Error('Invalid motion input.');
    const rt = this.runtime(); if (!rt?.importAvatarMotion) throw new Error('Motion import is unavailable in this viewport.');
    const id = slot ? `motion:${slot}` : `motion:${++this.#serial}`;
    if (!await rt.importAvatarMotion(target === 'self' ? target : `host-agent:${target}`, id, data)) throw new Error('Avatar target is unavailable.');
    if (!this.#disposed) this.#publish({ motions: [...this.#state.motions.filter(row => row.target !== target || row.id !== id), { target, id, label: label.slice(0, 150) }], lastAction: 'motion imported' });
  }
    dismiss = (id: string) => { this.#cancel(id); this.#publish({ notifications: this.#state.notifications.filter(row => row.id !== id), cards: this.#state.cards.filter(row => row.id !== id) }); };
  async approve(id: string) {
    const notice = this.#state.notifications.find(row => row.id === id);
    if (!notice?.needsApproval || !this.options.actions?.approve) throw new Error('No approval action is connected.');
    await this.options.actions.approve(notice); if (!this.#disposed) this.dismiss(id);
  }
  async reply(id: string, text: string) {
    const notice = this.#state.notifications.find(row => row.id === id);
    if (!notice?.canReply || !text.trim() || !this.options.actions?.reply) throw new Error('Reply is unavailable.');
    await this.options.actions.reply(notice, text.trim());
    if (!this.#disposed) this.#publish({ notifications: this.#state.notifications.map(row => row.id === id ? { ...row, repliedWith: text.trim() } : row) });
  }
  clear() {
    for (const [key, timer] of this.#timers) {
      clearTimeout(timer);
      if (key.startsWith('animation:')) this.runtime()?.presentAnimation(key.slice(10), 'idle');
      if (key.startsWith('expression:')) this.runtime()?.presentExpression(key.slice(11), 'neutral');
    }
    this.#timers.clear(); this.#publish({ notifications: [], cards: [], effects: {} });
  }
  dispose() { this.clear(); this.#disposed = true; this.#listeners.clear(); }
}
