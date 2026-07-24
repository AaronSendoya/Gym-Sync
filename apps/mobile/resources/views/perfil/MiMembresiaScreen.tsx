import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { reservationApi } from '../../../app/Providers/reservations/api/reservation.api';
import type { ActiveMembership, CheckinCalendarDto } from '../../../app/Providers/reservations/api/reservation.types';
import { cachedFetch } from '../../../app/Providers/offline/QueryCache';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';
import { MembershipCarnet } from '../../components/MembershipCarnet';

const ORANGE = '#FF5E00';

const fmtDate = (iso: string): string => {
  const d = String(iso).split('T')[0];
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

export const MiMembresiaScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = (user as any)?.userId ?? (user as any)?.id ?? 'anon';

  const { data: membership, isLoading, isError, refetch, isRefetching } = useQuery<ActiveMembership | null>({
    queryKey: ['my-active-membership', userId],
    // Read-through cache SQLite POR USUARIO: la clave incluye el userId para
    // que otro usuario del mismo dispositivo nunca vea datos ajenos offline.
    queryFn: () => cachedFetch(`my-active-membership:${userId}`, reservationApi.getMyActiveMembership),
    enabled: userId !== 'anon',
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const bySessions = membership?.plan?.sessionsIncluded != null;
  const sessionsIncluded = Number(membership?.plan?.sessionsIncluded ?? 0);
  const sessionsUsed = Number(membership?.sessionsUsed ?? 0);
  const progress = bySessions && sessionsIncluded > 0
    ? Math.min(1, sessionsUsed / sessionsIncluded)
    : 0;

  // Carnet visual — calendario mensual de check-ins. Navegable, no se puede
  // adelantar al mes en curso (mismo criterio que el carnet web para staff).
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const isCurrentOrFutureMonth =
    cursor.year > now.getFullYear() ||
    (cursor.year === now.getFullYear() && cursor.month >= now.getMonth() + 1);
  const monthParam = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;

  const { data: calendar, isLoading: calendarLoading } = useQuery<CheckinCalendarDto | null>({
    queryKey: ['my-checkin-calendar', userId, monthParam],
    queryFn: () => cachedFetch(
      `my-checkin-calendar:${userId}:${monthParam}`,
      () => reservationApi.getMyCheckinCalendar(monthParam),
    ),
    // NO depende de `membership` — pedirlo en paralelo (en vez de esperar a
    // que la membresía resuelva primero) evita una cascada de 2 round-trips
    // secuenciales, que era la causa real de la carga lenta al entrar a esta
    // pantalla.
    enabled: userId !== 'anon',
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const goPrevMonth = () => {
    setCursor(c => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }));
  };
  const goNextMonth = () => {
    if (isCurrentOrFutureMonth) return;
    setCursor(c => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }));
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Mi Membresía</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <DumbbellSpinner size="large" color={ORANGE} />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="wifi-off" size={40} color="#444" />
          <Text style={s.errTxt}>No se pudo cargar tu membresía.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : !membership ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="card-account-details-outline" size={52} color="#222" />
          <Text style={s.emptyTitle}>Sin membresía activa</Text>
          <Text style={s.emptySub}>
            Acércate a la recepción de tu sucursal para inscribir tu mensualidad o un plan por sesiones.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ORANGE} />
          }
        >
          {/* Carnet visual — plan, sucursal, vigencia y calendario de asistencia.
              Nunca muestra el número de usuario (decisión de producto). Si el
              calendario aún no cargó o falló, se cae a una tarjeta simple para
              que la pantalla nunca se vea rota. */}
          {calendar ? (
            <MembershipCarnet
              data={calendar}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              canGoNext={!isCurrentOrFutureMonth}
            />
          ) : calendarLoading ? (
            <View style={[s.card, s.carnetPlaceholder]}>
              <DumbbellSpinner size="small" color={ORANGE} />
            </View>
          ) : (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.planIconWrap}>
                  <MaterialCommunityIcons
                    name={bySessions ? 'dumbbell' : 'calendar-month'}
                    size={22}
                    color={ORANGE}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.planName}>{membership.plan.name}</Text>
                  {membership.homeGymName ? (
                    <Text style={s.gymName}>{membership.homeGymName}</Text>
                  ) : null}
                </View>
                <View style={s.statusBadge}>
                  <Text style={s.statusTxt}>{membership.status}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.rowBetween}>
                <View style={s.dateBlock}>
                  <MaterialCommunityIcons name="calendar-check" size={16} color="#8E8E93" />
                  <Text style={s.dateLabel}>Inscripción</Text>
                  <Text style={s.dateValue}>{fmtDate(membership.startDate)}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-right" size={16} color="#3A3A3C" />
                <View style={s.dateBlock}>
                  <MaterialCommunityIcons name="calendar-alert" size={16} color="#8E8E93" />
                  <Text style={s.dateLabel}>{bySessions ? 'Fin de ventana' : 'Vencimiento'}</Text>
                  <Text style={s.dateValue}>{fmtDate(membership.endDate)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Días restantes + cobertura de acceso */}
          <View style={s.card}>
            <View style={s.daysWrap}>
              <Text style={s.daysNumber}>{membership.daysRemaining}</Text>
              <Text style={s.daysLabel}>
                {membership.daysRemaining === 1 ? 'día restante' : 'días restantes'}
              </Text>
            </View>

            <View style={s.coverageRow}>
              <MaterialCommunityIcons
                name={membership.plan.scope === 'MARCA' ? 'crown-outline' : 'map-marker-outline'}
                size={15}
                color={membership.plan.scope === 'MARCA' ? '#f59e0b' : '#8E8E93'}
              />
              <Text style={s.coverageTxt}>
                {membership.plan.scope === 'MARCA'
                  ? `Válida en todas las sucursales de ${membership.brandName ?? 'tu marca'}`
                  : `Válida solo en ${membership.homeGymName ?? 'tu sucursal de inscripción'}`}
              </Text>
            </View>

            {/* Progreso de sesiones (solo planes por sesiones) */}
            {bySessions && (
              <>
                <View style={s.divider} />
                <View style={s.rowBetween}>
                  <Text style={s.sessionsLabel}>Sesiones utilizadas</Text>
                  <Text style={s.sessionsValue}>
                    {sessionsUsed} de {sessionsIncluded}
                  </Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={s.sessionsRemaining}>
                  {Number(membership.sessionsRemaining ?? 0)} sesiones disponibles. Solo cuentan tus ingresos reales al gimnasio.
                </Text>
              </>
            )}
          </View>

          {/* Nota de recordatorio */}
          <View style={s.noteCard}>
            <MaterialCommunityIcons name="bell-ring-outline" size={18} color={ORANGE} />
            <Text style={s.noteTxt}>
              Te enviaremos una notificación cuando tu membresía esté por vencer, para que la renueves a tiempo en tu sucursal.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#1C1C1E',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errTxt: { color: '#8E8E93', fontSize: 14, marginTop: 12 },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: ORANGE,
  },
  retryTxt: { color: ORANGE, fontSize: 14, fontWeight: '600' },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptySub: { color: '#8E8E93', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },

  scroll: { padding: 16, paddingBottom: 32, gap: 14 },

  carnetPlaceholder: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: '#1C1C1E', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#FF5E0022',
    alignItems: 'center', justifyContent: 'center',
  },
  planName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  gymName: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  statusBadge: {
    backgroundColor: '#22c55e22', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: '#22c55e55',
  },
  statusTxt: { color: '#22c55e', fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 14 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateBlock: { alignItems: 'center', gap: 3, flex: 1 },
  dateLabel: { color: '#8E8E93', fontSize: 11 },
  dateValue: { color: '#fff', fontSize: 14, fontWeight: '600' },

  daysWrap: { alignItems: 'center' },
  daysNumber: { color: ORANGE, fontSize: 40, fontWeight: '800' },
  daysLabel: { color: '#8E8E93', fontSize: 13 },

  coverageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12,
  },
  coverageTxt: { color: '#B0B0B0', fontSize: 12, textAlign: 'center', flexShrink: 1 },

  sessionsLabel: { color: '#B0B0B0', fontSize: 13 },
  sessionsValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
  progressTrack: {
    height: 8, backgroundColor: '#2C2C2E', borderRadius: 999, marginTop: 8, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: ORANGE, borderRadius: 999 },
  sessionsRemaining: { color: '#8E8E93', fontSize: 12, marginTop: 8, lineHeight: 17 },

  noteCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  noteTxt: { color: '#B0B0B0', fontSize: 12, lineHeight: 18, flex: 1 },
});
