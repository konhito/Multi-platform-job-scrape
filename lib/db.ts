import { neon } from "@neondatabase/serverless";

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export function requireDatabase() {
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}
