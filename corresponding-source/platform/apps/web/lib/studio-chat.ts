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
  /** The host's earlier messages of this place's chat, oldest first (its own chat keeps them). */
  history?: StudioChatLine[];
  /** The names of the agents in this place, shown under who answers. */
  team?: string[];
}

/** One earlier line of the host's chat. */
export interface StudioChatLine {
  role: 'user' | 'assistant';
  text: string;
}

/** Host options for its chat: the first info, and an optional picker for who answers. */
export interface StudioChatOptions extends StudioChatInfo {
  /** Opens the host's own picker for who answers. */
  chooseAnswerer?: () => void;
  /** Opens this same chat in the host's own chat window ("Open in Chat"). */
  openChat?: () => void;
  /** Shows the place's folder in the computer's file manager (the folder line becomes a button). */
  openFolder?: () => void;
  /** The host's own chat answers: the message goes to it, its reply streams back, and its agent builds
   * with the place's tools over the live connection. Without it the Studio runs its own assistant. */
  send?: StudioChatSend;
}

/** Sends one message to the host's chat; resolves when the reply is done. */
export type StudioChatSend = (text: string, events: { onDelta: (text: string) => void; onTool?: (name: string, ok: boolean, result: string) => void }, signal: AbortSignal) => Promise<void>;

/** What the Studio chat panel receives through the Studio host. */
export interface StudioChatPanel extends StudioChatInfo {
  place: StudioContext;
  chooseAnswerer?: () => void;
  openChat?: () => void;
  openFolder?: () => void;
  send?: StudioChatSend;
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
  if (Array.isArray(input.history)) {
    const lines: StudioChatLine[] = [];
    for (const line of input.history.slice(-40)) {
      const row = line && typeof line === 'object' ? (line as Record<string, unknown>) : {};
      const said = typeof row.text === 'string' ? row.text.trim().slice(0, 20000) : '';
      if ((row.role === 'user' || row.role === 'assistant') && said) lines.push({ role: row.role, text: said });
    }
    if (lines.length) out.history = lines;
  }
  if (Array.isArray(input.team)) {
    const names = input.team.map((name) => text(name, 60)).filter((name): name is string => !!name).slice(0, 50);
    if (names.length) out.team = names;
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
