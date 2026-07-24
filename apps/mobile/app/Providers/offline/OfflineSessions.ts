/**
 * OfflineSessions — sesiones de entrenamiento completadas sin conexión.
 *
 * Cada registro es el payload COMPLETO de una sesión terminada (rutina, sets,
 * duración) listo para enviarse como un único POST /api/training/sessions/completed
 * cuando vuelva la red. Ese endpoint crea la sesión ya finalizada con sus sets
 * en un solo golpe, por lo que no depende de ningún sessionId del servidor.
 *
 * Todas las operaciones son fail-safe: los errores de SQLite se capturan y
 * devuelven valores neutros — el flujo de entrenamiento nunca crashea por
 * un fallo de persistencia local.
 */
import * as SQLite from 'expo-sqlite';

export interface OfflineSessionPayload {
  routineId?: number | null;
  gymId?: number | null;
  sportType?: string;
  durationSeconds: number;
  caloriesBurned?: number;
  notes?: string;
  sets?: {
    setNumber: number;
    routineExerciseId?: number | null;
    exerciseId?: number | null;
    repsCompleted?: number;
    weightUsedKg?: number;
    durationSeconds?: number;
    distanceMeters?: number;
  }[];
}

export interface OfflineSessionRow {
  id: number;
  payload: OfflineSessionPayload;
  routineName: string;
  exerciseName: string;
  createdAt: string;
  retryCount: number;
}

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('gymsync_offline.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS offline_sessions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        payload       TEXT NOT NULL,
        routine_name  TEXT NOT NULL DEFAULT '',
        exercise_name TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        retry_count   INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

export const OfflineSessions = {
  /** Guarda una sesión terminada offline. Devuelve el id local o null si falló. */
  async enqueue(
    payload: OfflineSessionPayload,
    meta?: { routineName?: string; exerciseName?: string },
  ): Promise<number | null> {
    try {
      const d = await getDb();
      const result = await d.runAsync(
        `INSERT INTO offline_sessions (payload, routine_name, exercise_name) VALUES (?, ?, ?)`,
        JSON.stringify(payload),
        meta?.routineName ?? '',
        meta?.exerciseName ?? '',
      );
      return result.lastInsertRowId;
    } catch {
      return null;
    }
  },

  async getAll(): Promise<OfflineSessionRow[]> {
    try {
      const d = await getDb();
      const rows = await d.getAllAsync<{
        id: number; payload: string; routine_name: string;
        exercise_name: string; created_at: string; retry_count: number;
      }>('SELECT * FROM offline_sessions ORDER BY id ASC');

      const parsed: OfflineSessionRow[] = [];
      for (const r of rows) {
        try {
          parsed.push({
            id: r.id,
            payload: JSON.parse(r.payload) as OfflineSessionPayload,
            routineName: r.routine_name,
            exerciseName: r.exercise_name,
            createdAt: r.created_at,
            retryCount: r.retry_count,
          });
        } catch {
          // Fila corrupta: eliminarla para que no bloquee la cola
          void d.runAsync('DELETE FROM offline_sessions WHERE id = ?', r.id).catch(() => {});
        }
      }
      return parsed;
    } catch {
      return [];
    }
  },

  async count(): Promise<number> {
    try {
      const d = await getDb();
      const row = await d.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) as c FROM offline_sessions',
      );
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  },

  async remove(id: number): Promise<void> {
    try {
      const d = await getDb();
      await d.runAsync('DELETE FROM offline_sessions WHERE id = ?', id);
    } catch {
      // no-op
    }
  },

  async incrementRetry(id: number): Promise<void> {
    try {
      const d = await getDb();
      await d.runAsync(
        'UPDATE offline_sessions SET retry_count = retry_count + 1 WHERE id = ?',
        id,
      );
    } catch {
      // no-op
    }
  },

  /** Purga total (logout): las sesiones pendientes pertenecen al usuario saliente. */
  async clear(): Promise<void> {
    try {
      const d = await getDb();
      await d.execAsync('DELETE FROM offline_sessions');
    } catch {
      // no-op
    }
  },
};
