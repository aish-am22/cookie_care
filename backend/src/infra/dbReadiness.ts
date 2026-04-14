import logger from './logger.js';
import { db } from './db.js';

const REQUIRED_TABLES = [
  'User',
  'Session',
  'PasswordResetToken',
  'EmailVerificationToken',
  'AuditLog',
  'ContractDocument',
  'RagDocument',
  'DocumentVersion',
  'DocumentChunk',
  'AiQueryLog',
  'ScanRecord',
] as const;

async function findMissingTables(): Promise<string[]> {
  const tableNames = REQUIRED_TABLES.map((name) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid table name in readiness check: ${name}`);
    }
    return name;
  });

  const rows = await db.$queryRaw<Array<{ table_name: string; table_regclass: string | null }>>`
    SELECT required.table_name, to_regclass(format('public.%I', required.table_name))::text AS table_regclass
    FROM unnest(${tableNames}) AS required(table_name)
  `;

  return rows.filter((row) => row.table_regclass === null).map((row) => row.table_name);
}

export async function assertDatabaseReady(): Promise<void> {
  await db.$queryRawUnsafe('SELECT 1');
  const missingTables = await findMissingTables();

  if (missingTables.length > 0) {
    throw new Error(
      `Database schema is missing required tables: ${missingTables.join(', ')}. ` +
        'Run `npx prisma migrate deploy` (or `npx prisma migrate reset` in development) and restart the backend.'
    );
  }

  logger.info({ checkedTables: REQUIRED_TABLES.length }, 'Database readiness check passed');
}
