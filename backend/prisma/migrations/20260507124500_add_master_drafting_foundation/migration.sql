-- CreateTable
CREATE TABLE "MasterClause" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sectionId" TEXT,
    "slotName" TEXT,
    "version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceDocuments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterClause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterClausePart" (
    "id" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "partOrder" INTEGER NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterClausePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "renderFormat" TEXT NOT NULL DEFAULT 'html',
    "renderContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterClause_sectionId_idx" ON "MasterClause"("sectionId");

-- CreateIndex
CREATE INDEX "MasterClause_version_idx" ON "MasterClause"("version");

-- CreateIndex
CREATE INDEX "MasterClause_status_idx" ON "MasterClause"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MasterClausePart_clauseId_partOrder_key" ON "MasterClausePart"("clauseId", "partOrder");

-- CreateIndex
CREATE INDEX "MasterClausePart_clauseId_idx" ON "MasterClausePart"("clauseId");

-- CreateIndex
CREATE INDEX "DraftingSession_userId_idx" ON "DraftingSession"("userId");

-- CreateIndex
CREATE INDEX "DraftingSession_createdAt_idx" ON "DraftingSession"("createdAt");

-- AddForeignKey
ALTER TABLE "MasterClausePart" ADD CONSTRAINT "MasterClausePart_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "MasterClause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftingSession" ADD CONSTRAINT "DraftingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
