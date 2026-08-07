import axios from 'axios';
import { Env } from '../../geolocation/config/environment';
import { AuthService } from '../../auth/AuthService';
import { attach401Guard } from '../../auth/axios401Guard';
import { attachOfflineInterceptor } from '../../offline/offlineInterceptor';

// ─── Cliente HTTP ───────────────────────────────────────────────────────────
// Solo lectura (GET) a propósito: la gestión de planes/inscripciones/
// congelamientos es exclusiva de la plataforma web (ver CLAUDE.md). Esta
// pantalla móvil (Recepcionista/Gerente) es un panel de consulta rápida.
const subscriptionsClient = axios.create({
  baseURL: Env.API_BASE_URL,
  timeout: Env.API_TIMEOUT_MS || 10000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

subscriptionsClient.interceptors.request.use(
  async (config) => {
    const raw = await AuthService.getToken();
    if (!raw) return Promise.reject(new Error('Sin sesión activa.'));
    config.headers['Authorization'] = `Bearer ${raw.trim()}`;
    return config;
  },
  (error) => Promise.reject(error),
);

attach401Guard(subscriptionsClient);
attachOfflineInterceptor(subscriptionsClient);

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export type MembershipStatus = 'ACTIVA' | 'VENCIDA' | 'CONGELADA' | 'CANCELADA';

export type SubscriptionPlanDto = {
  id: number;
  name: string;
  description: string | null;
  priceMonthly: number;
  durationDays: number | null;
  sessionsIncluded: number | null;
  windowDays: number | null;
  scope: 'SUCURSAL' | 'MARCA';
  gym: { id: number; name: string } | null;
};

export type SubscriptionListItemDto = {
  id: number;
  status: MembershipStatus;
  startDate: string;
  endDate: string;
  homeGymId: number | null;
  frozenAt: string | null;
  user: {
    id: number;
    email: string;
    profile?: { firstName?: string; lastName?: string; ci?: string } | null;
  };
  plan: {
    id: number;
    name: string;
    priceMonthly: number;
    scope: 'SUCURSAL' | 'MARCA';
  };
  homeGym: { id: number; name: string; parent?: { id: number; name: string } | null } | null;
};

export type FreezeLogDto = {
  id: number;
  action: 'CONGELAR' | 'DESCONGELAR';
  occurredAt: string;
  daysFrozen: number | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  user: { email: string; profile?: { firstName?: string; lastName?: string } | null };
  performedBy: { email: string; profile?: { firstName?: string; lastName?: string } | null } | null;
  homeGym: { id: number; name: string } | null;
};

const unwrap = <T>(data: any): T => (data?.data !== undefined && data?.meta !== undefined ? data : data?.data ?? data);

export const subscriptionsApi = {
  /**
   * GET /api/subscriptions/plans
   * Catálogo de planes visible en el territorio del caller (Recepcionista: su
   * sucursal + globales; Gerente: su marca + globales).
   */
  getPlans: async (search?: string): Promise<SubscriptionPlanDto[]> => {
    const response = await subscriptionsClient.get('/api/subscriptions/plans', {
      params: search ? { search } : undefined,
    });
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },

  /**
   * GET /api/subscriptions
   * Inscripciones del territorio, paginado. `status` filtra por estado exacto
   * (ej. 'VENCIDA' para el listado que abre el push de resumen diario).
   */
  getSubscriptions: async (params: {
    status?: MembershipStatus;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<SubscriptionListItemDto>> => {
    const response = await subscriptionsClient.get('/api/subscriptions', { params });
    return unwrap<PaginatedResponse<SubscriptionListItemDto>>(response.data);
  },

  /**
   * GET /api/subscriptions/freeze-logs
   * Historial permanente de congelamientos/descongelamientos del territorio.
   */
  getFreezeLogs: async (params: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<FreezeLogDto>> => {
    const response = await subscriptionsClient.get('/api/subscriptions/freeze-logs', { params });
    return unwrap<PaginatedResponse<FreezeLogDto>>(response.data);
  },
};
