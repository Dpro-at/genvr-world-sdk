/** Files a character or motion import can use: models, and the textures that travel with them. */
export const IMPORT_FILE = /\.(fbx|glb|png|jpe?g|webp|tga)$/i;

/** The parts of a dropped folder the import needs: a name, its path inside the drop, and how to read it. */
interface DropEntry {
  isFile: boolean; isDirectory: boolean; name: string; fullPath: string;
  file?(success: (file: File) => void, failure?: (error: unknown) => void): void;
  createReader?(): { readEntries(success: (entries: DropEntry[]) => void, failure?: (error: unknown) => void): void };
}

/** A dropped file keeps its folder path, as a folder chosen with "Choose folder" does, so textures stay with their model. */
function withPath(file: File, path: string): File {
  if (path && !file.webkitRelativePath) Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
  return file;
}

async function readEntry(entry: DropEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push(withPath(file, entry.fullPath.replace(/^\//, '')));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // A folder reader hands its entries over in batches until an empty one.
    for (;;) {
      const batch = await new Promise<DropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await readEntry(child, out);
    }
  }
}

/** Everything dropped on the panel, folders opened; files only when the browser cannot open folders. */
export async function droppedFiles(data: Pick<DataTransfer, 'items' | 'files'>): Promise<File[]> {
  const entries = Array.from(data.items ?? [])
    .map((item) => (item.kind === 'file' && 'webkitGetAsEntry' in item ? (item.webkitGetAsEntry() as unknown as DropEntry | null) : null))
    .filter((entry): entry is DropEntry => Boolean(entry));
  if (!entries.length) return Array.from(data.files ?? []);
  const out: File[] = [];
  for (const entry of entries) await readEntry(entry, out);
  return out;
}
