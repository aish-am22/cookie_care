<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15DXEGjSljpdsxfbdDu3tMPORdVlSz5hQ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Database
DATABASE_URL=postgresql://...

# AI
GEMINI_API_KEY=your_gemini_api_key

# JWT — required, no defaults, app will not start without these
JWT_ACCESS_SECRET=<strong-random-secret-min-32-chars>
JWT_REFRESH_SECRET=<strong-random-secret-min-32-chars>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# Server
PORT=3001
NODE_ENV=development

# CORS (production only)
ALLOWED_ORIGINS=https://yourapp.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

### Cookie-based Refresh Token

The refresh token is stored in an **httpOnly** cookie (`refresh_token`) with the following settings:
- `httpOnly: true` — not accessible via JavaScript
- `secure: true` in production, `false` in development
- `sameSite: strict` in production, `lax` in development
- `path: /api/auth` — scoped to auth endpoints only
- `maxAge: 30 days`

---

## API Contract Ownership (Phase A)

**Canonical backend contract lives in `backend/src/routes/` + `backend/src/controllers/` + `backend/src/services/`.**  
Frontend API wrappers in `api/*.ts` are typed client adapters — they must match backend contracts exactly.

### Four Core MVP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/contracts/upload` | Upload a contract document; returns `{ data: ContractDocument }` with `status: UPLOADED` |
| `POST` | `/api/contracts/:id/ingest` | Start RAG ingestion pipeline; transitions `UPLOADED → INGESTING → READY` |
| `GET`  | `/api/contracts/:id/status` | Poll the contract's ingest lifecycle status |
| `POST` | `/api/ask` | Ask a question about a `READY` contract via RAG; returns answer plus grounding metadata |

All four endpoints require a valid `Authorization: Bearer <accessToken>` header.

### Contract Ingest Status Model

```
UPLOADED → INGESTING → READY
                     → INDEXED   (Phase B: after embedding)
                     → FAILED    (on error)
```

### Response Envelopes

```jsonc
// Success
{ "data": { ... }, "meta"?: { ... } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details"?: ... } }
```

### Smoke Tests

See [`backend/test-contracts.http`](backend/test-contracts.http) for ready-to-run HTTP examples for all four core endpoints.


---

## RAG Foundation Scaffold

Cookie Care includes a production-ready **Retrieval-Augmented Generation (RAG)** pipeline for legal document intelligence. This section documents the architecture, how to run it locally without real legal documents, and how to interact with the API.

### Architecture Overview

```
                       ┌─────────────────────────────────────────────┐
                       │                RAG Pipeline                   │
                       │                                               │
  Upload ──►  DocumentParser  ──►  Chunker  ──►  EmbeddingProvider    │
                       │                              │                │
                       │                              ▼                │
                       │                         VectorStore           │
                       │                              │                │
  Question ──► RetrievalService ◄──────────────────────               │
                       │                                               │
                       ▼                                               │
                  AskService ──► LLM (Gemini / stub) ──► AskResponse  │
                       │                                               │
                       ▼                                               │
                  AiQueryLog (audit trace)                             │
                       └─────────────────────────────────────────────┘
```

#### Module Layout

```
backend/src/ai/
  ingest/
    types.ts           # Interfaces: DocumentParser, Chunker, EmbeddingProvider, VectorStore
    parser.ts          # PlainTextParser (HTML/text; PDF/DOCX adapters: TODO)
    chunker.ts         # DefaultChunker (clause-aware + word-boundary fallback)
    embedder.ts        # StubEmbeddingProvider (dev) + GeminiEmbeddingProvider (prod)
    vectorStore.ts     # InMemoryVectorStore (dev) + PrismaVectorStore (prod)
    ingestionService.ts# Orchestration: parse → chunk → embed → index
  retrieval/
    retrievalService.ts# Hybrid retrieval (dense + lexical) + optional reranking with orgId isolation
    lexicalRetriever.ts # Deterministic lexical signal (term-frequency scoring)
    reranker.ts         # Deterministic second-stage reranker interface/implementation
  qa/
    prompts.ts         # Legal-grade prompt templates + guardrails
    askService.ts      # Ask with citation-grade response + audit logging
  __tests__/
    chunker.test.ts
    retrieval.test.ts
    ask.test.ts
```

