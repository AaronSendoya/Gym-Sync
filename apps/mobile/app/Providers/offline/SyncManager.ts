import axios from 'axios';
import { AuthService } from '../auth/AuthService';
import { Env } from '../geolocation/config/environment';
import { OfflineQueue } from './OfflineQueue';
import { OfflineSessions } from './OfflineSessions';

const MAX_RETRIES = 5;

let syncing = false;

export const SyncManager = {
  async sync(): Promise<{ synced: number; failed: number }> {
    if (syncing) return { synced: 0, failed: 0 };
    syncing = true;

    let synced = 0;
    let failed = 0;

    try {
      const token = await AuthService.getToken();

      // ── 1. Sesiones de entrenamiento completadas offline ──────────────────
      // Cada una es un POST único a /sessions/completed (sesión + sets en un
      // golpe): sin dependencia de sessionId del servidor, sin orden frágil.
      try {
        const sessions = await OfflineSessions.getAll();
        for (const item of sessions) {
          if (item.retryCount >= MAX_RETRIES) {
            await OfflineSessions.remove(item.id);
            failed++;
            continue;
          }
          try {
            await axios.post(
              '/api/training/sessions/completed',
              item.payload,
              {
                baseURL: Env.API_BASE_URL,
                timeout: 15000,
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  ...(token ? { Authorization: `Bearer ${token.trim()}` } : {}),
                },
              },
            );
            await OfflineSessions.remove(item.id);
            synced++;
          } catch (err: any) {
            // 4xx = payload rechazado definitivamente (validación) → descartar
            // para no reintentar eternamente algo que nunca será aceptado.
            const status = err?.response?.status;
            if (status && status >= 400 && status < 500) {
              await OfflineSessions.remove(item.id);
              failed++;
            } else {
              await OfflineSessions.incrementRetry(item.id);
              failed++;
            }
          }
        }
      } catch {
        // El lote de sesiones nunca debe impedir el lote de mutaciones
      }

      // ── 2. Cola genérica de mutaciones (reservas, perfil, etc.) ────────────
      const pending = await OfflineQueue.getAll();

      for (const item of pending) {
        if (item.retryCount >= MAX_RETRIES) {
          await OfflineQueue.remove(item.id);
          failed++;
          continue;
        }

        try {
          const headers: Record<string, string> = JSON.parse(item.headers);
          if (token) headers['Authorization'] = `Bearer ${token.trim()}`;
          headers['Content-Type'] = 'application/json';

          await axios({
            method: item.method.toLowerCase(),
            url: item.url,
            baseURL: item.baseURL,
            data: item.data ? JSON.parse(item.data) : undefined,
            headers,
            timeout: 15000,
          });

          await OfflineQueue.remove(item.id);
          synced++;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status && status >= 400 && status < 500) {
            // Rechazo definitivo del servidor (validación/conflicto): descartar
            await OfflineQueue.remove(item.id);
            failed++;
          } else {
            await OfflineQueue.incrementRetry(item.id);
            failed++;
          }
        }
      }
    } catch {
      // Nunca dejar que un fallo inesperado del sync crashee la app
    } finally {
      syncing = false;
    }

    return { synced, failed };
  },

  /** Total de elementos pendientes (mutaciones + sesiones offline). */
  async pendingCount(): Promise<number> {
    try {
      const [mutations, sessions] = await Promise.all([
        OfflineQueue.count(),
        OfflineSessions.count(),
      ]);
      return mutations + sessions;
    } catch {
      return 0;
    }
  },
};
