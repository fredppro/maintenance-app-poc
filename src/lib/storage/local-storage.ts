import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, StoredObject } from "./types";

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
}
