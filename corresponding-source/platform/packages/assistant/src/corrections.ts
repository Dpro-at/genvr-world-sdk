import type { CommandPayload, CorrectionKind, CorrectionReport } from '@genvr/contracts';

/**
 * Correction logging (task P4-08): watches what a builder does right after an assistant reply
 * and turns it into preference data. Edits to things the reply made count as corrections
 * (moved, deleted, changed); undoing the reply counts as `undone`; a reply nobody touched until
 * the watch ends counts as `kept`.
 */

/** How long after a reply its things are watched. */
export const CORRECTION_WINDOW_MS = 10 * 60 * 1000;

/** Where a local change came from: an edit, or the undo and redo buttons. */
export type ChangeSource = 'edit' | 'undo' | 'redo';

/** Keys of command params that name placed things (not catalog items or groups). */
const TARGET_KEY = /^(id|ids|instanceId|instanceIds|roadId|wallId|waterId|openingId)$/;

/** The placed things (items, roads, walls, ...) a command names. */
export function commandTargets(command: CommandPayload): string[] {
  const found: string[] = [];
  const visit = (value: unknown, key: string | null) => {
    if (typeof value === 'string') {
      if (key && TARGET_KEY.test(key)) found.push(value);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry, key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  visit((command as { params?: unknown }).params, null);
  return [...new Set(found)];
}

/** What kind of correction a builder's command is. */
export function correctionKind(command: CommandPayload): Exclude<CorrectionKind, 'undone' | 'kept'> {
  if (/^(remove|delete)_/.test(command.type)) return 'deleted';
  if (/^(transform|move)_/.test(command.type)) return 'moved';
  return 'changed';
}

interface Watched {
  prompt: string;
  aiCommands: CommandPayload[];
  targets: Set<string>;
  endedAt: number;
  corrections: CorrectionReport['corrections'];
  /** The reply was undone (its whole undo step, P4-04). */
  undone: boolean;
  /** Builder commands since the reply that undo would take back first. */
  editsSince: number;
}

export class CorrectionTracker {
  #reply: Watched | null = null;
  #watched: Watched | null = null;

  constructor(
    /** Receives finished reports (the studio sends them to the API). */
    private readonly send: (report: CorrectionReport) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** A reply starts: the previous one's watch ends. */
  startReply(prompt: string): void {
    this.finish();
    this.#reply = {
      prompt,
      aiCommands: [],
      targets: new Set(),
      endedAt: 0,
      corrections: [],
      undone: false,
      editsSince: 0,
    };
  }

  /** A command the assistant applied (during the reply). */
  recordAi(command: CommandPayload): void {
    if (!this.#reply || this.#reply.aiCommands.length >= 200) return;
    this.#reply.aiCommands.push(command);
    for (const target of commandTargets(command)) this.#reply.targets.add(target);
  }

  /** The reply ended; the watch starts when it changed the world. */
  endReply(): void {
    const reply = this.#reply;
    this.#reply = null;
    if (!reply || reply.aiCommands.length === 0) return;
    reply.endedAt = this.now();
    this.#watched = reply;
  }

  /**
   * Every local change: during a reply it is the assistant's work (its tool calls apply as
   * normal commands); after the reply it may correct that work.
   */
  onChange(command: CommandPayload, source: ChangeSource): void {
    if (this.#reply) {
      if (source === 'edit') this.recordAi(command);
      return;
    }
    const watched = this.#watched;
    if (!watched) return;
    const afterMs = this.now() - watched.endedAt;
    if (afterMs > CORRECTION_WINDOW_MS) {
      this.finish();
      return;
    }
    if (source === 'undo') {
      // With no builder edits in between, undo takes back the reply itself (one step, P4-04).
      if (watched.editsSince > 0) watched.editsSince -= 1;
      else if (!watched.undone) {
        watched.undone = true;
        watched.corrections.push({ kind: 'undone', command: null, afterMs });
      }
      return;
    }
    watched.editsSince += 1;
    if (source === 'redo' || watched.corrections.length >= 50) return;
    if (!commandTargets(command).some((target) => watched.targets.has(target))) return;
    watched.corrections.push({ kind: correctionKind(command), command, afterMs });
  }

  /** Ends the current watch and sends its report (kept when nothing was corrected). */
  finish(): void {
    const watched = this.#watched;
    this.#watched = null;
    if (!watched) return;
    const corrections = watched.corrections.length
      ? watched.corrections
      : [
          {
            kind: 'kept' as const,
            command: null,
            afterMs: Math.min(this.now() - watched.endedAt, 3_600_000),
          },
        ];
    this.send({ prompt: watched.prompt, aiCommands: watched.aiCommands, corrections });
  }
}
