import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const temp = await mkdtemp(resolve(tmpdir(), 'genvr-sdk-pack-'));
const root = resolve(temp, 'package'); await mkdir(root);
await cp('dist', resolve(root, 'dist'), { recursive: true, filter: source => !source.endsWith('.tgz') });
await cp('demo', resolve(root, 'demo'), { recursive: true });
await cp('assets', resolve(root, 'assets'), { recursive: true });
await cp('README.md', resolve(root, 'README.md'));
await cp('LICENSE', resolve(root, 'LICENSE'));
await cp('serve.mjs', resolve(root, 'serve.mjs'));
await cp('serve-studio.mjs', resolve(root, 'serve-studio.mjs'));
const manifest = await readFile('dist/package-manifest.json', 'utf8');
await writeFile(resolve(root, 'package.json'), manifest);
const metadata = JSON.parse(manifest);
const archive = resolve('dist', `${metadata.name}-${metadata.version}.tgz`);
execFileSync('tar', ['-czf', archive, '-C', temp, 'package']);
console.log(archive);
// Corresponding source is a separate rebuildable workspace, never platform API/admin code or secrets.
const source = resolve(temp, 'source'), repo = resolve('../../..');
const packages = new Set(['world-sdk', 'runtime', 'contracts', 'core-library', 'assistant', 'validator', 'game', 'script', 'world', 'film', 'api-client']);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
const rootFiles = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'LICENSE', '.nvmrc']);
for (const file of new Set(files)) {
  const parts = file.split('/');
  const selected = rootFiles.has(file) || file.startsWith('patches/') || file === 'tooling/tsconfig.base.json' || file === 'tooling/human-bake/CREDITS.md'
    || (parts[0] === 'platform' && parts[1] === 'packages' && packages.has(parts[2]))
    || (file.startsWith('platform/apps/web/') && ['components', 'lib', 'public', 'package.json', 'tsconfig.json'].includes(parts[3]))
    || file === 'platform/apps/web/app/globals.css';
  if (!selected || parts.some(part => ['.env', 'node_modules', 'dist', '.next', '.data'].includes(part)) || file.endsWith('.tsbuildinfo')) continue;
  await mkdir(dirname(resolve(source, file)), { recursive: true });
  await cp(resolve(repo, file), resolve(source, file));
}
await cp('SOURCE.md', resolve(source, 'README.md'));
const sourceArchive = resolve('dist', `${metadata.name}-${metadata.version}-source.tgz`);
execFileSync('tar', ['-czf', sourceArchive, '-C', temp, 'source']);
console.log(sourceArchive);
