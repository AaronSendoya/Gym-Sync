/**
 * useNotifications Hook
 * ---------------------
 * Establece un canal WebSocket persistente con el backend (Socket.io).
 * El token se envía via cookie HttpOnly (withCredentials: true) y también
 * via handshake.auth para compatibilidad con el gateway durante la transición.
 *
 * Estrategia de Salas (Rooms):
 *   - GERENTE     → gym_{gymId}   (aislamiento estricto por sucursal)
 *   - SUPER_ADMIN → admin_room    (visibilidad global)
 */

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export interface SecurityAlertPayload {
  gymId: number;
  gymName: string;
  attemptedUserId: number;
  reason: string;
  timestamp: string;
  isLive: true;
}

export const useNotifications = () => {
  const { user, sessionEpoch } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Solo roles con acceso al módulo de auditoría reciben el socket
    if ((user.level ?? 0) < 4) return;

    console.log(
      `[NotificationGateway]: Iniciando conexión WS para nivel ${user.level}...`,
    );

    const BACKEND_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const SOCKET_URL = `${BACKEND_URL}/events`;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,   // nunca rendirse — el backend puede tardar >10 s en reiniciar
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,      // backoff exponencial capped en 15 s
      autoConnect: false,
    });

    socketRef.current = socket;

    let isMounted = true;

    const connectTimer = setTimeout(() => {
      if (!isMounted) return;
      socket.connect();
    }, 0);

    socket.on('connect', () => {
      console.log(
        `[NotificationGateway]: Conexión establecida. Socket ID: ${socket.id}`,
      );

      // Unirse a la sala correspondiente según rol
      if ((user.level ?? 0) >= 4 && (user.level ?? 0) < 10 && user.gymId) {
        const room = `gym_${user.gymId}`;
        socket.emit('join_room', { room });
        console.log(`[NotificationGateway]: nivel ${user.level} unido a sala: ${room}`);
      } else if ((user.level ?? 0) >= 10) {
        socket.emit('join_room', { room: 'admin_room' });
        console.log(`[NotificationGateway]: nivel ${user.level} unido a sala: admin_room`);
      }
    });

    socket.on('security_alert', (payload: SecurityAlertPayload) => {
      console.warn(
        `[SecurityAlert LIVE]: Acceso denegado en ${payload.gymName} | Usuario ${payload.attemptedUserId} | ${payload.reason}`,
      );

      // Validación de privacidad: el GERENTE no ve alertas de otras sedes
      if (
        (user.level ?? 0) >= 4 && (user.level ?? 0) < 10 &&
        user.gymId &&
        String(payload.gymId) !== String(user.gymId)
      ) {
        console.warn(
          `[Security Guard]: Alerta de Sucursal ajena descartada para nivel ${user.level} ID ${user.id}. Sucursal recibida: ${payload.gymId}`,
        );
        return;
      }

      toast.error(
        ` Alerta de Seguridad\nAcceso denegado a Usuario ${payload.attemptedUserId}\nen sucursal "${payload.gymName}"`,
        {
          duration: 10000,
          style: {
            background: '#1C1C1E',
            color: '#fff',
            border: '2px solid #FF5E00',
            whiteSpace: 'pre-wrap',
            maxWidth: '380px',
          },
          icon: '🚨',
        },
      );
    });

    socket.on('connect_error', (err) => {
      console.warn(
        `[NotificationGateway]: Error de conexión WS -`,
        err.message,
      );
    });

    socket.on('disconnect', (reason) => {
      console.log(`[NotificationGateway]: Desconectado. Razón: ${reason}`);
    });

    return () => {
      isMounted = false;
      clearTimeout(connectTimer);
      console.log('[NotificationGateway]: Limpiando conexión WS...');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // sessionEpoch: tras una recuperación de backend (refreshSession exitoso post-caída)
    // el epoch cambia → este efecto se re-ejecuta → reconecta y re-emite join_room.
  }, [user?.id, user?.level, user?.gymId, sessionEpoch]);

  return socketRef;
};
