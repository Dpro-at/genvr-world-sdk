import { type ScriptModule } from './sandbox.js';
export type CompileResult = {
    ok: true;
} | {
    ok: false;
    message: string;
    line: number;
    column: number;
};
/**
 * Whether a script compiles as a classic script (spec 8, `script-syntax`), with the message, line and column of the
 * first syntax error. Nothing of the source runs. Asynchronous because the WebAssembly module is made on first use.
 */
export declare function compileCheck(source: string): Promise<CompileResult>;
/** The compile check in a given module (a worker module in Node: `@genvr/script/node`). Throws when it has no room. */
export declare function compileWith(module: ScriptModule, source: string): CompileResult;
