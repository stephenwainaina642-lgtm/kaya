import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env';
import * as schema from './schema';

/**
 * Privileged (BYPASSRLS) connection. Used only where tenant isolation
 * genuinely cannot apply yet — resolving a public share-link token to its
 * organization, migrations, and seeding.
 */
const pool = new Pool({ connectionString: env.DATABASE_ADMIN_URL, max: 5 });

export const systemDb = drizzle(pool, { schema });

export async function closeSystemPool(): Promise<void> {
  await pool.end();
}
