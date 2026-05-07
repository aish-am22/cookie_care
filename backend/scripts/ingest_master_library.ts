import { db } from '../src/infra/db.js';
import {
  buildClauseToSectionMap,
  loadMasterLibraryFromDisk,
  parseClauseVersion,
  splitClauseByNumberedHeadings,
} from '../src/services/drafting/masterLibrary.js';

async function ingestMasterLibrary(): Promise<void> {
  const masterLibrary = loadMasterLibraryFromDisk();
  const clauseSectionMap = buildClauseToSectionMap(masterLibrary);

  for (const clause of masterLibrary.clause_library) {
    const sectionMeta = clauseSectionMap.get(clause.id);
    const parts = splitClauseByNumberedHeadings(clause.text);

    await db.masterClause.upsert({
      where: { id: clause.id },
      create: {
        id: clause.id,
        title: clause.title,
        sectionId: sectionMeta?.sectionId,
        slotName: sectionMeta?.slotName,
        version: parseClauseVersion(clause.id),
        text: clause.text,
        status: clause.status,
        sourceDocuments: clause.source_documents,
      },
      update: {
        title: clause.title,
        sectionId: sectionMeta?.sectionId,
        slotName: sectionMeta?.slotName,
        version: parseClauseVersion(clause.id),
        text: clause.text,
        status: clause.status,
        sourceDocuments: clause.source_documents,
      },
    });

    await db.masterClausePart.deleteMany({ where: { clauseId: clause.id } });

    if (parts.length > 0) {
      await db.masterClausePart.createMany({
        data: parts.map((part) => ({
          id: `${clause.id}_part_${part.order}`,
          clauseId: clause.id,
          partOrder: part.order,
          heading: part.heading,
          text: part.text,
        })),
      });
    }
  }

  // keep sessions untouched; ingestion only updates master library
  console.log(`Ingested ${masterLibrary.clause_library.length} master clauses.`);
}

ingestMasterLibrary()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Master library ingestion failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
