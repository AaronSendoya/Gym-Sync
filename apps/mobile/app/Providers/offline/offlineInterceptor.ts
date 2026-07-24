import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { OfflineQueue } from './OfflineQueue';
import { getIsOnline } from './NetworkContext';

const MUTATION_METHODS = ['post', 'put', 'patch', 'delete'];

const EXCLUDED_PATTERNS = [
  /\/check-?ins?\b/i,
  /\/check-in/i,
  // Creación de sesión de entrenamiento: NO encolar el POST genérico.
  // EjecutarRutinaScreen maneja el modo offline con OfflineSessions (payload
  // completo con sets); encolar aquí crearía una sesión IN_PROGRESS vacía y
  // duplicada al sincronizar. Solo matchea el endpoint de creación exacto —
  // /sessions/:id/sets y PUT /sessions/:id siguen usando la cola normal.
  /\/training\/sessions\/?$/i,
];

function isMutation(method?: string): boolean {
  return MUTATION_METHODS.includes((method ?? '').toLowerCase());
}

function isExcluded(url?: string): boolean {
  if (!url) return false;
  return EXCLUDED_PATTERNS.some(p => p.test(url));
}

function isNetworkError(error: AxiosError): boolean {
  return !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error');
}

export function attachOfflineInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig | undefined;
      if (!config) return Promise.reject(error);

      if (
        isNetworkError(error) &&
        isMutation(config.method) &&
        !isExcluded(config.url) &&
        !getIsOnline()
      ) {
        await OfflineQueue.enqueue({
          method: config.method,
          url: config.url,
          baseURL: config.baseURL,
          data: config.data,
          headers: config.headers as Record<string, string>,
        });

        return {
          data: { _offlineQueued: true, message: 'Pendiente de sincronización' },
          status: 202,
          statusText: 'Accepted (Offline)',
          headers: {},
          config,
        };
      }

      return Promise.reject(error);
    },
  );
}
