import { describe, expect, it } from 'vitest';
import { compileCheck } from '../src/index.js';

describe('compileCheck: syntax only, nothing runs (spec 8)', () => {
  it('accepts a script that compiles without running it', async () => {
    // Running it would loop forever and throw; compiling does neither.
    expect(await compileCheck(`while (true) {}\nthrow new Error('never');`)).toEqual({ ok: true });
    expect(await compileCheck('')).toEqual({ ok: true });
  });

  it('gives the message, line and column of a syntax error', async () => {
    const result = await compileCheck("genvr.on('hit', () => {\n  genvr.log(\n});");
    expect(result).toMatchObject({ ok: false, line: 3 });
    if (result.ok) throw new Error('expected a syntax error');
    expect(result.message).toMatch(/^SyntaxError: /);
    expect(result.column).toBeGreaterThanOrEqual(1);
  });

  it('refuses module syntax: scripts are classic scripts', async () => {
    expect(await compileCheck("import x from 'y';")).toMatchObject({ ok: false, line: 1 });
    expect(await compileCheck('export const a = 1;')).toMatchObject({ ok: false, line: 1 });
  });

  it('checks many sources one after another', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => compileCheck(i % 2 ? `let a${i} = ${i};` : `let = ;`)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(20);
  });
});
