import { Directory, File, Paths } from 'expo-file-system';
import type { FileStore } from './fileStore';

const ROOT = 'tuur';

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** expo-file-system implementation storing everything under `<documents>/tuur`. */
export class ExpoFileStore implements FileStore {
  private dirFor(parts: string[]) {
    return new Directory(Paths.document, ROOT, ...parts);
  }
  private file(path: string): File {
    const parts = segments(path);
    const name = parts.pop()!;
    const dir = this.dirFor(parts);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return new File(dir, name);
  }
  async writeText(path: string, text: string) {
    const f = this.file(path);
    if (!f.exists) f.create({ overwrite: true });
    f.write(text);
  }
  async readText(path: string) {
    const f = this.file(path);
    return f.exists ? f.text() : null;
  }
  async exists(path: string) {
    const parts = segments(path);
    const f = new File(Paths.document, ROOT, ...parts);
    if (f.exists) return true;
    return new Directory(Paths.document, ROOT, ...parts).exists;
  }
  async remove(path: string) {
    const parts = segments(path);
    const f = new File(Paths.document, ROOT, ...parts);
    if (f.exists) f.delete();
    const d = new Directory(Paths.document, ROOT, ...parts);
    if (d.exists) d.delete();
  }
  async sizeOf(path: string) {
    const parts = segments(path);
    const f = new File(Paths.document, ROOT, ...parts);
    if (f.exists) return f.size ?? 0;
    const d = new Directory(Paths.document, ROOT, ...parts);
    if (!d.exists) return 0;
    let total = 0;
    const walk = (dir: Directory) => {
      for (const item of dir.list())
        total += item instanceof Directory ? (walk(item), 0) : ((item as File).size ?? 0);
    };
    walk(d);
    return total;
  }
  async freeBytes() {
    return Paths.availableDiskSpace;
  }
  toUrl(path: string) {
    return new File(Paths.document, ROOT, ...segments(path)).uri;
  }
  async download(url: string, path: string) {
    const target = this.file(path);
    if (target.exists) target.delete();
    const res = await File.downloadFileAsync(url, target);
    return res.size ?? 0;
  }
  async listDirs(path: string) {
    const d = new Directory(Paths.document, ROOT, ...segments(path));
    if (!d.exists) return [];
    return d
      .list()
      .filter((i): i is Directory => i instanceof Directory)
      .map((i) => i.name);
  }
}
