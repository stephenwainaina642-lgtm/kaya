import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';
import * as schema from './schema';

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const appDb = drizzle(pool, { schema });

export type Tx = NodePgDatabase<typeof schema>;

/**
 * Runs `fn` inside a transaction with `app.org_id` set for the duration,
 * so row-level security policies scope every query to that organization.
 */
export async function withTenant<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
    return fn(tx as unknown as Tx);
  });
}

export async function closeAppPool(): Promise<void> {
  await pool.end();
}
