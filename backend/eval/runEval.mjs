import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

const datasetPath = path.resolve(process.cwd(), 'eval/datasets/synthetic_privacy_contracts.json');
const k = Number(process.env.RAG_EVAL_TOP_K ?? 3);

function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function lexicalScore(query, docText) {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  let hits = 0;
  for (const token of tokenize(docText)) if (q.has(token)) hits++;
  return hits / q.size;
}

function percentile(values, p) {
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.min(100, Math.max(0, p));
  const idx = Math.round((clampedP / 100) * (sorted.length - 1));
  return sorted[idx];
}

function hasCitationMarker(answer) {
  return /\[SOURCE\s+\d+\]/i.test(answer);
}

async function main() {
  const raw = await fs.readFile(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);
  const chunkById = new Map(dataset.chunks.map((chunk) => [chunk.id, chunk]));

  let recallHits = 0;
  let citationPresenceHits = 0;
  let groundingProxyHits = 0;
  const latencies = [];

  for (const qa of dataset.qaPairs) {
    const t0 = performance.now();
    const ranked = dataset.chunks
      .map((chunk) => ({ id: chunk.id, score: lexicalScore(qa.question, chunk.content) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    latencies.push(performance.now() - t0);

    const retrievedIds = new Set(ranked.map((r) => r.id));
    const expected = new Set(qa.expectedEvidenceChunkIds);
    const hasAnyExpected = [...expected].some((id) => retrievedIds.has(id));
    if (hasAnyExpected) recallHits++;

    if (hasCitationMarker(qa.expectedAnswerWithCitations)) citationPresenceHits++;
    const groundingProxy = [...expected].every((id) => chunkById.has(id));
    if (groundingProxy) groundingProxyHits++;
  }

  const total = dataset.qaPairs.length || 1;
  const report = {
    dataset: dataset.name,
    retrieval: {
      [`recall@${k}`]: Number((recallHits / total).toFixed(3)),
    },
    answers: {
      citationPresenceRate: Number((citationPresenceHits / total).toFixed(3)),
      groundingProxyRate: Number((groundingProxyHits / total).toFixed(3)),
    },
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
    },
  };

  console.log('RAG Eval Report');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('RAG eval failed', err);
  process.exit(1);
});
