import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { Env } from '../geolocation/config/environment';
import { AuthService } from '../auth/AuthService';
import { authEvents } from '../auth/authEvents';
import { useAuth } from '../../Shared/hooks/useAuth';
import { useSocket } from './SocketContext';

const getLevel = (user: any): number => user?.level ?? 0;

type GymEventPayload = {
  message?: string;
  reservationId?: number;
  scheduleId?: number;
  gymId?: number;
};

type AforoUpdatedPayload = {
  gymId: number;
  current: number;
};

async function showLocalGymNotification(
  event: 'new_reservation' | 'cancel_reservation',
  payload: GymEventPayload,
): Promise<void> {
  const isNew = event === 'new_reservation';
  const title = isNew ? 'Nueva Reserva' : 'Reserva Cancelada';
  const body =
    payload.message ??
    (isNew
      ? 'Un cliente acaba de reservar un cupo en tu sucursal.'
      : 'Un cliente ha cancelado su reserva, se ha liberado un cupo.');

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: isNew ? 'NEW_RESERVATION' : 'CANCEL_RESERVATION',
          reservationId: payload.reservationId,
          scheduleId: payload.scheduleId,
          gymId: payload.gymId,
        },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[GymEvents] local notification error:', e);
  }
}

function invalidateManagerQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  reservationId?: number,
): void {
  queryClient.invalidateQueries({ queryKey: ['gym-audit-reservations'] });
  queryClient.invalidateQueries({ queryKey: ['manager-dashboard-stats'] });

  if (reservationId != null) {
    queryClient.setQueriesData<any[]>(
      { queryKey: ['gym-audit-reservations'] },
      (old) => (Array.isArray(old) ? old.filter((r) => r?.id !== reservationId) : old),
    );
  }
}

export function useGymEventsSocket(): void {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { setSocket } = useSocket();
  const socketRef = useRef<Socket | null>(null);

  const level = getLevel(user);
  const shouldConnect = isAuthenticated && level >= 1;

  useEffect(() => {
    if (!shouldConnect) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    let cancelled = false;

    const connect = async () => {
      const token = await AuthService.getToken();
      if (!token || cancelled) return;

      const socket = io(`${Env.API_BASE_URL}/events`, {
        auth: { token: token.trim() },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;
      setSocket(socket);

      socket.on('connect', () => {
        const trimmedToken = token.trim();
        if (level >= 10) {
          socket.emit('join_room', { room: 'admin_room', token: trimmedToken });
        } else if (level >= 4 && user?.gymId) {
          socket.emit('join_room', { room: `gym_${user.gymId}`, token: trimmedToken });
        }
      });

      socket.on('disconnect', () => {});

      socket.on('connect_error', (err) => {
        console.warn('[GymEvents] connect_error:', err.message);
      });

      const handleReservationEvent = async (
        event: 'new_reservation' | 'cancel_reservation',
        payload: GymEventPayload,
      ) => {
        invalidateManagerQueries(queryClient, payload?.reservationId);
        await showLocalGymNotification(event, payload ?? {});
      };

      socket.on('new_reservation', (payload: GymEventPayload) => {
        void handleReservationEvent('new_reservation', payload ?? {});
      });

      socket.on('cancel_reservation', (payload: GymEventPayload) => {
        void handleReservationEvent('cancel_reservation', payload ?? {});
      });

      if (level >= 2 && level <= 3) {
        socket.on('routine_session_update', (payload: any) => {
          const userId = payload?.userId ?? payload?.user?.id;
          if (userId != null) {
            queryClient.invalidateQueries({ queryKey: ['trainer-client-sessions', userId] });
          }
          queryClient.invalidateQueries({ queryKey: ['trainer-client-sessions'] });
        });
      }

      socket.on('aforo_updated', (payload: AforoUpdatedPayload) => {
        queryClient.invalidateQueries({ queryKey: ['frequent-gyms'] });
        queryClient.invalidateQueries({ queryKey: ['sedes-cercanas'] });
        if (payload?.gymId != null) {
          queryClient.invalidateQueries({ queryKey: ['gym-aforo', payload.gymId] });
        }
      });

      socket.on('chat_message', () => {
        // Actualiza la bandeja de entrada cuando llega un mensaje en cualquier conv.
        // La pantalla ChatScreen escucha este mismo evento directamente via useSocket()
        // para actualizar su estado local sin necesidad de re-fetch HTTP.
        queryClient.invalidateQueries({ queryKey: ['inbox'] });
      });

      // Congelar/descongelar/cancelar una membresía desde la web de staff debe
      // reflejarse de inmediato si el cliente tiene "Mi Membresía" abierta en
      // ese momento — sin esto, solo se enteraba al hacer pull-to-refresh o
      // al reabrir la pantalla (staleTime 5 min). emitToUser en el backend ya
      // garantiza que solo el cliente dueño de la membresía recibe el evento.
      socket.on('membership_status_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['my-active-membership'] });
        queryClient.invalidateQueries({ queryKey: ['my-checkin-calendar'] });
      });

      const advisoryEvents = ['advisory_request', 'advisory_accepted', 'advisory_rejected', 'advisory_cancelled'];
      for (const evt of advisoryEvents) {
        socket.on(evt, async (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ['staff-requests'] });
          queryClient.invalidateQueries({ queryKey: ['staff-catalog'] });
          queryClient.invalidateQueries({ queryKey: ['advisor-requests'] });
          queryClient.invalidateQueries({ queryKey: ['active-clients'] });
          if (payload?.message) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: evt.includes('request') ? 'Solicitud de Asesoría'
                  : evt.includes('accepted') ? 'Asesoría Aceptada'
                  : evt.includes('rejected') ? 'Solicitud Rechazada'
                  : 'Asesoría Cancelada',
                body: payload.message,
                sound: 'default',
              },
              trigger: null,
            });
          }
        });
      }
    };

    void connect();

    const offLogout = authEvents.onForceLogout(() => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    });

    return () => {
      cancelled = true;
      offLogout();
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [shouldConnect, queryClient, setSocket]);
}
