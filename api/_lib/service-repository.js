import { getPool } from './db.js';

export function mapService(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    pricePaise: Number(row.price_paise),
    currency: row.currency,
    country: row.country,
    availability: row.availability,
    catalogPosition: row.catalog_position == null ? undefined : Number(row.catalog_position),
    stock: Number(row.stock),
    active: row.active === undefined ? undefined : Boolean(row.active),
  };
}

export async function listPersistedServices() {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id,name,category,price_paise,currency,country,availability,stock,active,catalog_position
     FROM services WHERE active=TRUE ORDER BY catalog_position ASC, id ASC`
  );
  return result.rows.map(mapService);
}

export async function getPersistedService(serviceId) {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id,name,category,price_paise,currency,country,availability,stock,active,catalog_position
     FROM services WHERE id=$1`,
    [serviceId]
  );
  return result.rowCount ? mapService(result.rows[0]) : null;
}
