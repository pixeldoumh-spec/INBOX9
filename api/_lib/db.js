let poolPromise;

function databaseConnectionConfig() {
  const raw = String(process.env.DATABASE_URL || '');
  let connectionString = raw;
  try {
    const url = new URL(raw);
    // pg-connection-string gives URL SSL parameters precedence over the explicit
    // `ssl` option. Remove SSL query parameters so our verified TLS settings below
    // are authoritative, including the Supabase CA certificate.
    for (const key of ['sslmode', 'sslrootcert', 'sslcert']) url.searchParams.delete(key);
    connectionString = url.toString();
  } catch {
    // Let pg surface a normal connection-string error for malformed URLs.
  }

  const ssl = process.env.DATABASE_SSL === 'false'
    ? false
    : (process.env.DATABASE_SSL_CA
        ? { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA }
        : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' });

  return { connectionString, ssl };
}

export async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = import('pg').then(({ Pool }) => {
      const { connectionString, ssl } = databaseConnectionConfig();
      return new Pool({
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 5),
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        ssl,
      });
    });
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
