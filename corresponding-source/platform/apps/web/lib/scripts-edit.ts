import {
  SCRIPT_LIMITS,
  type CommandPayload,
  type PlaceScript,
  type PlaceScriptBody,
  type WorldDocument,
} from '@genvr/contracts';
import { checkScripts, type WorldFinding } from '@genvr/validator';

/**
 * The Scripts list and the desktop code editor of Place settings > Game (P2-10, spec 11): the pure parts. Every change
 * is one `set_script` command, so undo, co-building and the room's restart work as for any other edit.
 */

/** The code editor needs a wide screen and a mouse; phones and tablets see the list with its switches only. */
export function editorAvailable(media: { width: number; finePointer: boolean }): boolean {
  return media.width >= 1024 && media.finePointer;
}

/** The media query `editorAvailable` answers for the browser. */
export const EDITOR_MEDIA = '(min-width: 1024px) and (pointer: fine)';

const body = (script: PlaceScript): PlaceScriptBody => {
  const rest: Partial<PlaceScript> = { ...script };
  delete rest.id;
  return rest as PlaceScriptBody;
};

const command = (scriptId: string, script: PlaceScriptBody | null): CommandPayload => ({
  type: 'set_script',
  params: { scriptId, script },
});

/** The on/off switch: the same script with `enabled` flipped. */
export function toggleScriptCommand(script: PlaceScript): CommandPayload {
  return command(script.id, { ...body(script), enabled: !script.enabled });
}

/**
 * Save in the editor: the same script with new text. A store copy whose text changes becomes the place's own script
 * (its `from` pin is dropped): the pin says the text is an approved store version, which it no longer is.
 */
export function saveScriptCommand(script: PlaceScript, source: string): CommandPayload {
  const next = { ...body(script), source };
  if (source !== script.source) delete next.from;
  return command(script.id, next);
}

export function removeScriptCommand(scriptId: string): CommandPayload {
  return command(scriptId, null);
}

/** The text a new script starts with: a comment only, so it runs and does nothing. */
export const NEW_SCRIPT_SOURCE =
  "// Listens to the place's events and asks for the rules' actions. Example:\n// genvr.on('player_joined', (e) => genvr.log('joined', e.id));\n";

/** `scr-` and 8 hex characters, like the assistant's new scripts. */
export function newScriptId(random: () => number = Math.random): string {
  return `scr-${Math.floor(random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, '0')}`;
}

/** Add script: "Script N" after the names in use, switched on, with a starting comment. */
export function addScriptCommand(
  existing: readonly PlaceScript[],
  random: () => number = Math.random,
): { id: string; command: CommandPayload } | { error: string } {
  if (existing.length >= SCRIPT_LIMITS.scripts)
    return { error: `A place holds ${SCRIPT_LIMITS.scripts} scripts at most.` };
  const names = new Set(existing.map((script) => script.name));
  let n = existing.length + 1;
  while (names.has(`Script ${n}`)) n += 1;
  let id = newScriptId(random);
  while (existing.some((script) => script.id === id)) id = newScriptId();
  return {
    id,
    command: command(id, { name: `Script ${n}`, api: 1, enabled: true, source: NEW_SCRIPT_SOURCE }),
  };
}

/** Lines of a text, for the numbers beside it. */
export function lineCount(source: string): number {
  return source.split('\n').length;
}

const INDENT = '  ';

/**
 * Tab in the editor: two spaces at the caret, or before every line of a selection over several lines; Shift+Tab takes
 * up to two leading spaces off each line touched. Returns the new text and selection.
 */
export function indent(
  value: string,
  start: number,
  end: number,
  outdent: boolean,
): { value: string; start: number; end: number } {
  const multiLine = value.slice(start, end).includes('\n');
  if (!outdent && !multiLine) {
    const next = value.slice(0, start) + INDENT + value.slice(end);
    return { value: next, start: start + INDENT.length, end: start + INDENT.length };
  }
  const first = value.lastIndexOf('\n', start - 1) + 1;
  const lines = value.slice(first, end).split('\n');
  let shiftStart = 0;
  let shiftEnd = 0;
  const changed = lines.map((line, index) => {
    if (!outdent) {
      if (index === 0) shiftStart = INDENT.length;
      shiftEnd += INDENT.length;
      return INDENT + line;
    }
    const remove = line.startsWith(INDENT) ? 2 : line.startsWith(' ') ? 1 : 0;
    if (index === 0) shiftStart = -Math.min(remove, start - first);
    shiftEnd -= remove;
    return line.slice(remove);
  });
  const next = value.slice(0, first) + changed.join('\n') + value.slice(end);
  return { value: next, start: Math.max(first, start + shiftStart), end: Math.max(first, end + shiftEnd) };
}

/** Where line `line`, column `column` (both from 1) starts in the text, kept inside it (jump to a finding). */
export function offsetOf(source: string, line: number, column = 1): number {
  const lines = source.split('\n');
  if (line > lines.length) return source.length;
  let offset = 0;
  for (let i = 0; i < line - 1; i += 1) offset += lines[i]!.length + 1;
  return offset + Math.min(Math.max(0, column - 1), lines[line - 1]!.length);
}

/**
 * The saved script changed while it is open (another builder, the assistant, an undo): `none` when the saved text is
 * still what the editor loaded, `take` when the editor has no unsaved text (or the same), `conflict` when it has
 * ("Load theirs / Keep mine"), `removed` when the script is gone.
 */
export function remoteChange(
  opened: { base: string; draft: string },
  remote: PlaceScript | undefined,
): 'none' | 'take' | 'conflict' | 'removed' {
  if (!remote) return 'removed';
  if (remote.source === opened.base) return 'none';
  if (opened.draft === opened.base || opened.draft === remote.source) return 'take';
  return 'conflict';
}

