import { newGame, SCRIPT_LIMITS, WorldDocument, type PlaceScript } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  addScriptCommand,
  describeRequest,
  editorAvailable,
  filterLog,
  findingsOf,
  indent,
  lineCount,
  logTime,
  offsetOf,
  outputEntry,
  remoteChange,
  removeScriptCommand,
  replayFailureNote,
  replayLines,
  saveScriptCommand,
  scriptChecks,
  statusText,
  syntaxFinding,
  toggleScriptCommand,
} from './scripts-edit';
import { ScriptEngineTimeout } from './script-engine';

// Example scripts written for these tests (decision 119: named as examples, nothing game-shaped in the tool).

const script = (over: Partial<PlaceScript> = {}): PlaceScript => ({
  id: 'scr-0000aaaa',
  name: 'example',
  api: 1,
  enabled: true,
  source: "genvr.on('zone_crossed', (e) => {\n  genvr.log(e.id);\n});",
  ...over,
});

const doc = (scripts: PlaceScript[], game = true) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-1',
    version: 3,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances: [],
    ...(game ? { game: newGame() } : {}),
    scripts,
  });

describe('the Scripts list commands (one set_script each)', () => {
  it('switching sends one set_script with enabled flipped and the rest kept', () => {
    const on = script({ from: { itemId: 'user.example.counter', version: '1.0.0', sha256: 'a'.repeat(64) } });
    expect(toggleScriptCommand(on)).toEqual({
      type: 'set_script',
      params: {
        scriptId: 'scr-0000aaaa',
        script: { name: 'example', api: 1, enabled: false, source: on.source, from: on.from },
      },
    });
    expect(toggleScriptCommand(script({ enabled: false })).params).toMatchObject({
      script: { enabled: true },
    });
  });

  it('a store copy whose text changes becomes the place’s own script; a rename keeps the pin', () => {
    const copy = script({
      from: { itemId: 'user.example.counter', version: '1.0.0', sha256: 'a'.repeat(64) },
    });
    expect(saveScriptCommand(copy, 'genvr.log(2);').params).toEqual({
      scriptId: copy.id,
      script: { name: 'example', api: 1, enabled: true, source: 'genvr.log(2);' },
    });
    expect(saveScriptCommand({ ...copy, name: 'renamed' }, copy.source).params).toMatchObject({
      script: { name: 'renamed', from: copy.from },
    });
  });

  it('saving sends one set_script with the new text', () => {
    expect(saveScriptCommand(script(), 'genvr.log(1);')).toEqual({
      type: 'set_script',
      params: {
        scriptId: 'scr-0000aaaa',
        script: { name: 'example', api: 1, enabled: true, source: 'genvr.log(1);' },
      },
    });
  });

  it('adding names the script after the others and refuses past the limit', () => {
    const random = () => 0.5;
    const first = addScriptCommand([], random);
    expect(first).toMatchObject({ id: 'scr-80000000' });
    if (!('command' in first)) throw new Error('refused');
    expect(first.command).toMatchObject({
      type: 'set_script',
      params: { scriptId: 'scr-80000000', script: { name: 'Script 1', api: 1, enabled: true } },
    });
    const second = addScriptCommand(
      [script({ name: 'Script 1' }), script({ id: 'scr-0000bbbb', name: 'Script 2' })],
      random,
    );
    expect('command' in second && second.command.params).toMatchObject({ script: { name: 'Script 3' } });
    const full = Array.from({ length: SCRIPT_LIMITS.scripts }, (_, i) =>
      script({ id: `scr-0000000${i}`, name: `s${i}` }),
    );
    expect(addScriptCommand(full, random)).toEqual({
      error: `A place holds ${SCRIPT_LIMITS.scripts} scripts at most.`,
    });
  });

  it('removing sends set_script with null', () => {
    expect(removeScriptCommand('scr-0000aaaa')).toEqual({
      type: 'set_script',
      params: { scriptId: 'scr-0000aaaa', script: null },
    });
  });
});

