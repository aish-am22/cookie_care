import fs from 'fs/promises';
import path from 'path';
import { evaluateDataset } from './ragEval.mjs';

const datasetPath = path.resolve(process.cwd(), 'eval/datasets/synthetic_privacy_contracts.json');
const k = Number(process.env.RAG_EVAL_TOP_K ?? 3);

async function main() {
  const raw = await fs.readFile(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);
  const report = evaluateDataset(dataset, { k });

  console.log('RAG Eval Report');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('RAG eval failed', err);
  process.exit(1);
});
