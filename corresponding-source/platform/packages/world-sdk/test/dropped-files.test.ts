import { describe, expect, it } from 'vitest';
import { droppedFiles, IMPORT_FILE } from '../studio/dropped-files';

/** A minimal stand-in for the browser's dropped folder entries. */
const fileEntry = (path: string) => ({ isFile: true, isDirectory: false, name: path.split('/').at(-1)!, fullPath: '/' + path, file: (ok: (f: File) => void) => ok(new File(['x'], path.split('/').at(-1)!)) });
const folderEntry = (path: string, children: unknown[]) => {
  let given = false;
  return { isFile: false, isDirectory: true, name: path, fullPath: '/' + path, createReader: () => ({ readEntries: (ok: (e: unknown[]) => void) => { ok(given ? [] : children); given = true; } }) };
};
const drop = (entries: unknown[], files: File[] = []) => ({ items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })), files }) as unknown as DataTransfer;

describe('dropping files on My characters / My motions (board A13)', () => {
  it('opens a dropped folder and keeps each file\'s path, so textures stay with their model', async () => {
    const files = await droppedFiles(drop([folderEntry('boss', [fileEntry('boss/boss.fbx'), folderEntry('boss/textures', [fileEntry('boss/textures/skin.png')])])]));
    expect(files.map((f) => [f.name, f.webkitRelativePath])).toEqual([['boss.fbx', 'boss/boss.fbx'], ['skin.png', 'boss/textures/skin.png']]);
  });
  it('takes plain dropped files, and the file list when the browser cannot open entries', async () => {
    expect((await droppedFiles(drop([fileEntry('a.glb'), fileEntry('notes.txt')]))).map((f) => f.name)).toEqual(['a.glb', 'notes.txt']);
    const plain = new File(['x'], 'b.glb');
    expect(await droppedFiles({ items: [] as unknown as DataTransferItemList, files: [plain] as unknown as FileList })).toEqual([plain]);
  });
  it('knows which files the import can use', () => {
    expect(['a.FBX', 'b.glb', 'c.png', 'd.jpeg', 'e.tga'].every((n) => IMPORT_FILE.test(n))).toBe(true);
    expect(IMPORT_FILE.test('notes.txt')).toBe(false);
  });
});