describe('the desktop editor', () => {
  it('is offered on wide screens with a fine pointer only (phones and tablets see the list)', () => {
    expect(editorAvailable({ width: 1440, finePointer: true })).toBe(true);
    expect(editorAvailable({ width: 1024, finePointer: true })).toBe(true);
    expect(editorAvailable({ width: 812, finePointer: false })).toBe(false);
    expect(editorAvailable({ width: 375, finePointer: false })).toBe(false);
    // An iPad in landscape is wide but has a touch pointer.
    expect(editorAvailable({ width: 1366, finePointer: false })).toBe(false);
  });

  it('counts lines for the numbers beside the text', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a\nb\n')).toBe(3);
  });

  it('Tab indents two spaces at the caret, and each line of a selection; Shift+Tab takes them back', () => {
    expect(indent('ab', 1, 1, false)).toEqual({ value: 'a  b', start: 3, end: 3 });
    const text = 'one\ntwo\nthree';
    const more = indent(text, 1, 6, false);
    expect(more.value).toBe('  one\n  two\nthree');
    expect(more).toMatchObject({ start: 3, end: 10 });
    const back = indent(more.value, more.start, more.end, true);
    expect(back).toEqual({ value: text, start: 1, end: 6 });
    expect(indent(' x', 2, 2, true)).toEqual({ value: 'x', start: 1, end: 1 });
    expect(indent('x', 0, 0, true)).toEqual({ value: 'x', start: 0, end: 0 });
  });

  it('jumps to a line and column of a finding', () => {
    const text = 'a\nbcd\nef';
    expect(offsetOf(text, 1)).toBe(0);
    expect(offsetOf(text, 2, 3)).toBe(4);
    expect(offsetOf(text, 3)).toBe(6);
    expect(offsetOf(text, 9)).toBe(text.length);
    expect(offsetOf(text, 2, 99)).toBe(5);
  });

  it('keeps unsaved text when another builder saves the open script, and asks', () => {
    const opened = { base: 'a', draft: 'a' };
    expect(remoteChange(opened, script({ source: 'a' }))).toBe('none');
    expect(remoteChange(opened, script({ source: 'b' }))).toBe('take');
    expect(remoteChange({ base: 'a', draft: 'mine' }, script({ source: 'theirs' }))).toBe('conflict');
    expect(remoteChange({ base: 'a', draft: 'same' }, script({ source: 'same' }))).toBe('take');
    expect(remoteChange(opened, undefined)).toBe('removed');
  });
});