/**
 * The validator's findings for one script, with the editor's text in place of the saved one: the script's own, and
 * those about the place's scripts as a whole (no game).
 */
export function scriptChecks(doc: WorldDocument, scriptId: string, draft: string): WorldFinding[] {
  const scripts = (doc.scripts ?? []).map((script) =>
    script.id === scriptId ? { ...script, source: draft } : script,
  );
  return checkScripts({ ...doc, scripts }).filter(
    (finding) => finding.script?.id === scriptId || (!finding.script && finding.code.startsWith('script-')),
  );
}

/** Findings about one script (they carry `script.id`). */
export function findingsOf<T extends { script?: { id: string } }>(
  findings: readonly T[],
  scriptId: string,
): T[] {
  return findings.filter((finding) => finding.script?.id === scriptId);
}

/** A compile error as the finding the API's Checks give (`script-syntax`); null when it compiles. */
export function syntaxFinding(
  script: Pick<PlaceScript, 'id' | 'name'>,
  compiled: { ok: true } | { ok: false; message: string; line: number; column: number },
): WorldFinding | null {
  if (compiled.ok) return null;
  return {
    id: `script-syntax:${script.id}`,
    code: 'script-syntax',
    level: 'warning',
    message: `Script "${script.name}" does not compile (line ${compiled.line}, column ${compiled.column}): ${compiled.message}. It is saved but does not run.`,
    instanceIds: [],
    fix: null,
    script: { id: script.id, line: compiled.line, column: compiled.column },
  };
}

export interface LogLine {
  at: number;
  script: string;
  level: 'log' | 'error' | 'refused' | 'strike' | 'off' | 'start';
  text: string;
  line?: number;
}

/** The log of one script (and the lines about the whole place), or all of it with null. */
export function filterLog<T extends Pick<LogLine, 'script'>>(lines: readonly T[], name: string | null): T[] {
  return name === null ? [...lines] : lines.filter((line) => line.script === name || line.script === '');
}

/**
 * A log time: the room's clock is wall time (ms since 1970), shown as the local time of day (hh:mm:ss); a short clock
 * (a dry run counts from 0) as m:ss.
 */
export function logTime(at: number): string {
  const two = (n: number) => String(n).padStart(2, '0');
  if (at >= 1e11) {
    const date = new Date(at);
    return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  }
  const seconds = Math.max(0, Math.floor(at / 1000));
  return `${Math.floor(seconds / 60)}:${two(seconds % 60)}`;
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A switched-on script's state in the open rooms, in words for the list ("On" while no room runs it). */
export function statusText(
  status: { state: 'running' | 'off' | 'not_compiled'; strikes: number; errors: number } | undefined,
): string {
  if (!status) return 'On';
  const head =
    status.state === 'running'
      ? 'Running'
      : status.state === 'off'
        ? 'Off for this match'
        : 'Does not compile';
  const parts = [
    head,
    ...(status.errors > 0 ? [count(status.errors, 'error')] : []),
    ...(status.strikes > 0 ? [count(status.strikes, 'strike')] : []),
  ];
  return parts.join(', ');
}

/** A script log line as a studio Output entry (P2-10): the script's name, the line it came from, and how bad it is. */
export function outputEntry(line: LogLine): { text: string; level: 'info' | 'warn' | 'error' } {
  const where = line.script ? `Script "${line.script}"${line.line ? ` line ${line.line}` : ''}` : 'Scripts';
  const level =
    line.level === 'error' || line.level === 'off'
      ? 'error'
      : line.level === 'refused' || line.level === 'strike'
        ? 'warn'
        : 'info';
  return { text: `${where}: ${line.text}`, level };
}

/** An action a script asked for in a replay, in one line: who, what, and whether the engine did it. */
export function describeRequest(request: {
  /** The action as the script gave it (a refused one may not even be an object). */
  action: unknown;
  actor: string | null;
  accepted: boolean;
  why?: string;
}): string {
  const action =
    typeof request.action === 'object' && request.action !== null
      ? (request.action as Record<string, unknown>)
      : { kind: String(request.action) };
  const { kind, ...rest } = action;
  const fields = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');
  const what = `${request.actor ?? 'place'}: ${String(kind ?? 'action')}${fields ? ` (${fields})` : ''}`;
  return request.accepted ? what : `${what}, refused${request.why ? `: ${request.why}` : ''}`;
}

/**
 * The note of a replay that failed: the engine's own words when its worker was stopped on the deadline (a script that
 * never yields), else a general note. Seen live (Task 11): a hostile text ended in "could not run", which hid the cause.
 */
export function replayFailureNote(error: unknown): string {
  return error instanceof Error && error.name === 'ScriptEngineTimeout'
    ? error.message
    : 'The replay could not run. Try again.';
}

/**
 * The lines of the replay pane: each action the script asked for, then what went wrong with the script in the replay
 * (its errors, strikes and the switch-off, with the line when known). Without the last part a text switched off at the
 * top level showed only "0 actions" (seen live, Task 11).
 */
export function replayLines(
  result: {
    requested: ReadonlyArray<Parameters<typeof describeRequest>[0]>;
    log: ReadonlyArray<{ at?: number; script: string; level: string; text: string; line?: number }>;
  },
  scriptName: string,
): string[] {
  const problems = result.log
    .filter(
      (line) =>
        line.script === scriptName &&
        (line.level === 'error' || line.level === 'strike' || line.level === 'off'),
    )
    .map((line) => `${line.level}: ${line.line ? `line ${line.line} ` : ''}${line.text}`);
  return [...result.requested.map((request) => describeRequest(request)), ...problems];
}