#### Data Models

| Model | Purpose |
|-------|---------|
| `RagDocument` | Top-level document with `orgId` isolation + `docType` + `status` |
| `DocumentVersion` | Immutable content snapshot; `contentHash` for dedup |
| `DocumentChunk` | Parsed chunk with `embedding` JSON, `sectionLabel`, page ranges |
| `AiQueryLog` | Full audit trace per query (user, org, retrieved ids, latency, model) |

---

### Running RAG Locally (No Real Documents Required)

The RAG pipeline works out of the box in **stub mode** — no external API keys, no vector DB, no real legal documents needed.

#### 1. Configure environment

Add to `backend/.env`:

```env
# RAG pipeline (all optional – defaults shown)
RAG_EMBEDDING_PROVIDER=stub      # "stub" (no key) | "gemini" (requires API key)
RAG_VECTOR_STORE=memory          # "memory" (no DB) | "prisma" (Postgres)
RAG_GENERATION_MODEL=gemini-2.5-flash
RAG_STUB_GENERATION=false        # Set "true" to skip real LLM even when key is present
RAG_EMBED_CONCURRENCY=4          # Max concurrent embedding requests
RAG_MODEL_TIMEOUT_MS=15000       # Timeout for embedding/generation model calls
RAG_EMBED_RETRIES=2              # Retries for embedding calls
RAG_EMBED_MAX_BATCH_SIZE=2000    # Max texts embedded in a single batch call
RAG_GENERATION_RETRIES=1         # Retries for generation calls
RAG_MAX_CONTEXT_TOKENS=1800      # Prompt context token budget (approx)
RAG_MAX_CONTEXT_CHUNKS=8         # Max retrieved chunks used in prompt
RAG_HYBRID_ENABLED=true          # Enable dense + lexical hybrid retrieval
RAG_HYBRID_ALPHA=0.7             # Dense weight (lexical weight is 1-alpha)
RAG_HYBRID_CANDIDATE_MULTIPLIER=4# Candidate expansion for hybrid merge
RAG_RERANK_ENABLED=true          # Enable second-stage deterministic reranking
RAG_RERANK_CANDIDATES=16         # Number of pre-rerank candidates
RAG_TOKEN_ESTIMATOR=whitespace   # "whitespace" | "char_approx"
RAG_TOKEN_CHAR_APPROX_RATIO=4    # chars/token heuristic when RAG_TOKEN_ESTIMATOR=char_approx
RAG_CHUNK_TARGET_TOKENS=500      # Default chunk target size
RAG_CHUNK_OVERLAP_TOKENS=80      # Chunk overlap
RAG_CHUNK_MAX_PARAGRAPH_TOKENS=700
RAG_CHUNK_MAX_SENTENCE_TOKENS=240
RAG_MIN_GROUNDED_SCORE=0.2       # Minimum cited score to treat answer as grounded
RAG_EVAL_TOP_K=3                 # Eval retrieval cut-off
```

#### 2. Start the backend

```bash
cd backend
npm run dev
```

#### 3. Authenticate

```bash
# Register / login to get an access token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpass"}'
# → { "data": { "accessToken": "eyJ..." } }
export TOKEN="eyJ..."
```

---

### Ingesting Sample Documents

```bash
# Ingest a plain-text contract (no file upload needed in dev mode)
curl -X POST http://localhost:3001/api/ai/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample NDA",
    "filename": "nda.txt",
    "mimeType": "text/plain",
    "docType": "CONTRACT",
    "content": "1. Confidentiality\nThe receiving party agrees to keep all disclosed information strictly confidential.\n\n2. Term\nThis agreement is effective for a period of two (2) years from the date of signing.\n\n3. Governing Law\nThis agreement shall be governed by the laws of India."
  }'
# → { "data": { "documentId": "...", "versionId": "...", "status": "INDEXED", "chunksIndexed": 3 } }
```

---

### Example API Requests / Responses

