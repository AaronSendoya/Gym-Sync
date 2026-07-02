import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { AutenticacionContext } from '@gymsync/core';
import { AuthService } from './AuthService';
import { authEvents } from './authEvents';
import { usePushNotifications } from '../notifications/usePushNotifications';

interface AuthContextType {
  isAuthenticated: boolean;
  user: AutenticacionContext | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (data: any) => void;
  clearError: () => void;
}

const AuthContextInstance = createContext<AuthContextType | undefined>(undefined);


export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AutenticacionContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { registerToken, clearToken } = usePushNotifications();
  const isForceLoggedOut = React.useRef(false);

  /**
   * Al montar el componente, restaurar la sesión si existe
   */
  useEffect(() => {
    const restoreSession = async () => {
      const doRestore = async () => {
        const currentUser = await AuthService.getCurrentUser();
        if (currentUser) {
          const cachedProfile = await AuthService.getProfileCache();
          if (cachedProfile) {
            setUser({ ...currentUser, ...(({ profile: cachedProfile }) as any) });
          }

          const userData = await AuthService.fetchUserProfile();
          if (isForceLoggedOut.current) return;
          
          const freshProfile = userData?.profile ?? cachedProfile ?? undefined;
          setUser({ ...currentUser, ...(({ profile: freshProfile ?? undefined }) as any) });

          if (freshProfile) {
            AuthService.saveProfileCache(freshProfile).catch(() => {});
          }

          if (((currentUser as any).level ?? 0) >= 1 && ((currentUser as any).level ?? 0) < 10) {
            await Promise.race([
              registerToken(),
              new Promise<void>((resolve) => setTimeout(resolve, 4000)),
            ]);
          }
        }
      };

      try {
        // 8-second global safety net: setIsLoading(false) is guaranteed regardless of any hanging fetch/token call
        await Promise.race([
          doRestore(),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);
      } catch (e) {
        console.warn('[AuthContext] Error restaurando sesión:', e);
      } finally {
        if (!isForceLoggedOut.current) {
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }
    };
    restoreSession();
  }, []);

  useEffect(() => {
    return authEvents.onForceLogout(() => {
      isForceLoggedOut.current = true;
      setUser(null);
      setError(null);
    });
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await AuthService.login(email, password);

      if (result.success && result.user) {
        try {
          if (((result.user as any)?.level ?? 0) >= 10) {
            setError('Esta cuenta es exclusiva del panel web administrativo. Accede desde el navegador en tu computadora.');
            return false;
          }
        } catch {}

        try {
          const { queryClient } = await import('../../../App');
          queryClient.clear();
        } catch {}

        const userData = await AuthService.fetchUserProfile();
        const loginProfile = userData?.profile ?? undefined;
        setUser({ ...result.user, ...(({ profile: loginProfile }) as any) });
        if (loginProfile) {
          AuthService.saveProfileCache(loginProfile).catch(() => {});
        }

        if (((result.user as any)?.level ?? 0) >= 1 && ((result.user as any)?.level ?? 0) < 10) {
          await Promise.race([
            registerToken(),
            new Promise<void>((resolve) => setTimeout(resolve, 4000)),
          ]);
        }

        return true;
      } else {
        setError(result.error || 'Error al iniciar sesión');
        return false;
      }
    } catch (err: any) {
      const message = err?.message || 'Error desconocido';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await clearToken();
      await AuthService.logout();
      const { queryClient } = await import('../../../App');
      queryClient.clear();
      setUser(null);
      setError(null);
    } catch (err: any) {
      console.warn('[AuthContext] Error en logout:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = (data: any) => {
    setUser((prev: any) => {
      if (!prev) return prev;
      const merged = {
        ...(prev.profile || {}),
        ...data,
        physicalMetrics: {
          ...(prev.profile?.physicalMetrics || {}),
          ...(data.physicalMetrics || {}),
        }
      };
      AuthService.saveProfileCache(merged).catch(() => {});
      return { ...prev, profile: merged };
    });
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    isAuthenticated: !!user,
    user,
    isLoading,
    error,
    login,
    logout,
    updateProfile,
    clearError,
  };

  return (
    <AuthContextInstance.Provider value={value}>
      {children}
    </AuthContextInstance.Provider>
  );
};

/**
 * Hook para acceder al contexto de autenticación
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContextInstance);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
