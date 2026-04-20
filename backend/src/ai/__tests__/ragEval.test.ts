import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

describe('RAG eval utilities', () => {
  it('reports retrieval quality, citation correctness, and abstention metrics', async () => {
    const datasetPath = path.resolve(
      process.cwd(),
      'eval/datasets/synthetic_privacy_contracts.json',
    );
    const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
    const { evaluateDataset } = await import('../../../eval/ragEval.mjs');

    const report = evaluateDataset(dataset, { k: 3, abstainThreshold: 0.2 });

    expect(report.retrieval['hit@3']).toBe(1);
    expect(report.retrieval['recall@3']).toBe(1);
    expect(report.answers.citationCorrectnessRate).toBe(0.75);
    expect(report.answers.abstentionRateUnanswerable).toBe(1);
  });
});
