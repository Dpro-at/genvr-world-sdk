/**
 * A host's own chat in the Studio (GENVR-WORLD-01 board W1): the host answers the Studio chat with its
 * model and tells which world is open, where its folder is and who answers. The Studio tells the host
 * the open world (context); the host sends back what the chat shows (info). Tools still run in the Studio.
 */

export type StudioChatTab = 'build' | 'items' | 'avatar' | 'filming' | 'lab';

/** The world open in the Studio, as the host's chat should know it. */
export interface StudioContext {
  projectId: string;
  /** The world's name, as the person named it. */
  name: string;
  tab: StudioChatTab;
  /** The world's look: realistic, blocky, anime or voxel. */
  look: string;
  /** The land it was made from: valley, island, plain, mountains, or empty. */
  kind: string;
}

/** Who answers in the chat. */
export interface StudioChatAnswerer {
  name: string;
  /** A short second line, for example the model. */
  detail?: string;
  /** The face colour, #rrggbb. */
  color?: string;
}

/** What the chat shows about the place; sent by the host and changed at any time. */
export interface StudioChatInfo {
  /** The world's folder on this computer, shown as given. */
  folder?: string;
  answerer?: StudioChatAnswerer;
}

/** Host options for its chat: the first info, and an optional picker for who answers. */
export interface StudioChatOptions extends StudioChatInfo {
  /** Opens the host's own picker for who answers. */
  chooseAnswerer?: () => void;
}

/** What the Studio chat panel receives through the Studio host. */
export interface StudioChatPanel extends StudioChatInfo {
  place: StudioContext;
  chooseAnswerer?: () => void;
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** Keeps only well-formed fields, so a host mistake never breaks the panel. */
export function cleanChatInfo(value: unknown): StudioChatInfo {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out: StudioChatInfo = {};
  const folder = text(input.folder, 500);
  if (folder) out.folder = folder;
  const who = input.answerer && typeof input.answerer === 'object' ? (input.answerer as Record<string, unknown>) : null;
  const name = who ? text(who.name, 60) : undefined;
  if (who && name) {
    const answerer: StudioChatAnswerer = { name };
    const detail = text(who.detail, 60);
    if (detail) answerer.detail = detail;
    if (typeof who.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(who.color)) answerer.color = who.color;
    out.answerer = answerer;
  }
  return out;
}

/** The same world, tab, name, look and land: nothing to tell the host again. */
export const sameContext = (a: StudioContext | null, b: StudioContext) =>
  !!a && a.projectId === b.projectId && a.name === b.name && a.tab === b.tab && a.look === b.look && a.kind === b.kind;

/** Holds the chat info the host last sent; the Studio reads it with useSyncExternalStore. */
export function createChatStore(initial: StudioChatInfo) {
  let value = cleanChatInfo(initial);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: unknown) {
      value = cleanChatInfo(next);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type StudioChatStore = ReturnType<typeof createChatStore>;
