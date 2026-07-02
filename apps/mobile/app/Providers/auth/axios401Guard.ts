import { Alert } from 'react-native';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AuthService } from './AuthService';
import { authEvents } from './authEvents';
import { Env } from '../geolocation/config/environment';

// Estado compartido entre todos los clientes axios que usen este guard
let isRefreshing = false;
let logoutTriggered = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function isSessionError(error: any): boolean {
  const status = error?.response?.status;
  if (status === 401) return true;
  const msg = String(error?.response?.data?.message ?? '').toLowerCase();
  return msg.includes('sesión') && (msg.includes('inválida') || msg.includes('expiró'));
}

function resolveSessionMessage(error: any): { title: string; body: string } {
  const serverMsg = error?.response?.data?.message;
  if (typeof serverMsg === 'string' && serverMsg.trim()) {
    return { title: 'Acceso denegado', body: serverMsg };
  }
  return {
    title: 'Sesión expirada',
    body: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
  };
}

async function attemptRefresh(): Promise<string | null> {
  try {
    const currentToken = await AuthService.getToken();
    if (!currentToken) return null;

    const res = await fetch(`${Env.API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const body = await res.json();
    const newToken: string | undefined =
      body?.accessToken ?? body?.data?.accessToken;
    if (!newToken) return null;

    await AuthService.saveToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

function doLogout(error: any): void {
  if (logoutTriggered) return;
  logoutTriggered = true;

  // Emit logout instantly so UI redirects immediately
  authEvents.emitForceLogout();

  AuthService.logout()
    .catch(() => {})
    .finally(() => {
      logoutTriggered = false;
    });
}

export function attach401Guard(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // No interceptar: no es error de sesión, ya se reintentó, o es la llamada de refresh
      if (
        !isSessionError(error) ||
        config._retry ||
        (config.url ?? '').includes('/auth/refresh')
      ) {
        return Promise.reject(error);
      }

      config._retry = true;

      // Si ya hay un refresh en vuelo, encolar este request
      if (isRefreshing) {
        return new Promise<any>((resolve, reject) => {
          refreshQueue.push((newToken) => {
            if (newToken) {
              config.headers.set('Authorization', `Bearer ${newToken}`);
              resolve(client(config));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;
      const newToken = await attemptRefresh();
      isRefreshing = false;

      if (newToken) {
        // Desbloquear requests en cola con el nuevo token
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        // Reintentar el request original
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return client(config);
      }

      // Refresh falló — liberar cola y hacer logout
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      doLogout(error);

      return Promise.reject(error);
    },
  );
}
