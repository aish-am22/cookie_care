import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

// WebSocket setup for serverless environments (Required for Neon)
if (typeof window === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

// 1. Connection String fetching from .env
const connectionString = process.env.DATABASE_URL?.trim();

console.log('[DB Init] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB Init] DATABASE_URL present:', !!connectionString);

if (!connectionString) {
  console.error("❌ CRITICAL: DATABASE_URL is missing in .env file!");
  console.error('[DB Init] Available process.env keys:', Object.keys(process.env).filter(k => k.startsWith('DATABASE') || k.startsWith('JWT') || k.startsWith('NODE')));
  throw new Error("DATABASE_URL is required to start the server.");
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(connectionString);
} catch {
  throw new Error("DATABASE_URL is not a valid URL.");
}

console.log('[DB Init] DB host:', parsedUrl.hostname);

// 2. Create adapter with explicit PoolConfig (Prisma 7 constructor expects config, not Pool instance)
const adapter = new PrismaNeon({
  host: parsedUrl.hostname,
  port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

// 4. Export the Database Client
export const db =
  global.__prisma__ ??
  new PrismaClient({
    adapter,
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = db;
}

console.log("🚀 Prisma Client Initialized with Neon Adapter");