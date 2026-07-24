import { useQuery } from '@tanstack/react-query';
import { reservationApi } from '../api/reservation.api';

/**
 * Estado de membresía del cliente autenticado.
 * Usa GET /subscriptions/me/active: el backend ya resuelve cuál es la
 * activa y calcula días restantes/sesiones — sin heurísticas locales.
 */
export const useSubscriptionGuard = () => {
  const { data: subscription, isLoading, isError } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: reservationApi.getMyActiveMembership,
    staleTime: 1000 * 60 * 5, // 5 min de caché
    retry: 1,
  });

  // 'ACTIVA' es el estándar; 'ACTIVO' tolera datos legados
  const isActive =
    !!subscription &&
    (subscription.status === 'ACTIVA' || subscription.status === 'ACTIVO') &&
    subscription.daysRemaining > 0 &&
    (subscription.sessionsRemaining === null || subscription.sessionsRemaining > 0);

  return {
    isActive,
    canReserve: isActive,
    subscription,
    isLoading,
    isError,
  };
};
