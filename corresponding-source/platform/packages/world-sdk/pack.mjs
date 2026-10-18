import { THEME_BOOT_SCRIPT } from '../../apps/web/lib/theme-script.ts';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, lstat, readdir, link, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
// Staging is read-only except the canonical HTML, which is detached before rewriting.
// Hard links avoid duplicating large assets; other filesystems fall back to copying.
async function copy(source, destination, options = {}) {
  if (options.filter && !options.filter(source, destination)) return;
  const info = await lstat(source);
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const child of await readdir(source)) await copy(resolve(source, child), resolve(destination, child), options);
  } else if (info.isFile()) {
    try { await link(source, destination); }
    catch (error) {
      if (error.code === 'EEXIST') { await unlink(destination); await copy(source, destination, options); }
      else await cp(source, destination, { mode: constants.COPYFILE_FICLONE });
    }
  } else await cp(source, destination, options);
}
const temp = await mkdtemp(resolve(tmpdir(), 'genvr-sdk-pack-'));
try {
const root = resolve(temp, 'package'); await mkdir(root);
await copy('dist', resolve(root, 'dist'), { recursive: true, filter: source => !source.endsWith('.tgz') && !source.endsWith('.map') });
// Package the canonical launcher, never a host's locally configured preview HTML.
const studioTemplate = await readFile('studio/index.html', 'utf8');
await unlink(resolve(root, 'dist/studio.html'));
await writeFile(resolve(root, 'dist/studio.html'), studioTemplate.replace('</head>', `<script>${THEME_BOOT_SCRIPT}</script></head>`));
await copy('demo', resolve(root, 'demo'), { recursive: true });
await copy('assets', resolve(root, 'assets'), { recursive: true });
await copy('skills', resolve(root, 'skills'), { recursive: true });
await copy('README.md', resolve(root, 'README.md'));
await copy('LICENSE', resolve(root, 'LICENSE'));
await copy('serve.mjs', resolve(root, 'serve.mjs'));
await copy('serve-studio.mjs', resolve(root, 'serve-studio.mjs'));
await copy('live-studio-bridge.mjs', resolve(root, 'live-studio-bridge.mjs'));
await copy('local-voice.mjs', resolve(root, 'local-voice.mjs'));
await copy('voice-worker.py', resolve(root, 'voice-worker.py'));
await copy('voice-requirements.txt', resolve(root, 'voice-requirements.txt'));
await copy('voice-demos.json', resolve(root, 'voice-demos.json'));
const manifest = await readFile('dist/package-manifest.json', 'utf8');
await writeFile(resolve(root, 'package.json'), manifest);
const metadata = JSON.parse(manifest);
const archive = resolve('dist', `${metadata.name}-${metadata.version}.tgz`);
execFileSync('tar', ['-czf', archive, '-C', temp, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
console.log(archive);
// Corresponding source is a separate rebuildable workspace, never platform API/admin code or secrets.
const source = resolve(temp, 'source'), repo = resolve('../../..');
const packages = new Set(['world-sdk', 'runtime', 'contracts', 'core-library', 'assistant', 'validator', 'game', 'script', 'world', 'film', 'api-client']);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
const rootFiles = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'LICENSE', '.nvmrc', 'docs/CORE-LIBRARY.md']);
for (const file of new Set(files)) {
  const parts = file.split('/');
  const selected = rootFiles.has(file) || file.startsWith('patches/') || file === 'tooling/tsconfig.base.json' || file === 'tooling/human-bake/CREDITS.md'
    || (parts[0] === 'platform' && parts[1] === 'packages' && packages.has(parts[2]))
    || (file.startsWith('platform/apps/web/') && ['components', 'lib', 'public', 'package.json', 'tsconfig.json'].includes(parts[3]))
    || file === 'platform/apps/web/app/globals.css';
  if (!selected || parts.some(part => ['.env', 'node_modules', 'dist', '.next', '.data'].includes(part)) || file.endsWith('.tsbuildinfo')) continue;
  await mkdir(dirname(resolve(source, file)), { recursive: true });
  await copy(resolve(repo, file), resolve(source, file));
}
await copy('SOURCE.md', resolve(source, 'README.md'));
const sourceArchive = resolve('dist', `${metadata.name}-${metadata.version}-source.tgz`);
execFileSync('tar', ['-czf', sourceArchive, '-C', temp, 'source'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
console.log(sourceArchive);

} finally { await rm(temp, { recursive: true, force: true }); }
