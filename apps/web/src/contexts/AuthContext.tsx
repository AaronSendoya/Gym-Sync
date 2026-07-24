/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from 'react';
import type { UserRole } from '@gymsync/core';
import { apiClient } from '../infrastructure/api.config';
import { queryClient } from '../lib/queryClient';
import { VALID_ROLES, ROLE_ID_TO_NAME, DB_ROLES } from '../config/rbac.constants';

export interface WebUser {
  id: number;
  userId: number;
  role: UserRole;
  roleId: number;
  level: number;
  gymId?: string;
  brandId?: number;
  brandName?: string;
  firstName?: string;
  lastName?: string;
  gymName?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: WebUser | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isLoading: boolean;
  refreshSession: () => Promise<boolean>;
  /** true mientras el backend no responde (error de red, no 401). */
  isServerDown: boolean;
  /**
   * Se incrementa en cada recuperación de sesión tras una caída del backend.
   * Los consumidores con conexiones persistentes (Socket.io) lo usan como
   * dependencia para reconectar y re-emitir join_room.
   */
  sessionEpoch: number;
}

export const AuthContext = createContext<AuthState>({} as AuthState);

// ─── Helper: decodifica el payload del JWT sin librerías externas ─────────────
function decodeJwtPayload(token: string): Record<string, any> {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch {
    return {};
  }
}

// ─── Helpers de resolución de identidad ──────────────────────────────────────

function resolveRole(
  jwtPayload: Record<string, any>,
  userData: Record<string, any>,
): UserRole {
  const rolesEntry = Array.isArray(jwtPayload.roles)
    ? jwtPayload.roles[0]
    : undefined;
  let rawRole: string =
    jwtPayload.role ||
    (rolesEntry
      ? typeof rolesEntry === 'string'
        ? rolesEntry
        : (rolesEntry?.name ?? '')
      : '') ||
    (typeof userData?.role === 'string' ? userData.role : userData?.role?.name) ||
    '';

  if (!rawRole && jwtPayload.roleId) {
    rawRole = ROLE_ID_TO_NAME[Number(jwtPayload.roleId)] || '';
  }

  const normalized = rawRole.toString().toUpperCase();
  return (
    VALID_ROLES.includes(normalized as UserRole) ? normalized : 'CLIENTE'
  ) as UserRole;
}

function resolveRoleId(
  jwtPayload: Record<string, any>,
  roleName: UserRole,
): number {
  if (jwtPayload.roleId && typeof jwtPayload.roleId === 'number') {
    return jwtPayload.roleId;
  }
  const entry = Object.entries(ROLE_ID_TO_NAME).find(
    ([, name]) => name === roleName,
  );
  return entry ? Number(entry[0]) : 3;
}

function resolveGymId(
  jwtPayload: Record<string, any>,
  userData: Record<string, any>,
): string | undefined {
  const raw =
    jwtPayload.gymId ?? jwtPayload.gym_id ?? userData?.gymId ?? userData?.gym_id;
  if (raw !== undefined && raw !== null) return String(raw);
  return undefined;
}

function resolveBrandId(jwtPayload: Record<string, any>): number | undefined {
  const raw = jwtPayload.brandId ?? jwtPayload.brand_id;
  if (raw !== undefined && raw !== null) return Number(raw);
  return undefined;
}

