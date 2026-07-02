import * as SecureStore from 'expo-secure-store';
import type { AutenticacionContext, UserRole } from '@gymsync/core';

import { Env } from '../geolocation/config/environment';

const AUTH_STORAGE_KEY = 'gymsync.user';
const TOKEN_STORAGE_KEY = 'gymsync.token';
const PROFILE_CACHE_KEY = 'gymsync.profile';
const API_BASE_URL = Env.API_BASE_URL;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    accessToken?: string;
    access_token?: string;
    token?: string;
    user?: Record<string, any>;
  };
  message?: string;
  error?: string;
}

export class AuthService {
  /**
   * Realiza login contra el backend
   */
  static async login(email: string, password: string): Promise<{
    success: boolean;
    user?: AutenticacionContext;
    error?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      } as any);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.message || `HTTP ${response.status}`;
        return { success: false, error: errorMsg };
      }

      const body: LoginResponse = await response.json();

      // Extraer el token (múltiples formatos soportados)
      const tokenData = (body.data ?? body) as any;
      const jwtToken = tokenData.accessToken || tokenData.access_token || tokenData.token;
      const userData = tokenData.user || {};

      if (!jwtToken) {
        return { success: false, error: 'No se recibió token del servidor' };
      }

      // Leer role y gymId del JSON de respuesta (backend los envía en user{})
      // SIN Buffer.from — evita crash "Buffer doesn't exist" en iOS/Hermes
      const extractedRole = userData?.role
        ? (String(userData.role).toUpperCase() as UserRole)
        : (() => { throw new Error('El servidor no devolvió el rol del usuario.'); })();

      const extractedGymId: string | undefined = userData?.gymId ?? undefined;

      // Extraer level del payload del JWT (campo incluido por el backend en buildJwtPayload)
      // Permite que roles personalizados (ej: CLIENTE2, DEPORTISTA) sean enrutados
      // correctamente por nivel jerárquico en lugar de nombre de rol
      let extractedLevel = 0;
      let extractedRoleId: number | undefined;
      try {
        const base64Url = jwtToken.trim().split('.')[1];
        const base64    = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jwtPayload = JSON.parse(atob(base64));
        extractedLevel  = jwtPayload?.level ?? 0;
        extractedRoleId = jwtPayload?.roleId != null ? Number(jwtPayload.roleId) : undefined;
      } catch {}

      // userId del objeto user del backend
      const userId = userData?.id;
      const autenticacionContext: AutenticacionContext = {
        userId,
        role: extractedRole,
        gymId: extractedGymId,
        level: extractedLevel,
        roleId: extractedRoleId,
      };

      // Guardar en SecureStore (encriptado)
      await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(autenticacionContext));
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, jwtToken);

      return { success: true, user: autenticacionContext };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Error de conexión con el servidor' };
    }
  }

  /**
   * Realiza registro de un nuevo cliente público contra el backend
   */
  static async register(name: string, email: string, password: string, phone?: string, gender?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {

      const parts = String(name || '').trim().split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '-';

      const payload: Record<string, string> = {
        firstName,
        lastName,
        email: String(email || '').trim().toLowerCase(),
        password: String(password || ''),
      };
      if (phone?.trim()) payload.phone = phone.trim();
      if (gender) payload.gender = gender;

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Mapear los errores 400 (HttpExceptionFilter de NestJS)
        if (response.status === 400 && errorData && errorData.message) {
          const rawMessage = errorData.message;
          if (Array.isArray(rawMessage)) {
            return { success: false, error: rawMessage.join('\n• ') };
          }
          return { success: false, error: String(rawMessage) };
        }

        const errorMsg = errorData?.message || `HTTP ${response.status}`;
        return { success: false, error: errorMsg };
      }

      return { success: true };
    } catch (error: any) {
      const errorMsg = error?.message || 'Error de conexión con el servidor';
      console.warn('[AuthService] Error en register:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Solicita OTP al email del usuario.
   */
  static async forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { success: false, error: body?.message ?? `Error ${res.status}` };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error de conexión' };
    }
  }

  /**
   * POST /api/auth/reset-password
   * Valida OTP y establece la nueva contraseña.
   */
  static async resetPassword(
    email: string,
    otpCode: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email:       email.trim().toLowerCase(),
          otpCode:     String(otpCode).trim(),
          newPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { success: false, error: body?.message ?? `Error ${res.status}` };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error de conexión' };
    }
  }

  /**
   * Recupera el usuario actual del almacenamiento
   */
  static async getCurrentUser(): Promise<AutenticacionContext | null> {
    try {
      const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
      if (!stored) return null;

      const context: AutenticacionContext = JSON.parse(stored);

      // Backfill roleId for sessions created before it was added to the JWT payload.
      if (context.roleId == null) {
        try {
          const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
          if (token) {
            const base64Url = token.trim().split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jwtPayload = JSON.parse(atob(base64));
            if (jwtPayload?.roleId != null) {
              context.roleId = Number(jwtPayload.roleId);
              await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(context));
            }
          }
        } catch {}
      }

      return context;
    } catch (e) {
      console.warn('[AuthService] Error recuperando usuario:', e);
      return null;
    }
  }

  /**
   * Recupera el token actual
   */
  static async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
    } catch (e) {
      console.warn('[AuthService] Error recuperando token:', e);
      return null;
    }
  }

  /**
   * Persiste un token renovado tras un refresh exitoso
   */
  static async saveToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    } catch (e) {
      console.warn('[AuthService] Error guardando token:', e);
    }
  }

  /**
   * Realiza logout
   */
  static async logout(): Promise<void> {
    try {
      await SecureStore.setItemAsync(AUTH_STORAGE_KEY, '');
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, '');
      await SecureStore.setItemAsync(PROFILE_CACHE_KEY, '');
    } catch (e) {
      console.warn('[AuthService] Error en logout:', e);
    }
  }

  /**
   * Valida si hay una sesión activa
   */
  static async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    const token = await this.getToken();
    return !!(user && token);
  }

  /**
   * GET /api/users/:userId — trae firstName, lastName, email, gender, role del backend.
   */
  static async fetchUserProfile(): Promise<Record<string, any> | null> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    try {
      const token = await this.getToken();
      const user  = await this.getCurrentUser();
      if (!token || !user?.userId) return null;

      const res = await fetch(`${API_BASE_URL}/api/users/${user.userId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) {
        console.warn('[AuthService] fetchUserProfile status:', res.status);
        return null;
      }
      const body = await res.json();
      return body?.data ?? body ?? null;
    } catch (e: any) {
      clearTimeout(tid);
      if (e?.name !== 'AbortError') {
        console.warn('[AuthService] fetchUserProfile error:', e?.message ?? e);
      }
      return null;
    }
  }

  static async saveProfileCache(profile: Record<string, any>): Promise<void> {
    try {
      await SecureStore.setItemAsync(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch {}
  }

  static async getProfileCache(): Promise<Record<string, any> | null> {
    try {
      const raw = await SecureStore.getItemAsync(PROFILE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static async getTokenPayload(): Promise<Record<string, any> | null> {
    try {
      const token = await this.getToken();
      if (!token) return null;
      // atob() nativo — sin Buffer (compatible iOS/Hermes/React Native)
      const base64Url = token.trim().split('.')[1];
      const base64    = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch {
      return null;
    }
  }
}
