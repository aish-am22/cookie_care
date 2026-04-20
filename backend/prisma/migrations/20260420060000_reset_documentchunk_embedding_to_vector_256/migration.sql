-- Reset DocumentChunk embedding storage to a single pgvector(256) column.
-- This intentionally drops existing embedding values to clear 768-dim legacy vectors.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE EXTENSION vector (insufficient privilege).';
END $$;

DROP INDEX IF EXISTS "DocumentChunk_embedding_vec_idx";
DROP INDEX IF EXISTS "DocumentChunk_embedding_idx";

ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "embedding_vec";
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "embedding";

ALTER TABLE "DocumentChunk"
  ADD COLUMN "embedding" vector(256);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
