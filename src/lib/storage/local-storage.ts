import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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

  async putStream(
    key: string,
    body: Readable,
    contentType: string,
    contentLength: number,
    signal?: AbortSignal,
  ) {
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      body.destroy?.();
      throw new Error("Invalid storage stream content length");
    }

    const target = this.resolve(key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(target), { recursive: true });
    let renamed = false;
    let published = false;
    try {
      await pipeline(
        body,
        createWriteStream(temporary, { flags: "wx" }),
        { signal },
      );
      const { size } = await stat(temporary);
      if (size !== contentLength) {
        throw new Error("Storage stream length did not match its declared content length");
      }
      await rename(temporary, target);
      renamed = true;
      await writeFile(`${target}.type`, contentType);
      published = true;
    } finally {
      await rm(temporary, { force: true });
      if (renamed && !published) {
        await Promise.all([
          rm(target, { force: true }),
          rm(`${target}.type`, { force: true }),
        ]);
      }
    }
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

  async getStream(
    key: string,
    signal?: AbortSignal,
  ): Promise<import("./types").StoredObjectStream | null> {
    const target = this.resolve(key);
    try {
      const [details, contentType] = await Promise.all([
        stat(target),
        readFile(`${target}.type`, "utf8").catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return "application/octet-stream";
          }
          throw error;
        }),
      ]);
      return {
        body: createReadStream(target, {
          highWaterMark: 64 * 1024,
          signal,
        }),
        contentType,
        contentLength: details.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    const target = this.resolve(key);
    await Promise.all([rm(target, { force: true }), rm(`${target}.type`, { force: true })]);
  }

  async *list(prefix?: string): AsyncIterable<StoredObjectInfo> {
    const root = path.resolve(this.root);
    const start = prefix ? this.resolve(prefix).replace(/[\\/]+$/, "") : root;
    const directories = [start];

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
