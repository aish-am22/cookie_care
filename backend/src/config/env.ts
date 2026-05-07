import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().positive().default(12),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TRUST_PROXY: z.string().default('1'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  // ---------------------------------------------------------------------------
  // RAG pipeline configuration
  // ---------------------------------------------------------------------------
  /** Embedding provider: "stub" (default, no key needed) | "gemini" */
  RAG_EMBEDDING_PROVIDER: z.enum(['stub', 'gemini']).default('stub'),
  /** Gemini embedding model (used when RAG_EMBEDDING_PROVIDER=gemini). */
  RAG_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  /** Vector store backend: "memory" (default) | "prisma" */
  RAG_VECTOR_STORE: z.enum(['memory', 'prisma']).default('memory'),
  /** Gemini generation model for RAG answers. */
  RAG_GENERATION_MODEL: z.string().default('gemini-2.5-flash'),
  /** Set to "true" to force stub (deterministic) answer generation even when an API key is available. */
  RAG_STUB_GENERATION: z.enum(['true', 'false']).default('false'),
  /** Hybrid retrieval toggle + weighting (dense alpha, lexical 1-alpha). */
  RAG_HYBRID_ENABLED: z.enum(['true', 'false']).default('true'),
  RAG_HYBRID_ALPHA: z.coerce.number().min(0).max(1).default(0.7),
  RAG_HYBRID_CANDIDATE_MULTIPLIER: z.coerce.number().int().min(1).max(20).default(4),
  /** Deterministic second-stage reranking controls. */
  RAG_RERANK_ENABLED: z.enum(['true', 'false']).default('true'),
  RAG_RERANK_CANDIDATES: z.coerce.number().int().min(1).max(200).default(16),
  /** Chunking/token estimation controls. */
  RAG_TOKEN_ESTIMATOR: z.enum(['whitespace', 'char_approx']).default('whitespace'),
  RAG_TOKEN_CHAR_APPROX_RATIO: z.coerce.number().min(1).max(12).default(4),
  RAG_CHUNK_TARGET_TOKENS: z.coerce.number().int().min(32).max(2000).default(500),
  RAG_CHUNK_OVERLAP_TOKENS: z.coerce.number().int().min(0).max(500).default(80),
  RAG_CHUNK_MAX_PARAGRAPH_TOKENS: z.coerce.number().int().min(32).max(5000).default(700),
  RAG_CHUNK_MAX_SENTENCE_TOKENS: z.coerce.number().int().min(8).max(1000).default(240),
  /** Guardrails/eval knobs. */
  RAG_MIN_GROUNDED_SCORE: z.coerce.number().min(0).max(1).default(0.2),
  RAG_EVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(3),
}).refine((data) => Boolean(data.API_KEY || data.GEMINI_API_KEY), {
  message: 'API_KEY or GEMINI_API_KEY is required',
  path: ['API_KEY'],
});

export type Env = z.infer<typeof envSchema>;

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('❌ Invalid environment variables:', _parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = _parsed.data;
