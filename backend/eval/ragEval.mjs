function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function lexicalScore(query, docText) {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  let hits = 0;
  for (const token of tokenize(docText)) if (q.has(token)) hits++;
  return hits / q.size;
}

export function percentile(values, p) {
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.min(100, Math.max(0, p));
  const idx = Math.round((clampedP / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function rankChunks(question, chunks, k) {
  return chunks
    .map((chunk) => ({ id: chunk.id, score: lexicalScore(question, chunk.content), content: chunk.content }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function parseSourceIndexes(answer) {
  const matches = [...String(answer).matchAll(/\[SOURCE\s+(\d+)\]/gi)];
  return matches.map((m) => Number(m[1])).filter((n) => Number.isInteger(n) && n > 0);
}

const MIN_WORD_BOUNDARY_CUTOFF = 60;
const SNIPPET_MAX_LENGTH = 120;

function generateDeterministicAnswer(question, ranked, abstainThreshold) {
  const top = ranked[0];
  if (!top || top.score < abstainThreshold) {
    return 'INSUFFICIENT_EVIDENCE: The provided documents do not contain enough information to answer this question.';
  }
  const snippet = top.content.slice(0, SNIPPET_MAX_LENGTH);
  const cutoff = snippet.lastIndexOf(' ');
  const naturalSnippet = cutoff > MIN_WORD_BOUNDARY_CUTOFF ? snippet.slice(0, cutoff) : snippet;
  return `${naturalSnippet} [SOURCE 1]`;
}

export function evaluateDataset(dataset, options = {}) {
  const k = Number(options.k ?? 3);
  const abstainThreshold = Number(options.abstainThreshold ?? 0.2);
  let retrievalRecallHits = 0;
  let retrievalHitHits = 0;
  let retrievalTotal = 0;
  let citationCorrectHits = 0;
  let citationTotal = 0;
  let abstentionHits = 0;
  let abstentionTotal = 0;
  const latencies = [];

  for (const qa of dataset.qaPairs) {
    const t0 = performance.now();
    const ranked = rankChunks(qa.question, dataset.chunks, k);
    latencies.push(performance.now() - t0);

    const expected = new Set(qa.expectedEvidenceChunkIds ?? []);
    const retrievedIds = ranked.map((r) => r.id);
    const isAnswerable = expected.size > 0;
    const answer = generateDeterministicAnswer(qa.question, ranked, abstainThreshold);
    const sourceIndexes = parseSourceIndexes(answer);
    const citedChunkIds = sourceIndexes
      .map((n) => ranked[n - 1]?.id)
      .filter(Boolean);

    if (isAnswerable) {
      retrievalTotal++;
      const overlapCount = retrievedIds.filter((id) => expected.has(id)).length;
      if (overlapCount > 0) retrievalHitHits++;
      if (overlapCount === expected.size) retrievalRecallHits++;

      citationTotal++;
      const citationIsCorrect = citedChunkIds.length > 0 && citedChunkIds.every((id) => expected.has(id));
      if (citationIsCorrect) citationCorrectHits++;
    } else {
      abstentionTotal++;
      if (answer.startsWith('INSUFFICIENT_EVIDENCE:')) abstentionHits++;
    }
  }

  return {
    dataset: dataset.name,
    retrieval: {
      [`hit@${k}`]: Number(((retrievalHitHits || 0) / Math.max(1, retrievalTotal)).toFixed(3)),
      [`recall@${k}`]: Number(((retrievalRecallHits || 0) / Math.max(1, retrievalTotal)).toFixed(3)),
    },
    answers: {
      citationCorrectnessRate: Number((citationCorrectHits / Math.max(1, citationTotal)).toFixed(3)),
      abstentionRateUnanswerable: Number((abstentionHits / Math.max(1, abstentionTotal)).toFixed(3)),
    },
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
    },
  };
}
