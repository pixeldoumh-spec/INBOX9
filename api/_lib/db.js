let poolPromise;

export async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = import('pg').then(({ Pool }) => new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : (process.env.DATABASE_SSL_CA ? { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA } : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }),
    }));
  }
  return poolPromise;
}

export async function withTransaction(work) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function dbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}
