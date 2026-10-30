import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStorage, StoredObject, StoredObjectInfo } from "./types";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for MinIO or other S3-compatible services; omit for AWS S3. */
  endpoint?: string;
  forcePathStyle: boolean;
};

export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        body: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }

  async *list(): AsyncIterable<StoredObjectInfo> {
    let continuationToken: string | undefined;
    const seenTokens = new Set<string>();

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) {
          throw new Error("S3 list response contained an object without a key");
        }
        yield {
          key: object.Key,
          size: object.Size ?? null,
          lastModified: object.LastModified ?? null,
        };
      }
      if (page.IsTruncated && !page.NextContinuationToken) {
        throw new Error("S3 list response was truncated without a continuation token");
      }
      if (
        page.IsTruncated &&
        page.NextContinuationToken &&
        seenTokens.has(page.NextContinuationToken)
      ) {
        throw new Error("S3 list response repeated a continuation token");
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
      if (continuationToken) seenTokens.add(continuationToken);
    } while (continuationToken);
  }
}