// ─── Construye un WebUser a partir de la respuesta de /auth/me ────────────────
// Se usa durante la hidratación (page refresh) donde no hay token en memoria.
function buildUserFromMeResponse(data: Record<string, any>): WebUser | null {
  try {
    const profile = data.profile ?? {};
    const roleRaw =
      typeof data.role === 'string' ? data.role : data.role?.name ?? '';
    const role = (
      VALID_ROLES.includes(roleRaw.toUpperCase() as UserRole)
        ? roleRaw.toUpperCase()
        : 'CLIENTE'
    ) as UserRole;
    const roleId =
      DB_ROLES[role as keyof typeof DB_ROLES] ??
      Object.entries(ROLE_ID_TO_NAME).find(([, n]) => n === role)?.[0]
        ? Number(
            Object.entries(ROLE_ID_TO_NAME).find(([, n]) => n === role)![0],
          )
        : 3;

    const id = Number(data.id ?? data.userId ?? 0);
    return {
      id,
      userId: id,
      role,
      roleId,
      level: Number(data.level ?? data.hierarchyLevel ?? 0),
      gymId: data.gymId ? String(data.gymId) : undefined,
      brandId: data.brandId ? Number(data.brandId) : undefined,
      brandName: data.brandName || undefined,
      firstName: profile.firstName || data.firstName || '',
      lastName: profile.lastName || data.lastName || '',
      gymName: data.gymName || data.gym?.name || '',
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<WebUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isServerDown, setIsServerDown] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  // Ref espejo de isServerDown: refreshSession la lee sin re-crearse por cambios de estado.
  const serverDownRef = useRef(false);

  const markServerDown = useCallback((down: boolean) => {
    serverDownRef.current = down;
    setIsServerDown(down);
  }, []);

  // ── Hidratación: la cookie HttpOnly se envía automáticamente con withCredentials ──
  // 1. Intento rápido con datos cacheados en localStorage (solo perfil, no token)
  // 2. Verificación real con /auth/me (valida que la cookie sea aún válida)
  useEffect(() => {
    const hydrate = async () => {
      // Arranque optimista con datos de perfil cacheados (no sensibles)
      const storedRaw = localStorage.getItem('gymsync_user');
      if (storedRaw) {
        try {
          const cached = JSON.parse(storedRaw) as WebUser;
          setUser(cached);
        } catch {
          localStorage.removeItem('gymsync_user');
        }
      }

      // Verificar sesión real con el backend (la cookie se envía automáticamente)
      try {
        const res  = await apiClient.get('/auth/me', { _skipErrorToast: true } as any);
        const data = res.data ?? {};
        const freshUser = buildUserFromMeResponse(data);

        if (freshUser) {
          setUser(freshUser);
          localStorage.setItem('gymsync_user', JSON.stringify(freshUser));
        } else {
          // /auth/me respondió pero el payload es inválido — limpiar
          setUser(null);
          localStorage.removeItem('gymsync_user');
        }
      } catch (error: any) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          // JWT expirado pero cookie viva (grace period): intentar renovación
          // silenciosa una vez antes de purgar la sesión.
          try {
            await apiClient.post('/auth/refresh', {}, { _skipErrorToast: true } as any);
            const retry = await apiClient.get('/auth/me', { _skipErrorToast: true } as any);
            const renewed = buildUserFromMeResponse(retry.data ?? {});
            if (renewed) {
              setUser(renewed);
              localStorage.setItem('gymsync_user', JSON.stringify(renewed));
              return; // sesión renovada — finally hace setIsLoading(false)
            }
          } catch { /* refresh falló — purga normal */ }
          // Token inválido o sesión revocada en el servidor → purgar
          setUser(null);
          localStorage.removeItem('gymsync_user');
          sessionStorage.clear();
        } else {
          // Error de red o backend reiniciándose → conservar datos cacheados
          // y activar el polling de auto-recuperación.
          markServerDown(true);
          const storedRaw = localStorage.getItem('gymsync_user');
          if (storedRaw) {
            try { setUser(JSON.parse(storedRaw) as WebUser); } catch { /* corrupt cache */ }
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    hydrate();
  }, []);

  const login = async (
    email: string,
    pass: string,
  ): Promise<{ success: boolean; error?: string }> => {
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password: pass,
      });
      // El backend ya no retorna accessToken — va directo en la cookie HttpOnly.
      // Solo recibimos { user: {...} }.
      const payload = response.data;
      const userData: Record<string, any> = payload.user ?? payload ?? {};

      // El backend firma el JWT con el payload completo; /me devuelve esos mismos datos.
      // Para el login, reconstruimos el WebUser desde la respuesta del servidor.
      // Si el backend devuelve el accessToken (Swagger/Postman), lo ignoramos aquí.
      const jwtToken: string | undefined =
        payload.accessToken || payload.access_token || payload.token;

      let webUser: WebUser;

      if (jwtToken) {
        // Compatibilidad: si el token llega en el body (ej. Postman), lo usamos
        // solo para decodificar el payload — NO lo guardamos en localStorage.
        const jwtPayload = decodeJwtPayload(jwtToken);
        const role   = resolveRole(jwtPayload, userData);
        const roleId = resolveRoleId(jwtPayload, role);
        const gymId  = resolveGymId(jwtPayload, userData);
        const brandId = resolveBrandId(jwtPayload);
        const id     = Number(jwtPayload.sub || jwtPayload.id || userData.id || 0);

        webUser = {
          id,
          userId: id,
          role,
          roleId,
          level: Number(jwtPayload.level ?? userData.level ?? 0),
          gymId,
          brandId,
          brandName: userData.brandName || undefined,
          firstName: userData.profile?.firstName || userData.firstName || '',
          lastName:  userData.profile?.lastName  || userData.lastName  || '',
          gymName:   userData.gymName || userData.gym?.name || '',
        };
      } else {
        // El backend no retornó token en body (comportamiento correcto con cookies)
        // — construir el usuario desde los datos de la respuesta
        const built = buildUserFromMeResponse(userData);
        if (!built) throw new Error('El backend no retornó datos de usuario válidos.');
        webUser = built;
      }

      if (webUser.level < 4) {
        return {
          success: false,
          error:
            'Acceso denegado. Esta plataforma es de uso administrativo. Utiliza la aplicación móvil GymSync.',
        };
      }

      // Purga TODA la caché de React Query antes de asumir la nueva identidad:
      // sin esto, datos territorialmente filtrados de la sesión anterior (ej.
      // /gyms cacheado como Gerente) sobreviven hasta 'staleTime' y se muestran
      // a la cuenta nueva (ej. Super Admin) como si fueran su propia data.
      queryClient.clear();

      setUser(webUser);
      markServerDown(false); // login exitoso = backend arriba
      // Guardamos SOLO datos de perfil (no sensibles) para arranque optimista
      localStorage.setItem('gymsync_user', JSON.stringify(webUser));

      return { success: true };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { success: false, error: 'Credenciales inválidas.' };
      }
      const apiMessage = error?.response?.data?.message || error?.message;
      return {
        success: false,
        error: apiMessage || 'Error de conexión con el servidor.',
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Pedir al backend que limpie la cookie HttpOnly
      await apiClient.post('/auth/logout');
    } catch {
      // Si falla, igual limpiamos el estado local
    } finally {
      setUser(null);
      localStorage.removeItem('gymsync_user');
      sessionStorage.clear();
      // Purga la caché de React Query: sin esto, la próxima cuenta que inicie
      // sesión en esta misma pestaña (dev/QA cambiando de rol, o un usuario
      // real compartiendo equipo) hereda datos territorialmente filtrados
      // de ESTE usuario hasta que expire 'staleTime' (2 min).
      queryClient.clear();
    }
  };

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiClient.get('/auth/me', { _skipErrorToast: true } as any);
      const freshUser = buildUserFromMeResponse(res.data ?? {});
      if (freshUser) {
        const wasDown = serverDownRef.current;
        setUser(freshUser);
        localStorage.setItem('gymsync_user', JSON.stringify(freshUser));
        // Invalida todos los caches de React Query para que los módulos activos
        // recarguen datos frescos del servidor tras la recuperación de sesión.
        queryClient.invalidateQueries();
        if (wasDown) {
          // Estado 'Recuperado': el epoch fuerza a las conexiones persistentes
          // (Socket.io) a reconectar y re-emitir join_room con datos frescos.
          markServerDown(false);
          setSessionEpoch((e) => e + 1);
        }
        return true;
      }
      return false;
    } catch (error: any) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        setUser(null);
        localStorage.removeItem('gymsync_user');
        sessionStorage.clear();
        markServerDown(false);
      } else if (!error.response) {
        // Sin respuesta HTTP = backend caído → mantener/activar polling
        markServerDown(true);
      }
      return false;
    }
  }, [markServerDown]);

  // ── Auto-recuperación: mientras el backend esté caído, reintenta cada 10 s ──
  useEffect(() => {
    if (!isServerDown) return;
    const interval = setInterval(() => {
      void refreshSession();
    }, 10_000);
    return () => clearInterval(interval);
  }, [isServerDown, refreshSession]);

  const value = React.useMemo(
    () => ({
      isAuthenticated: !!user,
      user,
      login,
      logout,
      isLoading,
      refreshSession,
      isServerDown,
      sessionEpoch,
    }),
    [user, login, logout, isLoading, refreshSession, isServerDown, sessionEpoch],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
