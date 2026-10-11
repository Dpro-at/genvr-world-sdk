import { rm } from 'node:fs/promises';
// Only generated output beside this build script is cleared, never a caller-supplied path.
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
