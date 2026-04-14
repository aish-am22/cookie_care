-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "ScanType" AS ENUM ('COOKIE', 'LEGAL', 'VULNERABILITY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "ScanStatus" AS ENUM ('COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScanRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ScanType" NOT NULL,
  "status" "ScanStatus" NOT NULL DEFAULT 'COMPLETED',
  "target" TEXT NOT NULL,
  "riskScore" INTEGER,
  "findings" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScanRecord_userId_idx" ON "ScanRecord"("userId");
CREATE INDEX IF NOT EXISTS "ScanRecord_type_idx" ON "ScanRecord"("type");
CREATE INDEX IF NOT EXISTS "ScanRecord_status_idx" ON "ScanRecord"("status");
CREATE INDEX IF NOT EXISTS "ScanRecord_createdAt_idx" ON "ScanRecord"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ScanRecord_userId_fkey'
  ) THEN
    ALTER TABLE "ScanRecord"
      ADD CONSTRAINT "ScanRecord_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Reconcile embedding drift for DocumentChunk.
-- Some dev DBs already have this state; new DBs should be able to reach it deterministically.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE EXTENSION vector (insufficient privilege).';
END $$;

DO $$
BEGIN
  IF to_regclass('public."DocumentChunk"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    ALTER TABLE "DocumentChunk"
      ADD COLUMN IF NOT EXISTS "embedding_vec" vector(768);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'DocumentChunk_embedding_vec_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "DocumentChunk_embedding_vec_idx" ON "DocumentChunk" USING ivfflat ("embedding_vec" vector_cosine_ops) WITH (lists = 100)';
    END IF;
  END IF;
END $$;
