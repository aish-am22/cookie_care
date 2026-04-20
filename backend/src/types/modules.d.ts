declare module '*.mjs' {
  export const evaluateDataset: (dataset: unknown, options?: { k?: number; abstainThreshold?: number }) => {
    dataset: string;
    retrieval: Record<string, number>;
    answers: Record<string, number>;
    latencyMs: { p50: number; p95: number };
  };
}
