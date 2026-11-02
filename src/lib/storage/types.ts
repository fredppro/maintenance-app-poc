import type { Readable } from "node:stream";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StoredObjectStream {
  body: Readable;
  contentType: string;
  contentLength: number | null;
}

export class StorageObjectIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageObjectIntegrityError";
  }
}

export class StorageProviderError extends Error {
  constructor(operation: "read" | "write", options?: ErrorOptions) {
    super(`Object storage ${operation} failed`, options);
    this.name = "StorageProviderError";
  }
}

export interface StoredObjectInfo {
  key: string;
  size: number | null;
  lastModified: Date | null;
}

/** Object-store contract implemented for S3/MinIO and for local disk. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  putStream(
    key: string,
    body: Readable,
    contentType: string,
    contentLength: number,
    signal?: AbortSignal,
  ): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  getStream(key: string, signal?: AbortSignal): Promise<StoredObjectStream | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string): AsyncIterable<StoredObjectInfo>;
}