#### Debug Retrieval (`POST /api/ai/retrieve`)

```bash
curl -X POST http://localhost:3001/api/ai/retrieve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the confidentiality obligation?"}'
```

```json
{
  "data": {
    "chunks": [
      {
        "chunkIndex": 0,
        "content": "1. Confidentiality\nThe receiving party agrees to keep all disclosed information strictly confidential.",
        "sectionLabel": "1. Confidentiality",
        "score": 0.912,
        "documentId": "clxxx...",
        "documentTitle": "Sample NDA",
        "version": 1
      }
    ],
    "latencyMs": 12
  }
}
```

#### Ask with Citations (`POST /api/ai/ask`)

```bash
curl -X POST http://localhost:3001/api/ai/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "How long does the confidentiality obligation last?"}'
```

```json
{
  "data": {
    "answer": "Based on the document \"Sample NDA\" (2. Term): This agreement is effective for a period of two (2) years from the date of signing. [SOURCE 1]",
    "citations": [
      {
        "documentId": "clxxx...",
        "documentTitle": "Sample NDA",
        "versionId": "clyyy...",
        "version": 1,
        "sectionLabel": "2. Term",
        "snippet": "This agreement is effective for a period of two (2) years from the date of signing.",
        "score": 0.887
      }
    ],
    "confidence": "HIGH",
    "grounded": true,
    "needsHumanReview": false,
    "traceId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Insufficient Evidence Response

When no relevant context exists:

```json
{
  "data": {
    "answer": "INSUFFICIENT_EVIDENCE: No documents have been indexed for this organisation. Please ingest documents first.",
    "citations": [],
    "confidence": "INSUFFICIENT",
    "grounded": false,
    "needsHumanReview": true,
    "traceId": "..."
  }
}
```

---

### RAG API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ai/ingest` | Bearer | Ingest a document (parse → chunk → embed → index) |
| `POST` | `/api/ai/retrieve` | Bearer | Debug: return raw ranked chunks for a query |
| `POST` | `/api/ai/ask` | Bearer | Ask a question; returns answer + citations + confidence + grounding flags |

All endpoints enforce `orgId`-based tenant isolation (currently scoped to the authenticated user).

### Running Tests

```bash
cd backend
npm test
```

Tests cover:
- **Chunker**: basic invariants, size limits, section label preservation, hash correctness
- **Retrieval tenant isolation**: cross-org data never leaks, document/docType filters, topK limit
- **Ask schema**: response contract, insufficient-evidence path, grounding/citation fallback, traceId uniqueness
- **Ingestion lifecycle**: idempotent content hash skip + version activation behavior

### RAG Evaluation Harness

Synthetic privacy/contracts dataset:

`backend/eval/datasets/synthetic_privacy_contracts.json`

Run eval locally:

```bash
cd backend
npm run eval:rag
```

Report output includes:
- Retrieval metrics: `Hit@k` + `Recall@k`
- Answer checks: citation correctness rate + abstention rate on unanswerable questions
- Latency summary: `p50` / `p95` (offline eval runtime)

### Deploy / Operator Steps (manual)

1. Apply Prisma migrations:
```bash
cd backend
npx prisma migrate deploy
```
2. Ensure pgvector extension exists in Postgres:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
3. Regenerate Prisma client after schema/migration updates:
```bash
cd backend
npx prisma generate
```
4. Re-index existing contracts/documents (required after deploying ingestion/retrieval fixes):
   - Re-run contract ingest endpoint (`POST /api/contracts/:id/ingest`) for existing contracts.
   - Or re-ingest documents through `POST /api/ai/ingest`.
5. Required environment for production RAG:
   - `DATABASE_URL`
   - `GEMINI_API_KEY` (or `API_KEY`)
   - `RAG_EMBEDDING_PROVIDER=gemini`
   - `RAG_VECTOR_STORE=prisma`
   - `RAG_HYBRID_ENABLED=true`, `RAG_RERANK_ENABLED=true`
   - tune `RAG_HYBRID_ALPHA` (start at `0.7`) and `RAG_MIN_GROUNDED_SCORE` (start at `0.2`) per legal/privacy eval results
