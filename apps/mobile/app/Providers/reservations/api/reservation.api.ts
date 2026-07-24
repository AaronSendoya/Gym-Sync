import axios from 'axios';
import { Env } from '../../geolocation/config/environment';
import {
  GymActivity,
  CreateReservationPayload,
  CreateFreeReservationPayload,
  ReservationResponse,
  UserReservation,
  SubscriptionStatus,
  ActiveMembership,
  CheckinCalendarDto,
} from './reservation.types';
import { AuthService } from '../../auth/AuthService';
import { attach401Guard } from '../../auth/axios401Guard';

const reservationClient = axios.create({
  baseURL: Env.API_BASE_URL,
  timeout: Env.API_TIMEOUT_MS || 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Interceptor de request: inyectar JWT ──────────────────────────────────────
reservationClient.interceptors.request.use(
  async (config) => {
    const raw = await AuthService.getToken();
    if (!raw) {
      console.warn('[AUTH] No hay token en el llavero seguro');
      return Promise.reject(new Error('Sin sesión activa.'));
    }
    const token = raw.trim();
    config.headers['Authorization'] = `Bearer ${token}`;
    // auth header injected
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Interceptor global 401 → alerta + logout + redirect al login ─────────────
attach401Guard(reservationClient);
import { attachOfflineInterceptor } from '../../offline/offlineInterceptor';
attachOfflineInterceptor(reservationClient);

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export const reservationApi = {

  /**
   * GET /api/activities?gymId=:gymId
   * Backend devuelve GymActivity[] plano (qb.getMany(), sin wrapper de paginación).
   */
  getGymActivities: async (gymId: number): Promise<GymActivity[]> => {
    const response = await reservationClient.get('/api/activities', {
      params: gymId ? { gymId } : undefined,
    });
    const rawData = response.data;
    // Defensive: handle flat array (expected) or wrapped { data: [] } (fallback)
    const all: GymActivity[] = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
    return all.filter((a) => a.isActive !== false);
  },

  /**
   * GET /api/activities/{id}/schedules
   * Horarios de una actividad específica.
   */
  getActivitySchedules: async (activityId: number, params?: { limit?: number; offset?: number }) => {
    const response = await reservationClient.get(`/api/activities/${activityId}/schedules`, { params });
    return response.data;
  },

  /**
   * POST /api/reservations
   * Crear una nueva reserva.
   */
  createReservation: async (payload: CreateReservationPayload): Promise<ReservationResponse> => {
    const response = await reservationClient.post('/api/reservations', payload);
    return response.data?.data ?? response.data;
  },

  createFreeReservation: async (payload: CreateFreeReservationPayload): Promise<ReservationResponse> => {
    // Construcción ESTRICTA: solo los campos del flujo libre.
    // 'gymActivityScheduleId' NUNCA debe existir (ni como null, 0 o undefined).
    // 'activityId' es REQUERIDO por el backend para flujo isFreeAccess=true.
    const { gymId, activityId, reservationDate, startTime, endTime } = payload;
    const response = await reservationClient.post('/api/reservations', {
      gymId,
      activityId,
      reservationDate,
      startTime,
      endTime,
    });
    return response.data?.data ?? response.data;
  },

  /**
   * GET /api/reservations/user/{userId}
   * El backend devuelve los datos anidados:
   *   reservation.gymActivitySchedule.gymActivity.name  → nombre de actividad
   *   reservation.gymActivitySchedule.startTime         → hora inicio
   *   reservation.gymActivitySchedule.dayOfWeek         → día
   */
  getMyReservations: async (params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<UserReservation>> => {
    try {
      const response = await reservationClient.get('/api/reservations/me', { params });
      const rawData = response.data;
      const list: any[] = Array.isArray(rawData.data) ? rawData.data : [];

      return {
        data: list.filter(Boolean).map((r: any) => {
          // Flujo libre  → r.gymActivitySchedule = null, r.activity = GymActivity
          // Flujo programado → r.gymActivitySchedule = Schedule, r.activity = null
          const schedule     = r?.gymActivitySchedule ?? null;
          const isFreeAccess = schedule === null;

          const freeAct    = r?.freeActivity ?? r?.activity;       // solo flujo libre
          const schedAct   = schedule?.gymActivity;              // solo flujo programado
          const instructor = schedule?.instructor;

          const firstName = instructor?.profile?.firstName ?? '';
          const lastName  = instructor?.profile?.lastName  ?? '';
          const instructorName = (firstName + ' ' + lastName).trim() || undefined;

          // startTime/endTime: top-level (flujo libre) o desde el schedule (programada)
          const rawSt = r?.startTime ?? schedule?.startTime ?? '';
          const rawEt = r?.endTime   ?? schedule?.endTime   ?? '';
          const st = String(rawSt).slice(0, 5) || undefined;
          const et = String(rawEt).slice(0, 5) || undefined;

          return {
            id:                  r?.id,
            status:              r?.status,
            reservationDate:     typeof r?.reservationDate === 'string'
                                   ? r.reservationDate.substring(0, 10)
                                   : String(r?.reservationDate ?? '').substring(0, 10),
            qrToken:             r?.qrToken ?? undefined,
            cancelledAt:         r?.cancelledAt ?? null,
            canCancel:           !r?.cancelledAt && !['CANCELADA','CANCELLED','COMPLETADA','USADA','CADUCADA'].includes(r?.status),
            isFreeAccess,
            activityName:        isFreeAccess ? freeAct?.name : schedAct?.name,
            activityDescription: isFreeAccess ? freeAct?.description : schedAct?.description,
            gymId:               r?.gymId ?? schedAct?.gymId,
            gymName:             r?.gym?.name ?? schedAct?.gym?.name ?? freeAct?.gym?.name ?? undefined,
            createdAt:           r?.createdAt,
            startTime:           st,
            endTime:             et,
            dayOfWeek:           schedule?.dayOfWeek,
            instructorName,
            instructorPhone:     r?.instructorPhone ?? null,
            gerentePhone:        r?.gerentePhone ?? null,
          };
        }),
        meta: rawData.meta ?? {
          total: rawData.total ?? list.length,
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
        },
      };
    } catch (err: any) {
      const status = err?.response?.status;
      console.warn(`[Reservas] Error ${status ?? '?'}:`, err?.response?.data?.message ?? err?.message);
      // 401 → ya lo maneja attach401Guard (alerta + logout automático)
      if (status === 403) {
        const payload = await AuthService.getTokenPayload();
        console.warn('[Reservas] JWT payload actual:', JSON.stringify(payload));
        throw Object.assign(new Error('FORBIDDEN'), { isForbidden: true });
      }
      if (status === 404) return { data: [], meta: { total: 0, limit: params?.limit ?? 20, offset: params?.offset ?? 0 } };
      throw err;
    }
  },

  /**
   * PUT /api/reservations/{id}/cancel
   */
  cancelReservation: async (reservationId: number): Promise<{ success: boolean }> => {
    const response = await reservationClient.put(`/api/reservations/${reservationId}/cancel`);
    return response.data?.data ?? response.data;
  },

  /**
   * GET /api/reservations?date=YYYY-MM-DD
   * Para GERENTE: el backend filtra por gymId del JWT automáticamente.
   */
  getGymReservations: async (date?: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<any>> => {
    const response = await reservationClient.get('/api/reservations', {
      params: { ...(date ? { date } : {}), ...params },
    });
    return response.data;
  },

  /**
   * GET /api/reservations/gym
   * Auditoría de sede: gymId del JWT (applyListScope en backend).
   * Sin filtro de fecha — devuelve todas las reservas de la sede.
   */
  getGymReservationsByGymId: async (_gymId: number, date?: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<any>> => {
    const response = await reservationClient.get('/api/reservations/gym', {
      params: { ...(date ? { date } : {}), ...params },
    });
    return response.data;
  },

  /**
   * PATCH /api/reservations/:id/check-in
   * Marca la reserva como COMPLETADA (gerente valida QR de entrada).
   */
  checkInReservation: async (reservationId: number): Promise<{ success: boolean }> => {
    const response = await reservationClient.patch(`/api/reservations/${reservationId}/check-in`);
    return response.data?.data ?? response.data;
  },

  /**
   * POST /api/reservations/check-in/token
   * Check-in seguro: token opaco del QR → backend resuelve reservationId internamente.
   */
  checkInByToken: async (token: string, forceCheckIn = false): Promise<{ success: boolean; reservationId?: number }> => {
    const response = await reservationClient.post('/api/reservations/check-in/token', { token, forceCheckIn });
    return response.data?.data ?? response.data;
  },

  /**
   * GET /api/reservations/:id/qr-token
   * JWT temporal de 3 min para el QR del cliente.
   * Backend devuelve { qrToken } — normalizamos a { token } para el componente.
   */
  getDynamicQRToken: async (reservationId: number): Promise<{ token: string }> => {
    const response = await reservationClient.get(`/api/reservations/${reservationId}/qr-token`);
    const raw = response.data?.data ?? response.data;
    // El backend usa la clave "qrToken"; normalizamos a "token"
    return { token: raw?.qrToken ?? raw?.token ?? '' };
  },

  /**
   * GET /api/reservations/:id
   * Detalle completo de una reserva (incluye nombre del cliente, fechas, horarios).
   */
  getReservationById: async (id: number): Promise<{
    id: number;
    status: string;
    reservationDate: string;
    startTime?: string;
    endTime?: string;
    activityName?: string;
    user?: { profile?: { fullName?: string } } | null;
    gymActivitySchedule?: { startTime?: string; endTime?: string; gymActivity?: { name?: string } } | null;
    freeActivity?: { name?: string } | null;
    gym?: { name?: string; brand?: { id?: number; name?: string } | null } | null;
  }> => {
    const response = await reservationClient.get(`/api/reservations/${id}`);
    return response.data?.data ?? response.data;
  },

  /**
   * PUT /api/reservations/{id}/confirm
   * Marca como COMPLETADA sin validar fecha (para check-in adelantado/manual).
   */
  confirmReservation: async (reservationId: number): Promise<{ success: boolean }> => {
    const response = await reservationClient.put(`/api/reservations/${reservationId}/confirm`);
    return response.data?.data ?? response.data;
  },

  /**
   * GET /api/subscriptions/user/{userId}
   * Estado de suscripción del usuario.
   */
  getSubscriptionStatus: async (): Promise<SubscriptionStatus> => {
    const user = await AuthService.getCurrentUser();
    if (!user?.userId) throw new Error('Usuario no autenticado');
    const response = await reservationClient.get(`/api/subscriptions/user/${user.userId}`);
    // El endpoint devuelve un array, tomamos la más reciente
    const data = response.data?.data ?? response.data;
    const subs = Array.isArray(data) ? data : [data];
    const active =
      subs.find((s: any) => s.status === 'ACTIVA' || s.status === 'ACTIVO' || s.isActive) ??
      subs[0];
    return active;
  },

  /**
   * GET /api/subscriptions/me/active
   * Membresía activa del usuario autenticado, enriquecida con días restantes
   * y sesiones usadas/restantes (planes por sesiones). null si no tiene.
   */
  getMyActiveMembership: async (): Promise<ActiveMembership | null> => {
    const response = await reservationClient.get('/api/subscriptions/me/active');
    const data = response.data?.data ?? response.data;
    if (!data || typeof data !== 'object' || !('id' in data)) return null;
    return data as ActiveMembership;
  },

  /**
   * GET /api/subscriptions/checkin-calendar/me
   * Calendario mensual de check-ins de la propia membresía (carnet visual).
   * `month` en formato 'YYYY-MM' — sin especificar, el backend usa el mes actual.
   */
  getMyCheckinCalendar: async (month?: string): Promise<CheckinCalendarDto | null> => {
    const response = await reservationClient.get('/api/subscriptions/checkin-calendar/me', {
      params: month ? { month } : undefined,
    });
    const data = response.data?.data ?? response.data;
    if (!data || typeof data !== 'object' || !('subscriptionId' in data)) return null;
    return data as CheckinCalendarDto;
  },
};
