ALTER TABLE "rateLimit" ADD COLUMN "id" TEXT;

UPDATE "rateLimit"
SET "id" = gen_random_uuid()::text
WHERE "id" IS NULL;

ALTER TABLE "rateLimit" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "rateLimit" DROP CONSTRAINT "rateLimit_pkey";
ALTER TABLE "rateLimit" ADD CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");
