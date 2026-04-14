const SCHEMA_ERROR_CODES = new Set(['P2021', 'P2022']);

interface PrismaLikeError {
  code?: unknown;
  message?: unknown;
}

export function getPrismaErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as PrismaLikeError).code;
  return typeof code === 'string' ? code : undefined;
}

export function isPrismaSchemaError(err: unknown): boolean {
  const code = getPrismaErrorCode(err);
  return code !== undefined && SCHEMA_ERROR_CODES.has(code);
}

export function isAiCredentialError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('api key') &&
    (message.includes('invalid') ||
      message.includes('expired') ||
      message.includes('revoked') ||
      message.includes('not valid') ||
      message.includes('unauthorized'))
  );
}
