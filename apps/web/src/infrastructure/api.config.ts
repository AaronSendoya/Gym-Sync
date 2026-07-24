import axios from 'axios';
import type { AxiosInstance } from 'axios';
import toast from 'react-hot-toast';

// Limpia el estado local y redirige al login.
// Fire-and-forget del logout: no await — la redirección es inmediata para evitar
// que componentes del Dashboard rendericen paneles de error durante la transición.
const forceLogout = () => {
  axios.post('/api/auth/logout', {}, { withCredentials: true }).catch(() => {});
  localStorage.removeItem('gymsync_user');
  sessionStorage.clear();
  if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
    window.location.href = '/login';
  }
};

const handleAccessDenied = (message?: string) => {
  toast.error(message || 'Acceso Denegado: No tienes permisos para esta acción.');
};

// ── Renovación silenciosa de sesión ──────────────────────────────────────────
// La cookie HttpOnly sobrevive a la expiración del JWT (grace period de 30 días
// en el backend): ante un 401 se intenta POST /auth/refresh UNA vez y se repite
// la petición original. Un solo refresh en vuelo compartido entre requests.
let refreshInFlight: Promise<boolean> | null = null;

const attemptCookieRefresh = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true, timeout: 10000 });
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
};

export const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: '/api',
    timeout: 10000,
    withCredentials: true, // envía la cookie HttpOnly en cada petición automáticamente
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // ── Request interceptor ──────────────────────────────────────────────────────
  client.interceptors.request.use(
    (config) => {
      if (config.data instanceof FormData) {
        config.headers.set('Content-Type', undefined as any);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // ── Response interceptor ─────────────────────────────────────────────────────
  client.interceptors.response.use(
    (response) => {
      const body = response.data;
      if (body && typeof body === 'object' && 'success' in body) {
        if (body.success === false) {
          const reqUrl = response.config?.url ?? '';

          // Si el caller maneja sus propios errores, preservar metadata (status + code)
          // para que pueda inspeccionarlos sin depender del interceptor global.
          if (response.config?._skipErrorToast) {
            const richErr = new Error(
              typeof body.message === 'string' ? body.message : 'Error en la operación',
            ) as Error & { response?: { status: number; data: unknown } };
            richErr.response = { status: body.statusCode ?? 400, data: body };
            return Promise.reject(richErr);
          }

          if (body.statusCode === 403 || body.message?.includes('denegado')) {
            handleAccessDenied(body.message);
          } else if (body.statusCode === 401 && !reqUrl.includes('/auth/login') && !reqUrl.includes('/auth/me')) {
            forceLogout();
          } else {
            toast.error(body.message || 'Error en la operación');
          }
          return Promise.reject(new Error(body.message || 'La API retornó success=false.'));
        }
        if ('data' in body) {
          response.data = body.data;
        }
      }
      return response;
    },
    (error) => {
      const SILENT_ON_ERROR = ['/gyms/brands', '/roles', '/auth/login', '/auth/me'];
      const url = error.config?.url ?? '';
      if (
        error.config?._skipErrorToast ||
        SILENT_ON_ERROR.some((p) => url.includes(p))
      ) {
        return Promise.reject(error);
      }

      console.error('[Web API Error]', error.message);

      if (error.response) {
        const status = error.response.status;
        const body = error.response.data;
        const rawMessage = body?.message || body?.error || error.message;

        let errorMessage =
          typeof rawMessage === 'string' ? rawMessage : 'Error desconocido';
        if (Array.isArray(rawMessage)) {
          errorMessage = '• ' + rawMessage.join('\n• ');
        }

        if (status === 400) {
          console.warn(`[API Error 400]:`, errorMessage);
          toast.error(`Error de validación:\n${errorMessage}`, {
            duration: 6000,
            style: { whiteSpace: 'pre-wrap', textAlign: 'left' },
          });
        } else if (
          status === 500 &&
          typeof rawMessage === 'string' &&
          (rawMessage.toLowerCase().includes('duplicate key') ||
            rawMessage.toLowerCase().includes('unique constraint'))
        ) {
          console.error(`[API Error 500]: Duplicidad en DB ->`, rawMessage);
          toast.error(
            'Error de secuencia en DB. Intente de nuevo o ejecute el script de reseteo.',
            { duration: 8000 },
          );
        } else if (status === 401) {
          const cfg = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
          if (cfg && !cfg._retry && !url.includes('/auth/')) {
            cfg._retry = true;
            return attemptCookieRefresh().then((ok) => {
              if (ok) return client(cfg);
              forceLogout();
              return Promise.reject(error);
            });
          }
          forceLogout();
        } else if (status === 403) {
          handleAccessDenied(errorMessage);
        } else if (body?.success === false) {
          toast.error(errorMessage);
        } else {
          toast.error(errorMessage || `Error del servidor (${status})`);
        }
      } else {
        // Error de red (ERR_CONNECTION_REFUSED, timeout) — no destruir sesión
        console.warn('[Web API] Error de red — backend no disponible temporalmente.');
      }

      return Promise.reject(error);
    },
  );

  return client;
};

export const apiClient = createApiClient();
