import React, { useState, useCallback } from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';
import {
  staffApi,
  InstructorWeeklySchedule,
} from '../../../app/Providers/staff/api/staff.api';

const SCREEN_W = Dimensions.get('window').width;

const fmt5 = (t?: string) => t?.substring(0, 5) ?? '—';

const DAY_ORDER: Record<string, number> = {
  LUNES: 1, MARTES: 2, MIERCOLES: 3, MIÉRCOLES: 3,
  JUEVES: 4, VIERNES: 5, SABADO: 6, SÁBADO: 6, DOMINGO: 7,
};
const DAY_LABEL: Record<string, string> = {
  LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', MIÉRCOLES: 'Miércoles',
  JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', SÁBADO: 'Sábado', DOMINGO: 'Domingo',
};

// JS Date.getDay() index → Spanish day name stored in DB (no accents)
const JS_DAY_TO_DB = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

// ── ScheduleCard ─────────────────────────────────────────────────────────────
const ScheduleCard = ({ schedule }: { schedule: InstructorWeeklySchedule }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const enrolled = schedule.enrolledCount;
  const max      = schedule.maxCapacity;
  const aforo    = max > 0 ? `${enrolled} / ${max}` : `${enrolled}`;
  const afoColor = max <= 0
    ? '#555'
    : enrolled >= max         ? '#00E5A3'
    : enrolled >= max * 0.8   ? '#FF5E00'
    : '#22C55E';

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => setIsExpanded(prev => !prev)}
    >
      <View style={s.cardHeader}>
        <View style={s.timeCol}>
          <Text style={s.timeStart}>{fmt5(schedule.startTime)}</Text>
          <View style={s.timeLine} />
          <Text style={s.timeEnd}>{fmt5(schedule.endTime)}</Text>
        </View>
        <View style={s.infoCol}>
          <Text style={s.actName} numberOfLines={1}>{schedule.activityName}</Text>
          {!!schedule.gymName && (
            <View style={s.metaRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={12} color="#555" />
              <Text style={s.metaTxt}>{schedule.gymName}</Text>
            </View>
          )}
        </View>
        <View style={s.enrollCol}>
          <MaterialCommunityIcons name="account-group-outline" size={16} color={afoColor} />
          <Text style={[s.enrollNum, { color: afoColor }]}>{enrolled}</Text>
          {max > 0 && <Text style={s.enrollMax}>/ {max}</Text>}
          <Text style={s.enrollLabel}>alumnos</Text>
        </View>
        <Feather
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#555"
        />
      </View>

      {isExpanded && (
        <View style={s.expandedBlock}>
          <View style={s.afoRow}>
            <Text style={s.afoLabel}>Aforo (Capacidad):</Text>
            <Text style={[s.afoValue, { color: afoColor }]}>{aforo}</Text>
          </View>
          {!schedule.attendees || schedule.attendees.length === 0 ? (
            <Text style={s.attendeesEmpty}>Sin lista de alumnos disponible.</Text>
          ) : (
            schedule.attendees.map((a, i) => (
              <View key={String(a.id ?? i)} style={s.attendeeRow}>
                <Feather name="user" size={13} color="#FF5E00" />
                <Text style={s.attendeeName}>{a.fullName}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── ItinCard ─────────────────────────────────────────────────────────────────
const ItinCard = ({ sch }: { sch: InstructorWeeklySchedule }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const enrolled  = sch.enrolledCount;
  const max       = sch.maxCapacity;
  const clrEnroll = max <= 0
    ? '#888'
    : enrolled >= max       ? '#00E5A3'
    : enrolled >= max * 0.8 ? '#FF5E00'
    : '#888';

  const dayLabel = sch.dayOfWeek
    ? (DAY_LABEL[(sch.dayOfWeek).toUpperCase()] ?? sch.dayOfWeek)
    : null;

  return (
    <TouchableOpacity
      style={s.itinCard}
      onPress={() => setIsExpanded(prev => !prev)}
      activeOpacity={0.85}
    >
      {dayLabel && (
        <View style={s.itinDayRow}>
          <Text style={s.itinDay}>{dayLabel}</Text>
        </View>
      )}
      <View style={s.itinRow}>
        <Feather name="clock" size={13} color="#38BDF8" />
        <Text style={s.itinTime}>
          {(sch.startTime ?? '').substring(0, 5)}
          {sch.endTime ? ` - ${sch.endTime.substring(0, 5)}` : ''}
        </Text>
        <Feather
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#555"
          style={{ marginLeft: 'auto' }}
        />
      </View>
      <View style={s.itinRow}>
        <Feather name="activity" size={13} color="#fff" />
        <Text style={s.itinName} numberOfLines={1}>{sch.activityName ?? 'Clase'}</Text>
      </View>
      <View style={s.itinRow}>
        <Feather name="map-pin" size={13} color="#555" />
        <Text style={s.itinPlace} numberOfLines={1}>{sch.gymName ?? '—'}</Text>
      </View>
      <View style={s.itinRow}>
        <Feather name="users" size={13} color={clrEnroll} />
        <Text style={[s.itinEnroll, { color: clrEnroll }]}>
          {enrolled} / {max > 0 ? max : '?'} Alumnos
          {enrolled >= max && max > 0 ? '  •  Lleno' : ''}
        </Text>
      </View>

      {isExpanded && (
        <View style={s.attendeesBlock}>
          <Text style={s.attendeesLabel}>Alumnos Inscritos:</Text>
          {!sch.attendees || sch.attendees.length === 0 ? (
            <Text style={s.attendeesEmpty}>Nadie ha reservado aún.</Text>
          ) : (
            sch.attendees.map((attendee, i) => (
              <View key={String(attendee.id ?? i)} style={s.attendeeRow}>
                <Feather name="user" size={14} color="#FF5E00" />
                <Text style={s.attendeeName}>{attendee.fullName}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── Dashboard principal ───────────────────────────────────────────────────────
export const InstructorDashboard = () => {
  const { user }   = useAuth();
  const navigation = useNavigation<any>();
  const firstName  = (user as any)?.profile?.firstName ?? (user as any)?.firstName ?? '';
  const lastName   = (user as any)?.profile?.lastName  ?? (user as any)?.lastName  ?? '';
  const fullName   = `${firstName}${lastName ? ' ' + lastName : ''}`.trim() || 'Instructor';
  const myLevel    = Number((user as any)?.level ?? 0);
  const hora       = new Date().getHours();
  const saludo     = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  const hoy        = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  // Day name matching DB format (no accents)
  const todayDayName = JS_DAY_TO_DB[new Date().getDay()];

  // ── Queries ──────────────────────────────────────────────────────────────
  const {
    data:    weeklySchedulesRaw,
    isLoading: schedLoading,
    isError:   schedError,
    refetch:   refetchSched,
  } = useQuery({
    queryKey:  ['instructor-weekly-schedules'],
    queryFn:   () => staffApi.getMyWeeklySchedules(),
    staleTime: 5 * 60_000,
    retry:     1,
  });
  const weeklySchedules: InstructorWeeklySchedule[] = Array.isArray(weeklySchedulesRaw)
    ? weeklySchedulesRaw
    : ((weeklySchedulesRaw as any)?.data ?? []);

  const {
    data:    statsDataRaw,
    refetch: refetchStats,
  } = useQuery({
    queryKey:  ['instructor-attendance-stats'],
    queryFn:   () => staffApi.getMyAttendanceStats(),
    staleTime: 5 * 60_000,
    retry:     1,
  });
  const statsData: { label: string; value: number }[] = Array.isArray(statsDataRaw)
    ? statsDataRaw
    : ((statsDataRaw as any)?.data ?? []);

  const { data: dashStats } = useQuery({
    queryKey: ['instructor-dashboard-stats'],
    queryFn:  staffApi.getDashboardStats,
    staleTime: 60_000,
    retry: 1,
  });
  const activeClients   = dashStats?.activeClients   ?? 0;
  const pendingRequests = dashStats?.pendingRequests ?? 0;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchSched(), refetchStats()]);
    setIsRefreshing(false);
  }, [refetchSched, refetchStats]);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const todaySchedules     = weeklySchedules.filter(s =>
    (s.dayOfWeek ?? '').toUpperCase() === todayDayName,
  );
  const totalTodayStudents = todaySchedules.reduce((sum, s) => sum + s.enrolledCount, 0);

  const chartLabels = statsData.map(p => p.label.substring(0, 5));
  const chartData   = statsData.map(p => Math.max(0, p.value));
  const hasChart    = statsData.length > 0 && chartData.some(v => v > 0);

  const sortedSchedules = [...weeklySchedules].sort((a, b) => {
    const da = DAY_ORDER[(a.dayOfWeek ?? '').toUpperCase()] ?? 9;
    const db = DAY_ORDER[(b.dayOfWeek ?? '').toUpperCase()] ?? 9;
    if (da !== db) return da - db;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });

  const nowMs = Date.now();
  const upcomingClases = todaySchedules
    .filter(s => {
      if (!s.startTime) return false;
      try {
        const [h, m] = s.startTime.split(':').map(Number);
        const t = new Date();
        t.setHours(h, m, 0, 0);
        return t.getTime() > nowMs;
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#f05b22"
            colors={['#f05b22']}
          />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.saludo}>{saludo},</Text>
            <Text style={s.nombre}>{fullName}</Text>
            <Text style={s.sub}>Mis Clases de Hoy</Text>
          </View>
          <View style={s.avatar}>
            <MaterialCommunityIcons name="whistle-outline" size={28} color="#f05b22" />
          </View>
        </View>

        <View style={s.fechaRow}>
          <MaterialCommunityIcons name="calendar-today" size={13} color="#555" />
          <Text style={s.fechaTxt}>{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</Text>
        </View>

        {/* KPI B2B */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiNum}>{activeClients}</Text>
            <Text style={s.kpiLabel}>ALUMNOS ACTIVOS</Text>
          </View>
          <View style={[s.kpiCard, pendingRequests > 0 && { borderColor: '#FF5E00' }]}>
            <Text style={[s.kpiNum, pendingRequests > 0 && { color: '#FF5E00' }]}>{pendingRequests}</Text>
            <Text style={s.kpiLabel}>SOLICITUDES</Text>
          </View>
        </View>

        {/* Resumen */}
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryNum}>{schedLoading ? '—' : todaySchedules.length}</Text>
            <Text style={s.summaryLabel}>Clases hoy</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryNum}>{schedLoading ? '—' : totalTodayStudents}</Text>
            <Text style={s.summaryLabel}>Alumnos hoy</Text>
          </View>
        </View>

        {/* ── Gráfico — completadas por horario ── */}
        <Text style={s.sectionTitle}>Completadas por Horario</Text>
        <Text style={s.sectionSub}>Reservas completadas en los últimos 30 días</Text>
        {hasChart ? (
          <View style={s.chartCard}>
            <BarChart
              data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
              width={SCREEN_W - 32}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              showValuesOnTopOfBars
              chartConfig={{
                backgroundColor:        'transparent',
                backgroundGradientFrom: '#0e0e0e',
                backgroundGradientTo:   '#0e0e0e',
                decimalPlaces: 0,
                color:       (opacity = 1) => `rgba(255, 94, 0, ${opacity})`,
                labelColor:  (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
                barPercentage: 0.55,
                propsForBackgroundLines: { stroke: '#1a1a1a' },
              }}
              style={s.chart}
            />
          </View>
        ) : (
          <View style={s.emptyBlock}>
            <Feather name="bar-chart-2" size={36} color="#2a2a2a" />
            <Text style={s.emptySub}>Sin estadísticas de asistencia disponibles.</Text>
          </View>
        )}

        {/* ── Itinerario Semanal ── */}
        <Text style={[s.sectionTitle, { marginTop: 16 }]}>Itinerario Semanal</Text>
        <Text style={s.sectionSub}>Todos tus horarios registrados en el sistema</Text>

        {schedLoading ? (
          <View style={s.center}>
            <DumbbellSpinner color="#f05b22" />
            <Text style={s.soft}>Cargando itinerario…</Text>
          </View>
        ) : schedError ? (
          <View style={s.center}>
            <MaterialCommunityIcons name="wifi-off" size={36} color="#333" />
            <Text style={s.soft}>No se pudo cargar el itinerario.</Text>
            <TouchableOpacity onPress={() => refetchSched()} style={s.retryBtn}>
              <Text style={s.retryTxt}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : sortedSchedules.length === 0 ? (
          <View style={s.emptyBlock}>
            <Feather name="calendar" size={44} color="#2a2a2a" />
            <Text style={s.emptyTitle}>Sin horarios asignados.</Text>
            <Text style={s.emptySub}>El administrador debe asignarte un itinerario.</Text>
          </View>
        ) : (
          sortedSchedules.map((sch, idx) => (
            <ItinCard key={`${sch.dayOfWeek ?? ''}-${sch.startTime}-${idx}`} sch={sch} />
          ))
        )}

        {/* ── Próximas Clases (solo hoy, aún no comenzadas) ── */}
        <Text style={[s.sectionTitle, { marginTop: 16 }]}>Próximas Clases</Text>
        <Text style={s.sectionSub}>Clases de hoy que aún no han comenzado</Text>

        {schedLoading ? (
          <View style={s.center}>
            <DumbbellSpinner color="#f05b22" />
            <Text style={s.soft}>Cargando agenda…</Text>
          </View>
        ) : upcomingClases.length === 0 ? (
          <View style={s.center}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#222" />
            <Text style={s.soft}>Sin clases pendientes para hoy.</Text>
          </View>
        ) : (
          upcomingClases.map((item, idx) => (
            <ScheduleCard key={`upcoming-${item.id}-${idx}`} schedule={item} />
          ))
        )}

        {/* Acceso Rápido — solo visible si al menos un botón aplica al nivel del usuario */}
        {(myLevel >= 4 || myLevel === 3) && (
          <Text style={[s.sectionTitle, { marginTop: 24 }]}>Accesos Rápidos</Text>
        )}
        {myLevel >= 4 && (
          <TouchableOpacity
            style={s.actionRow}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('ScannerQR' as never)}
          >
            <View style={s.actionIconBox}>
              <MaterialCommunityIcons name="qrcode-scan" size={20} color="#FF5E00" />
            </View>
            <Text style={s.actionRowTxt}>Escanear Ingreso</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#333" />
          </TouchableOpacity>
        )}
        {myLevel === 3 && (
          <TouchableOpacity
            style={s.actionRow}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MisAlumnos' as never)}
          >
            <View style={s.actionIconBox}>
              <MaterialCommunityIcons name="account-group-outline" size={20} color="#FF5E00" />
            </View>
            <Text style={s.actionRowTxt}>Gestionar Alumnos</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#333" />
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { padding: 20, paddingBottom: 100 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  headerLeft: { flex: 1 },
  saludo:     { color: '#888', fontSize: 15 },
  nombre:     { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  sub:        { color: '#D1D5DB', fontSize: 14, marginTop: 4 },
  avatar:     { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FF5E00' },

  fechaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  fechaTxt: { color: '#D1D5DB', fontSize: 14 },

  summaryRow:   { flexDirection: 'row', gap: 10, marginBottom: 24 },
  summaryCard:  { flex: 1, backgroundColor: '#111111', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1C1C1E' },

  kpiRow:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard:   { flex: 1, backgroundColor: '#111111', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1C1C1E' },
  kpiNum:    { color: '#FFFFFF', fontSize: 36, fontWeight: '800' as const },
  kpiLabel:  { color: '#E5E7EB', fontSize: 12, marginTop: 8, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: '600' as const },

  actionRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111111', borderRadius: 14, borderWidth: 1, borderColor: '#1C1C1E', paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8, gap: 14 },
  actionIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#2A0F00', justifyContent: 'center', alignItems: 'center' },
  actionRowTxt:  { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' as const },
  summaryNum:   { color: '#fff', fontSize: 26, fontWeight: '900' },
  summaryLabel: { color: '#D1D5DB', fontSize: 12, marginTop: 2 },

  sectionTitle: { color: '#D1D5DB', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  sectionSub:   { color: '#D1D5DB', fontSize: 12, marginBottom: 12 },

  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { color: '#D1D5DB', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySub:   { color: '#D1D5DB', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  chartCard: { backgroundColor: '#111111', borderRadius: 14, borderWidth: 1, borderColor: '#1C1C1E', overflow: 'hidden', marginBottom: 20 },
  chart:     { borderRadius: 14 },

  itinCard:   { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 10, gap: 8 },
  itinDayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  itinDay:    { color: '#f05b22', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  itinRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itinTime:   { color: '#38BDF8', fontSize: 14, fontWeight: '700' },
  itinName:   { color: '#fff',    fontSize: 15, fontWeight: '700', flex: 1 },
  itinPlace:  { color: '#D1D5DB', fontSize: 14, flex: 1 },
  itinEnroll: { fontSize: 14, fontWeight: '600' },

  attendeesBlock: { marginTop: 10, borderTopWidth: 1, borderColor: '#2A2A2D', paddingTop: 10, gap: 2 },
  attendeesLabel: { color: '#D1D5DB', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  attendeesEmpty: { color: '#D1D5DB', fontSize: 14, fontStyle: 'italic' },
  attendeeRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8, backgroundColor: '#2A2A2D', borderRadius: 8, paddingHorizontal: 10, marginBottom: 4 },
  attendeeName:   { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 },

  card:         { backgroundColor: '#0e0e0e', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a', borderLeftWidth: 3, borderLeftColor: '#f05b22', padding: 14, marginBottom: 10 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  expandedBlock:{ marginTop: 12, borderTopWidth: 1, borderColor: '#333', paddingTop: 12, gap: 8 },
  afoRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  afoLabel:     { color: '#D1D5DB', fontSize: 13 },
  afoValue:     { fontWeight: '700', fontSize: 14 },
  timeCol:  { alignItems: 'center', width: 44 },
  timeStart:{ color: '#f05b22', fontSize: 14, fontWeight: '800' },
  timeLine: { width: 1.5, height: 14, backgroundColor: '#3A3A3C', marginVertical: 4 },
  timeEnd:  { color: '#D1D5DB', fontSize: 12 },

  infoCol:     { flex: 1 },
  actName:     { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:     { color: '#D1D5DB', fontSize: 12 },

  enrollCol:   { alignItems: 'center', gap: 2 },
  enrollNum:   { fontSize: 18, fontWeight: '900' },
  enrollMax:   { color: '#D1D5DB', fontSize: 12 },
  enrollLabel: { color: '#D1D5DB', fontSize: 12 },

  soft:     { color: '#D1D5DB', fontSize: 14, textAlign: 'center', marginTop: 6 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#f05b22' },
  retryTxt: { color: '#f05b22', fontWeight: '600' },

  actionBtn: { flex: 1, backgroundColor: '#0e0e0e', borderRadius: 14, borderWidth: 1, paddingVertical: 18, alignItems: 'center', gap: 7 },
  actionTxt: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
