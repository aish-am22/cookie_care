-- CreateEnum
CREATE TYPE "ContractIngestStatus" AS ENUM ('UPLOADED', 'INGESTING', 'INDEXED', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,
    "status" "ContractIngestStatus" NOT NULL DEFAULT 'UPLOADED',
    "errorMsg" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDocument_userId_idx" ON "ContractDocument"("userId");

-- CreateIndex
CREATE INDEX "ContractDocument_status_idx" ON "ContractDocument"("status");

-- CreateIndex
CREATE INDEX "ContractDocument_createdAt_idx" ON "ContractDocument"("createdAt");

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
