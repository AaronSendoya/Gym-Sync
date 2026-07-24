/**
 * QueryCache — caché de lecturas (GET) en SQLite para modo offline.
 *
 * Guarda el último payload exitoso de cada consulta clave (rutinas, historial
 * de sesiones) para servirlo cuando no hay red. Todas las operaciones son
 * fail-safe: un error de SQLite NUNCA se propaga — devuelven null o no-op,
 * de modo que el caché jamás puede romper el flujo online normal.
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('gymsync_offline.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS query_cache (
        cache_key  TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

export const QueryCache = {
  /** Guarda el payload serializado. Silencioso ante cualquier error. */
  async set(key: string, data: unknown): Promise<void> {
    try {
      if (data === undefined || data === null) return;
      const d = await getDb();
      await d.runAsync(
        `INSERT INTO query_cache (cache_key, payload, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
        key,
        JSON.stringify(data),
      );
    } catch {
      // caché es best-effort: nunca romper el flujo por un fallo de escritura
    }
  },

  /** Devuelve el último payload cacheado o null si no existe / está corrupto. */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const d = await getDb();
      const row = await d.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM query_cache WHERE cache_key = ?',
        key,
      );
      if (!row?.payload) return null;
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  },

  /** Fecha ISO de la última actualización del caché, o null. */
  async updatedAt(key: string): Promise<string | null> {
    try {
      const d = await getDb();
      const row = await d.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM query_cache WHERE cache_key = ?',
        key,
      );
      return row?.updated_at ?? null;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    try {
      const d = await getDb();
      await d.execAsync('DELETE FROM query_cache');
    } catch {
      // no-op
    }
  },
};

/**
 * Patrón read-through: intenta la red; en éxito refresca el caché y devuelve
 * datos frescos; en fallo sirve el último payload cacheado. Solo re-lanza el
 * error original cuando no hay nada en caché (la pantalla muestra su isError).
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const fresh = await fetcher();
    void QueryCache.set(key, fresh);
    return fresh;
  } catch (err) {
    const cached = await QueryCache.get<T>(key);
    if (cached !== null) return cached;
    throw err;
  }
}
