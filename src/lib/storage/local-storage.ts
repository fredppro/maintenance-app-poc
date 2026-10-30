import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, StoredObject, StoredObjectInfo } from "./types";

/** Development fallback that mimics a bucket on local disk. */
export class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, body: Buffer, contentType: string) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    await writeFile(`${target}.type`, contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.resolve(key);
    try {
      const [body, type] = await Promise.all([
        readFile(target),
        readFile(`${target}.type`, "utf8").catch(() => "application/octet-stream"),
      ]);
      return { body, contentType: type };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    const target = this.resolve(key);
    await Promise.all([rm(target, { force: true }), rm(`${target}.type`, { force: true })]);
  }

  async *list(): AsyncIterable<StoredObjectInfo> {
    const root = path.resolve(this.root);
    const directories = [root];

    while (directories.length > 0) {
      const directory = directories.pop();
      if (!directory) continue;
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }

      const regularFiles = new Set(
        entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
      );
      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          directories.push(absolutePath);
          continue;
        }
        if (
          !entry.isFile() ||
          (entry.name.endsWith(".type") &&
            regularFiles.has(entry.name.slice(0, -".type".length)))
        ) {
          continue;
        }

        const details = await stat(absolutePath);
        const key = path.relative(root, absolutePath).split(path.sep).join("/");
        yield {
          key,
          size: details.size,
          lastModified: details.mtime,
        };
      }
    }
  }
}