describe('findings and the log', () => {
  it('lists the findings of one script with the draft in place of the saved text', () => {
    const saved = script({ source: "genvr.on('nobody_raises_this', () => {});" });
    const report = scriptChecks(
      doc([saved, script({ id: 'scr-0000bbbb', name: 'other', enabled: false })]),
      saved.id,
      saved.source,
    );
    expect(report.map((finding) => finding.code)).toEqual(['script-unknown-event']);
    expect(report[0]!.script).toMatchObject({ id: saved.id, line: 1 });
    // The draft fixes it before it is saved.
    expect(scriptChecks(doc([saved]), saved.id, "genvr.on('zone_crossed', () => {});")).toEqual([]);
    // Without a game the script does not run.
    expect(scriptChecks(doc([saved], false), saved.id, saved.source).map((f) => f.code)).toContain(
      'script-no-game',
    );
    const findings = [
      { script: { id: 'scr-0000aaaa' }, code: 'a' },
      { code: 'b' },
      { script: { id: 'scr-0000bbbb' }, code: 'c' },
    ];
    expect(findingsOf(findings, 'scr-0000aaaa').map((f) => f.code)).toEqual(['a']);
  });

  it('turns a compile error into the same finding the API gives', () => {
    expect(syntaxFinding(script(), { ok: true })).toBeNull();
    expect(syntaxFinding(script(), { ok: false, message: "expecting ')'", line: 2, column: 5 })).toEqual({
      id: 'script-syntax:scr-0000aaaa',
      code: 'script-syntax',
      level: 'warning',
      message: `Script "example" does not compile (line 2, column 5): expecting ')'. It is saved but does not run.`,
      instanceIds: [],
      fix: null,
      script: { id: 'scr-0000aaaa', line: 2, column: 5 },
    });
  });

  it('filters the log to one script or shows all, and words the states', () => {
    const lines = [
      { at: 1000, script: 'example', level: 'log' as const, text: 'a' },
      { at: 2000, script: '', level: 'refused' as const, text: 'place' },
      { at: 3000, script: 'other', level: 'error' as const, text: 'b', line: 4 },
    ];
    expect(filterLog(lines, 'example').map((l) => l.text)).toEqual(['a', 'place']);
    expect(filterLog(lines, null)).toHaveLength(3);
    expect(logTime(65_400)).toBe('1:05');
    const wall = new Date(2026, 9, 1, 9, 5, 7).getTime();
    expect(logTime(wall)).toBe('09:05:07');
    expect(statusText(undefined)).toBe('On');
    expect(statusText({ state: 'running', strikes: 0, errors: 0 })).toBe('Running');
    expect(statusText({ state: 'running', strikes: 1, errors: 2 })).toBe('Running, 2 errors, 1 strike');
    expect(statusText({ state: 'off', strikes: 3, errors: 0 })).toBe('Off for this match, 3 strikes');
    expect(statusText({ state: 'not_compiled', strikes: 0, errors: 0 })).toBe('Does not compile');
  });

  it('shows room log lines in the studio Output with the script, the line and a level', () => {
    expect(outputEntry({ at: 1, script: 'example', level: 'log', text: 'pass p1' })).toEqual({
      text: 'Script "example": pass p1',
      level: 'info',
    });
    expect(outputEntry({ at: 1, script: 'example', level: 'error', text: 'boom', line: 3 })).toEqual({
      text: 'Script "example" line 3: boom',
      level: 'error',
    });
    expect(outputEntry({ at: 1, script: '', level: 'refused', text: 'over the place budget' })).toEqual({
      text: 'Scripts: over the place budget',
      level: 'warn',
    });
    expect(outputEntry({ at: 1, script: 'x', level: 'strike', text: 's' }).level).toBe('warn');
    expect(outputEntry({ at: 1, script: 'x', level: 'off', text: 'o' }).level).toBe('error');
  });

  it('words a replayed action request', () => {
    expect(
      describeRequest({
        action: { kind: 'add_counter', name: 'passes', by: 1 },
        actor: 'p1',
        accepted: true,
      }),
    ).toBe('p1: add_counter (name passes, by 1)');
    expect(
      describeRequest({
        action: { kind: 'end_match' },
        actor: null,
        accepted: false,
        why: 'over the budget',
      }),
    ).toBe('place: end_match, refused: over the budget');
    expect(
      describeRequest({
        action: { kind: 'show_message', text: 'hi', who: { player: 'actor' } },
        actor: 'p2',
        accepted: true,
      }),
    ).toBe('p2: show_message (text hi, who {"player":"actor"})');
  });
});

describe('a replay that fails', () => {
  it('says the script ran too long when the worker was stopped on its deadline (seen live, Task 11)', () => {
    expect(replayFailureNote(new ScriptEngineTimeout('dryRun'))).toBe(
      'The script ran too long and was stopped. Look for a loop that never ends.',
    );
  });

  it('keeps the general note for other failures (no recording read, a network error)', () => {
    expect(replayFailureNote(new Error('fetch failed'))).toBe('The replay could not run. Try again.');
    expect(replayFailureNote('nope')).toBe('The replay could not run. Try again.');
  });
});

describe('the replay pane', () => {
  it('shows the actions, then the errors, strikes and switch-off of the script (seen live, Task 11: a switched-off text showed only "0 actions")', () => {
    const lines = replayLines(
      {
        requested: [{ action: { kind: 'add_score', by: 1 }, actor: 'p1', accepted: true }],
        log: [
          { at: 0, script: 'example', level: 'start', text: 'running, 1 handler' },
          { at: 10, script: 'example', level: 'log', text: 'hello' },
          { at: 20, script: 'other', level: 'off', text: 'switched off until the next match: other' },
          { at: 30, script: 'example', level: 'strike', text: 'a handler ran too long (1 of 3)', line: 4 },
          {
            at: 40,
            script: 'example',
            level: 'off',
            text: 'switched off until the next match: top level failed',
          },
        ],
      },
      'example',
    );
    expect(lines).toEqual([
      'p1: add_score (by 1)',
      'strike: line 4 a handler ran too long (1 of 3)',
      'off: switched off until the next match: top level failed',
    ]);
  });
});
