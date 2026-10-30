export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StoredObjectInfo {
  key: string;
  size: number | null;
  lastModified: Date | null;
}

/** Object-store contract implemented for S3/MinIO and for local disk. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  list(): AsyncIterable<StoredObjectInfo>;
}
