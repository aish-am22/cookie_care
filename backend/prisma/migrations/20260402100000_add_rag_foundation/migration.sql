-- CreateEnum
CREATE TYPE "RagDocumentType" AS ENUM ('CONTRACT', 'PLAYBOOK', 'TEMPLATE', 'POLICY', 'OTHER');

-- CreateEnum
CREATE TYPE "RagDocumentStatus" AS ENUM ('PENDING', 'INGESTING', 'INDEXED', 'FAILED');

-- CreateTable
CREATE TABLE "RagDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "docType" "RagDocumentType" NOT NULL DEFAULT 'OTHER',
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMsg" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "sectionLabel" TEXT,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQueryLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "traceId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "retrievedChunkIds" JSONB,
    "retrievedCount" INTEGER NOT NULL DEFAULT 0,
    "answer" TEXT,
    "confidence" TEXT,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiQueryLog_traceId_key" ON "AiQueryLog"("traceId");

-- CreateIndex
CREATE INDEX "RagDocument_orgId_idx" ON "RagDocument"("orgId");
CREATE INDEX "RagDocument_userId_idx" ON "RagDocument"("userId");
CREATE INDEX "RagDocument_docType_idx" ON "RagDocument"("docType");
CREATE INDEX "RagDocument_status_idx" ON "RagDocument"("status");
CREATE INDEX "RagDocument_createdAt_idx" ON "RagDocument"("createdAt");

CREATE INDEX "DocumentVersion_orgId_idx" ON "DocumentVersion"("orgId");
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");
CREATE INDEX "DocumentVersion_contentHash_idx" ON "DocumentVersion"("contentHash");

CREATE INDEX "DocumentChunk_orgId_idx" ON "DocumentChunk"("orgId");
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
CREATE INDEX "DocumentChunk_versionId_idx" ON "DocumentChunk"("versionId");
CREATE INDEX "DocumentChunk_contentHash_idx" ON "DocumentChunk"("contentHash");

CREATE INDEX "AiQueryLog_orgId_idx" ON "AiQueryLog"("orgId");
CREATE INDEX "AiQueryLog_userId_idx" ON "AiQueryLog"("userId");
CREATE INDEX "AiQueryLog_createdAt_idx" ON "AiQueryLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
