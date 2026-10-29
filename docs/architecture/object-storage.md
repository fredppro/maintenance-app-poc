# Object storage

Development setup and application behavior for uploaded files. Live provider and region are unverified; see the [environment status record](../reference/environment-status.md).

## File storage

Equipment photos are stored outside the database. Postgres keeps only a
`StoredFile` metadata row; the bytes live in object storage and are served
through the authenticated `/api/files/[id]` route.

- **Accepted uploads:** single-frame PNG, JPEG, and WebP images only. The
  source file is capped at 5 MiB; the multipart request allows an additional
  64 KiB for encoding overhead. The server decodes and re-encodes each image,
  rejects images over 16 megapixels or 8,192 pixels on either edge, applies
  EXIF orientation, strips embedded metadata, and limits stored dimensions to
  4,096 pixels per edge. The normalized output must also be at most 5 MiB.
  Generic documents and animated/multi-page images are not supported.
- **Default (development):** with no `S3_*` variables, files are written under
  `.storage/`. Nothing else to set up.
- **MinIO (S3-compatible, local):** start it and create the bucket with
  `docker compose --profile storage up -d minio minio-init`, then uncomment the
  `S3_*` block in `.env` and restart `pnpm dev`. The MinIO console is at
  [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`).
- **Production:** set `S3_BUCKET` and credentials for AWS S3, MinIO, R2 or any
  S3-compatible service. Without `S3_BUCKET`, production refuses to store files.
