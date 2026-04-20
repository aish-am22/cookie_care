import { type GeneratedContract } from '../../../types.js';
import { ai, model, Type } from '../ai/index.js';

export const generateContract = async (contractType: string, details: string, templateContent?: string): Promise<GeneratedContract> => {
  let generationPrompt: string;

  if (templateContent) {
    console.log(`[SERVER] Received request to generate contract from a template.`);
    generationPrompt = `
You are an expert legal AI assistant. Your task is to complete the provided contract template using the key details supplied by the user in a structured JSON format.
Diligently and accurately fill in the placeholders in the template (like "[Disclosing Party Name]", "[Effective Date]", "[Term]", etc.) with the corresponding values from the user's JSON details.
If a detail is provided by the user but has no clear placeholder in the template, try to incorporate it logically where it makes sense.
The final title should be taken from the template's likely title or a generic one if none is obvious.

**Contract Template to Complete:**
---
${templateContent}
---

**User's Key Details (JSON Format):**
---
${details}
---

Your output must be a JSON object with "title" and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
  } else {
    console.log(`[SERVER] Received request to generate a ${contractType} from scratch.`);
    generationPrompt = `
You are an expert legal AI specializing in contract drafting. Generate a standard, professional **${contractType}**.
Incorporate the following key details provided by the user in a structured JSON format:
---
${details}
---
The generated contract should be robust, clear, and follow best practices. 

Your output must be a JSON object with "title" (e.g., "Mutual Non-Disclosure Agreement") and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
  }

  const generationSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      content: { type: Type.STRING },
    },
    required: ['title', 'content'],
  };

  const result = await ai.models.generateContent({
    model,
    contents: generationPrompt,
    config: { responseMimeType: 'application/json', responseSchema: generationSchema },
  });

  const resultText = result.text;
  if (!resultText) throw new Error('AI contract generation returned an empty response.');

  return JSON.parse(resultText) as GeneratedContract;
};

// ---------------------------------------------------------------------------
// Contract Document Lifecycle (Phase A: Upload → Ingest → Ready)
// ---------------------------------------------------------------------------

import { db } from '../../infra/db.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { ingestDocument } from '../../ai/ingest/ingestionService.js';
import { ask as askRag } from '../../ai/qa/askService.js';
import type { AskResponse } from '../../ai/ingest/types.js';

/** Canonical contract ingest lifecycle states. Mirrors the Prisma ContractIngestStatus enum. */
export type ContractIngestStatus = 'UPLOADED' | 'INGESTING' | 'INDEXED' | 'READY' | 'FAILED';

export interface UploadContractInput {
  userId: string;
  filename: string;
  mimeType?: string;
  content?: string;
}

export interface ContractDocumentDTO {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: ContractIngestStatus;
  errorMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(doc: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: ContractIngestStatus;
  errorMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ContractDocumentDTO {
  return {
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    errorMsg: doc.errorMsg,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const uploadContractDocument = async (
  input: UploadContractInput
): Promise<ContractDocumentDTO> => {
  const { userId, filename, mimeType = 'text/plain', content } = input;
  const sizeBytes = content ? Buffer.byteLength(content, 'utf8') : 0;

  const doc = await db.contractDocument.create({
    data: { userId, filename, mimeType, sizeBytes, content, status: 'UPLOADED' },
  });
  return toDTO(doc);
};

export const ingestContractDocument = async (
  id: string,
  userId: string
): Promise<ContractDocumentDTO> => {
  const doc = await db.contractDocument.findUnique({ where: { id } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Contract not found.');
  if (doc.status !== 'UPLOADED') {
    throw new ValidationError(`Cannot ingest a contract in status "${doc.status}". Expected UPLOADED.`);
  }

  // Mark as INGESTING
  await db.contractDocument.update({ where: { id }, data: { status: 'INGESTING' } });

  if (!doc.content) {
    throw new ValidationError('Contract has no content to ingest.');
  }

  const ingestResult = await ingestDocument({
    content: doc.content,
    meta: {
      orgId: userId,
      userId,
      logicalDocumentId: (doc.metadata as { ragDocumentId?: string } | null)?.ragDocumentId,
      title: doc.filename,
      filename: doc.filename,
      mimeType: doc.mimeType,
      docType: 'CONTRACT',
      extra: { contractDocumentId: doc.id },
    },
  });

  if (ingestResult.status !== 'INDEXED') {
    const failed = await db.contractDocument.update({
      where: { id },
      data: { status: 'FAILED', errorMsg: ingestResult.errorMsg ?? 'Contract ingest failed' },
    });
    return toDTO(failed);
  }

  const updated = await db.contractDocument.update({
    where: { id },
    data: {
      status: 'READY',
      errorMsg: null,
      metadata: {
        ...(doc.metadata && typeof doc.metadata === 'object' ? (doc.metadata as object) : {}),
        ragDocumentId: ingestResult.documentId,
        ragVersionId: ingestResult.versionId,
      },
    },
  });
  return toDTO(updated);
};

export const getContractDocumentStatus = async (
  id: string,
  userId: string
): Promise<ContractDocumentDTO> => {
  const doc = await db.contractDocument.findUnique({ where: { id } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Contract not found.');
  return toDTO(doc);
};

export const askAboutContract = async (
  contractId: string,
  userId: string,
  question: string,
  topK?: number,
): Promise<AskResponse> => {
  const doc = await db.contractDocument.findUnique({ where: { id: contractId } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Contract not found.');
  if (doc.status !== 'READY' && doc.status !== 'INDEXED') {
    throw new ValidationError(
      `Contract is not ready for Q&A (current status: "${doc.status}"). Ingest the contract first.`
    );
  }
  const ragDocumentId = (doc.metadata as { ragDocumentId?: string } | null)?.ragDocumentId;
  if (!ragDocumentId) {
    throw new ValidationError('Contract is not linked to indexed RAG content. Re-ingest the contract first.');
  }

  const response = await askRag({
    orgId: userId,
    userId,
    question,
    documentId: ragDocumentId,
    docType: 'CONTRACT',
    topK,
  });
  return response;
};
