import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions, Modal, TextInput} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LineChart, PieChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { trainingApi, WorkoutSession } from '../../../app/Providers/training/api/training.api';
import authAxios from '../../../app/Providers/auth/authAxios';
import { cachedFetch } from '../../../app/Providers/offline/QueryCache';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

//Paleta 
const C = {
  bg:       '#0A0A0A',
  surface:  '#1C1C1E',
  surface2: '#2C2C2E',
  border:   '#3A3A3C',
  primary:  '#FF5E00',
  celeste:  '#38BDF8',
  green:    '#00E5A3',
  text:     '#FFFFFF',
  soft:     '#B0B0B0',
  muted:    '#555',
} as const;

const CHART_W = Dimensions.get('window').width - 32;

//Tipos
type MetricEntry = {
  id: string;
  recordedAt: string;
  weightKg: number | null;
  muscleMassKg: number | null;
  bodyFatPercentage: number | null;
};

//Utilidades
function dateToDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseDMY(s: string): Date | null {
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy || yyyy < 2000 || yyyy > 2100) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

function sportLabel(s: string | null): string {
  if (!s) return 'Entrenamiento libre';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

// Evitar crash del LineChart cuando todos los valores son iguales o array vacío
function safeDataset(values: number[]): number[] {
  if (values.length === 0) return [0, 0];
  if (values.length === 1) return [values[0], values[0]];
  return values;
}

function safeLabels(labels: string[], values: number[]): string[] {
  if (values.length <= 1) return ['', ''];
  return labels;
}

//Configuración base de gráficos
const baseChartConfig = {
  backgroundColor:                   C.bg,
  backgroundGradientFrom:            C.bg,
  backgroundGradientTo:              C.bg,
  backgroundGradientFromOpacity:     0,
  backgroundGradientToOpacity:       0,
  decimalPlaces:                     1,
  labelColor: (opacity = 1) =>       `rgba(176, 176, 176, ${opacity})`,
  propsForBackgroundLines: {
    stroke:          C.border,
    strokeDasharray: '4',
    strokeWidth:     1,
  },
};

//Gráfico 1: Peso Corporal (naranja)
function PesoChart({ metrics }: { metrics: MetricEntry[] }) {
  const points = metrics
    .filter(m => m.weightKg != null && Number(m.weightKg) > 0 && !isNaN(Number(m.weightKg)))
    .slice(-12)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  if (points.length < 2) {
    return (
      <View style={ch.empty}>
        <Feather name="trending-up" size={28} color={C.border} />
        <Text style={ch.emptyTxt}>
          {points.length === 0
            ? 'Sin registros de peso aún.'
            : 'Se necesitan al menos 2 registros para mostrar la gráfica.'}
        </Text>
      </View>
    );
  }

  const values = safeDataset(points.map(p => Number(p.weightKg)));
  const labels = safeLabels(points.map(p => fmtShortDate(p.recordedAt)), values);

  return (
    <LineChart
      data={{ labels, datasets: [{ data: values }] }}
      width={CHART_W}
      height={190}
      yAxisSuffix=" kg"
      fromZero={false}
      withInnerLines
      withOuterLines={false}
      bezier
      chartConfig={{
        ...baseChartConfig,
        color: (opacity = 1) => `rgba(255, 94, 0, ${opacity})`,
        propsForDots: { r: '4', strokeWidth: '2', stroke: C.primary },
      }}
      style={ch.chart}
    />
  );
}

function FuerzaChart({ sessions }: { sessions: WorkoutSession[] }) {
  // Peso máximo por sesión — soporta dos estructuras de API:
  //   • session.exercises[].sets[].weight_used_kg  (estructura real del backend)
  //   • session.sets[].weightUsedKg                (estructura tipada legacy)
  const points = sessions
    .map(s => {
      let max = 0;
      // Estructura principal: exercises > sets
      (s as any).exercises?.forEach((ex: any) => {
        ex.sets?.forEach((set: any) => {
          const kg = Number(set.weight_used_kg ?? set.weightUsedKg ?? 0);
          if (kg > max) max = kg;
        });
      });
      // Fallback: sets directo en la sesión
      if (max === 0) {
        (s.sets ?? []).forEach(set => {
          const kg = Number(set.weightUsedKg ?? 0);
          if (kg > max) max = kg;
        });
      }
      return { date: s.startedAt, maxKg: max };
    })
    .filter(p => p.maxKg > 0)
    .slice(-12)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (points.length < 2) {
    return (
      <View style={ch.empty}>
        <Feather name="bar-chart-2" size={28} color={C.border} />
        <Text style={ch.emptyTxt}>
          {points.length === 0
            ? 'Sin datos de series registrados aún.'
            : 'Se necesitan al menos 2 sesiones con series para graficar.'}
        </Text>
      </View>
    );
  }

  const values = safeDataset(points.map(p => p.maxKg));
  const labels = safeLabels(points.map(p => fmtShortDate(p.date)), values);

  return (
    <LineChart
      data={{ labels, datasets: [{ data: values }] }}
      width={CHART_W}
      height={190}
      yAxisSuffix=" kg"
      fromZero={false}
      withInnerLines
      withOuterLines={false}
      bezier
      chartConfig={{
        ...baseChartConfig,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(0, 229, 163, ${opacity})`,
        propsForDots: { r: '4', strokeWidth: '2', stroke: C.green },
      }}
      style={ch.chart}
    />
  );
}

const ch = StyleSheet.create({
  chart:    { borderRadius: 12, marginLeft: -8 },
  empty: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface2,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyTxt: { color: C.soft, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});

//Paleta rotativa para el PieChart
const PIE_COLORS = [
  '#38BDF8', // celeste
  '#FF5E00', // naranja
  '#00E5A3', // verde
  '#9B5DE5', // violeta
  '#F15BB5', // rosa
  '#FEE440', // amarillo
  '#00BBF9', // azul claro
  '#7B8794', // gris
];

//Gráfico 3: Distribución de Actividades (PieChart) 
function ActividadesChart({ sessions }: { sessions: WorkoutSession[] }) {
  // Agrupar por nombre de rutina o sportType
  const grouped = sessions.reduce<Record<string, number>>((acc, s) => {
    const key = s.routine?.name ?? sportLabel(s.sportType ?? null);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Ordenar desc, tomar top 6, agrupar el resto como "Otros"
  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const top    = sorted.slice(0, 6);
  const rest   = sorted.slice(6).reduce((sum, [, n]) => sum + n, 0);
  if (rest > 0) top.push(['Otros', rest]);

  if (top.length === 0) {
    return (
      <View style={ch.empty}>
        <Feather name="pie-chart" size={28} color={C.border} />
        <Text style={ch.emptyTxt}>Sin sesiones para analizar aún.</Text>
      </View>
    );
  }

  const pieData = top.map(([name, count], i) => ({
    name,
    population: count,
    color:           PIE_COLORS[i % PIE_COLORS.length],
    legendFontColor: C.soft,
    legendFontSize:  11,
  }));

  return (
    <>
      <PieChart
        data={pieData}
        width={CHART_W}
        height={170}
        chartConfig={{
          color: (opacity = 1) => `rgba(255,255,255,${opacity})`,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="12"
        absolute
        style={{ borderRadius: 12, marginLeft: -8 }}
      />
      {/* Leyenda manual para mayor legibilidad en fondo oscuro */}
      <View style={pie.legend}>
        {pieData.map((item, idx) => (
          <View key={`${item.name}-${idx}`} style={pie.legendRow}>
            <View style={[pie.dot, { backgroundColor: item.color }]} />
            <Text style={pie.legendLabel} numberOfLines={1}>{item.name}</Text>
            <Text style={pie.legendCount}>{item.population} ses.</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const pie = StyleSheet.create({
  legend:      { marginTop: 12, gap: 6 },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:         { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendLabel: { color: C.soft, fontSize: 12, flex: 1 },
  legendCount: { color: C.text, fontSize: 12, fontWeight: '700', minWidth: 48, textAlign: 'right' },
});

//Tarjeta de sesión (timeline) 
function SessionCard({ session }: { session: WorkoutSession }) {
  const isCompleted = session.status === 'COMPLETED' || session.status === 'COMPLETADA';

  return (
    <View style={card.container}>
      <View style={card.line} />
      <View style={card.dot} />
      <View style={card.body}>
        {/* Cabecera: [calendario] Fecha — Hora */}
        <View style={card.headerRow}>
          <Feather name="calendar" size={13} color={C.soft} />
          <Text style={card.dateText}>{fmtDate(session.startedAt)}</Text>
          <Text style={card.sep}>—</Text>
          <Text style={card.timeText}>{fmtTime(session.startedAt)}</Text>
          {isCompleted && (
            <View style={card.badge}>
              <Text style={card.badgeTxt}>Completada</Text>
            </View>
          )}
        </View>

        {/* Fila 1: [map-pin] sede + marca */}
        <View style={card.infoRow}>
          <Feather name="map-pin" size={13} color={C.celeste} />
          {(() => {
            const s = session as any;
            const gymName = session.gym?.name ?? s.gymName ?? null;
            const brandName = session.gym?.brand?.name ?? s.brandName ?? null;
            if (!gymName) {
              return <Text style={card.gymName}>Fuera de sucursal</Text>;
            }
            return brandName ? (
              <View>
                <Text style={card.brandName} numberOfLines={1}>{brandName}</Text>
                <Text style={card.gymName} numberOfLines={1}>{gymName}</Text>
              </View>
            ) : (
              <Text style={card.gymName} numberOfLines={1}>{gymName}</Text>
            );
          })()}
        </View>

        {/* Fila 2: [activity] rutina o tipo */}
        <View style={card.infoRow}>
          <Feather name="activity" size={13} color={C.primary} />
          <Text style={card.sportText}>
            {session.routine?.name ?? (session as any).routineName ?? sportLabel(session.sportType)}
          </Text>
        </View>

        {/* Footer: duración + calorías */}
        {(session.durationSeconds || session.caloriesBurned) ? (
          <View style={card.footerRow}>
            {!!session.durationSeconds && (
              <View style={card.footerChip}>
                <Feather name="clock" size={11} color={C.soft} />
                <Text style={card.footerTxt}>{fmtDuration(session.durationSeconds)}</Text>
              </View>
            )}
            {!!session.caloriesBurned && (
              <View style={card.footerChip}>
                <Feather name="zap" size={11} color={C.green} />
                <Text style={card.footerTxt}>{session.caloriesBurned} kcal</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const card = StyleSheet.create({
  container: { flexDirection: 'row', paddingLeft: 16, marginBottom: 4, position: 'relative' },
  line:      { position: 'absolute', left: 23, top: 28, bottom: -4, width: 2, backgroundColor: C.border },
  dot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, borderWidth: 2, borderColor: C.bg, marginTop: 18, marginRight: 14, zIndex: 1, flexShrink: 0 },
  body:      { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  dateText:  { fontSize: 12, color: C.soft, fontWeight: '600' },
  sep:       { fontSize: 12, color: C.muted },
  timeText:  { fontSize: 12, color: C.soft },
  badge:     { marginLeft: 'auto', backgroundColor: '#00E5A322', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#00E5A355' },
  badgeTxt:  { fontSize: 9, color: C.green, fontWeight: '700' },
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandName: { fontSize: 10, color: C.soft,   fontWeight: '600', flex: 1 },
  gymName:   { fontSize: 14, color: C.celeste, fontWeight: '700', flex: 1 },
  sportText: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  footerChip:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerTxt: { fontSize: 11, color: C.soft },
});

//Pantalla principal 
export const CuadroDeMandoClienteScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const cacheUserId = (user as any)?.userId ?? (user as any)?.id ?? 'anon';
  const [sessions,          setSessions]          = useState<WorkoutSession[]>([]);
  const [metrics,           setMetrics]           = useState<MetricEntry[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [exporting,         setExporting]         = useState(false);
  const [isExportModalVisible, setExportModalVisible] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<{title: string, value: string, description: string} | null>(null);
  const [exportRange,   setExportRange]   = useState<'HOY' | '7_DIAS' | '30_DIAS' | '1_AÑO' | 'CUSTOM'>('30_DIAS');
  const [customStart,    setCustomStart]    = useState<Date>(new Date(Date.now() - 30 * 86400_000));
  const [customEnd,      setCustomEnd]      = useState<Date>(new Date());
  const [customStartStr, setCustomStartStr] = useState(() => dateToDMY(new Date(Date.now() - 30 * 86400_000)));
  const [customEndStr,   setCustomEndStr]   = useState(() => dateToDMY(new Date()));

  //Fetch paralelo 
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Read-through cache SQLite POR USUARIO: offline sirve los datos de la
      // última conexión sin exponer los de otro usuario del mismo dispositivo
      const [sessionsRes, metricsRes] = await Promise.allSettled([
        cachedFetch(`client-dash:sessions:${cacheUserId}`, () =>
          trainingApi.getHistory({ limit: 100, offset: 0 }),
        ),
        cachedFetch(`client-dash:metrics:${cacheUserId}`, async () => {
          const r = await authAxios.get('/api/users/me/metrics');
          return r.data; // solo el body: serializable para el caché
        }),
      ]);

      if (sessionsRes.status === 'fulfilled') {
        const raw = sessionsRes.value;
        const arr: WorkoutSession[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setSessions(
          [...arr].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
        );
      }
      if (metricsRes.status === 'fulfilled') {
        const body: any = metricsRes.value;
        const raw: MetricEntry[] = body?.data ?? (Array.isArray(body) ? body : []);
        setMetrics(
          [...raw].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()),
        );
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar el cuadro de mando.');
    } finally {
      setLoading(false);
    }
  }, [cacheUserId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  //Estadísticas de resumen
  const { totalSesiones, totalMinutos, totalKcal, volumenTotal, lastWeight } = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      const w = metrics && metrics.length > 0 
        ? [...metrics].reverse().find(m => m.weightKg != null)?.weightKg 
        : undefined;
      return { totalSesiones: 0, totalMinutos: 0, totalKcal: 0, volumenTotal: 0, lastWeight: w };
    }

    const completed = sessions; // Arreglo global con todas las rutinas (libres y asignadas)
    const tSecs = completed.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
    const tKcal = completed.reduce((acc, s) => acc + (s.caloriesBurned ?? 0), 0);
    
    // Volumen Total: Suma de (peso * reps)
    let vol = 0;
    completed.forEach(s => {
      // Estructura 1
      (s as any).exercises?.forEach((ex: any) => {
        ex.sets?.forEach((set: any) => {
          const kg = Number(set.weight_used_kg ?? set.weightUsedKg ?? 0);
          const reps = Number(set.reps_completed ?? set.repsCompleted ?? 0);
          if (!isNaN(kg) && !isNaN(reps)) {
            vol += kg * reps;
          }
        });
      });
      // Estructura 2 (fallback)
      (s.sets ?? []).forEach((set: any) => {
        const kg = Number(set.weightUsedKg ?? 0);
        const reps = Number(set.repsCompleted ?? 0);
        if (!isNaN(kg) && !isNaN(reps)) {
          vol += kg * reps;
        }
      });
    });

    const w = [...metrics].reverse().find(m => m.weightKg != null)?.weightKg;

    return {
      totalSesiones: completed.length,
      totalMinutos: Math.round(tSecs / 60),
      totalKcal: tKcal,
      volumenTotal: vol,
      lastWeight: w,
    };
  }, [sessions, metrics]);

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  const generatePDF = useCallback(async () => {
    try {
      setExporting(true);

      // ── Calcular ventana de fechas con objetos Date reales ─────────────────
      const limitDate = new Date();
      const endDate   = new Date();
      endDate.setHours(23, 59, 59, 999);

      switch (exportRange) {
        case 'HOY':
          limitDate.setHours(0, 0, 0, 0);
          break;
        case '7_DIAS':
          limitDate.setDate(limitDate.getDate() - 7);
          break;
        case '30_DIAS':
          limitDate.setDate(limitDate.getDate() - 30);
          break;
        case '1_AÑO':
          limitDate.setFullYear(limitDate.getFullYear() - 1);
          break;
        case 'CUSTOM': {
          const s = new Date(customStart); s.setHours(0, 0, 0, 0);
          const e = new Date(customEnd);   e.setHours(23, 59, 59, 999);
          limitDate.setTime(s.getTime());
          endDate.setTime(e.getTime());
          break;
        }
      }

      // ── Filtrar arrays — soporta startedAt y started_at ───────────────────
      const filteredSessions = sessions.filter(s => {
        const raw = s.startedAt || (s as any).started_at;
        const d   = new Date(raw);
        return !isNaN(d.getTime()) && d >= limitDate && d <= endDate;
      });
      const filteredMetrics = metrics.filter(m => {
        const d = new Date(m.recordedAt);
        return !isNaN(d.getTime()) && d >= limitDate && d <= endDate;
      });

      if (filteredSessions.length === 0 && filteredMetrics.length === 0) {
        Alert.alert('Sin datos', 'No hay registros en el rango seleccionado.');
        return;
      }

      // ── Estadísticas del rango filtrado ───────────────────────────────────
      const fCompleted = filteredSessions.filter(
        s => s.status === 'COMPLETED' || s.status === 'COMPLETADA',
      );
      const fMins   = Math.round(fCompleted.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60);
      const fCal    = fCompleted.reduce((a, s) => a + (s.caloriesBurned ?? 0), 0);
      const fLastKg = [...filteredMetrics].reverse().find(m => m.weightKg != null)?.weightKg;

      const rangeLabel =
        exportRange === 'HOY'     ? 'Hoy'             :
        exportRange === '7_DIAS'  ? 'Últimos 7 días'  :
        exportRange === '30_DIAS' ? 'Últimos 30 días' :
        exportRange === '1_AÑO'   ? 'Último año'      :
        `${fmtDate(customStart.toISOString())} – ${fmtDate(customEnd.toISOString())}`;

      // ── Construir HTML ────────────────────────────────────────────────────
      const sessionRows = filteredSessions.slice(0, 100).map(s => {
        const dateRaw = s.startedAt || (s as any).started_at || '';
        const sAny    = s as any;
        const gymName = s.gym?.name || sAny.gym_name  || sAny.gymName  || 'Sucursal Independiente';
        const brandObj = (s.gym as any)?.parent || (s.gym as any)?.brand;
        const brand   = brandObj?.name || sAny.brand_name || sAny.brandName || null;
        return `<tr>
          <td>${fmtDate(dateRaw)} ${fmtTime(dateRaw)}</td>
          <td>${brand ? `${gymName} — ${brand}` : gymName}</td>
          <td>${s.routine?.name ?? sportLabel(s.sportType)}</td>
          <td>${fmtDuration(s.durationSeconds)}</td>
          <td>${s.caloriesBurned ? s.caloriesBurned + ' kcal' : '—'}</td>
        </tr>`;
      }).join('');

      const metricRows = filteredMetrics.map(m => `<tr>
          <td>${fmtDate(m.recordedAt)}</td>
          <td>${m.weightKg         != null ? m.weightKg         + ' kg' : '—'}</td>
          <td>${m.muscleMassKg     != null ? m.muscleMassKg     + ' kg' : '—'}</td>
          <td>${m.bodyFatPercentage != null ? m.bodyFatPercentage + '%'  : '—'}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <style>
    body  { font-family: Arial, sans-serif; color: #111; margin: 32px; }
    h1    { color: #FF5E00; font-size: 22px; margin-bottom: 4px; }
    h2    { color: #333; font-size: 16px; margin: 20px 0 8px; }
    p     { color: #666; font-size: 12px; margin-bottom: 20px; }
    .stats{ display: flex; gap: 24px; margin-bottom: 24px; }
    .stat { background: #f5f5f5; border-radius: 8px; padding: 12px 20px; text-align: center; }
    .stat .val { font-size: 20px; font-weight: 700; color: #FF5E00; }
    .stat .lbl { font-size: 11px; color: #888; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 32px; }
    th    { background: #FF5E00; color: #fff; padding: 8px 10px; text-align: left; }
    td    { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>Mi historial físico — GymSync</h1>
  <p>Rango: ${rangeLabel} &nbsp;·&nbsp; Generado el ${new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  <div class="stats">
    <div class="stat"><div class="val">${fCompleted.length}</div><div class="lbl">Sesiones</div></div>
    <div class="stat"><div class="val">${fMins} min</div><div class="lbl">Tiempo total</div></div>
    <div class="stat"><div class="val">${fCal} kcal</div><div class="lbl">Calorías</div></div>
    ${fLastKg ? `<div class="stat"><div class="val">${fLastKg} kg</div><div class="lbl">Peso actual</div></div>` : ''}
  </div>
  <h2>Historial de Entrenamientos</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Sucursal</th><th>Rutina</th><th>Duración</th><th>Calorías</th></tr></thead>
    <tbody>${sessionRows || '<tr><td colspan="5">Sin sesiones en este período</td></tr>'}</tbody>
  </table>
  <h2>Historial de Métricas Físicas</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Peso</th><th>Masa Muscular</th><th>Grasa Corporal</th></tr></thead>
    <tbody>${metricRows || '<tr><td colspan="4">Sin métricas en este período</td></tr>'}</tbody>
  </table>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar historial físico',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF guardado', uri);
      }
    } catch (e: any) {
      console.warn('[generatePDF]', e?.message);
      Alert.alert('Error', 'Fallo al generar el reporte. Intenta de nuevo.');
    } finally {
      // SIEMPRE liberar los estados de carga, pase lo que pase
      setExporting(false);
      setExportModalVisible(false);
    }
  }, [exportRange, customStart, customEnd, sessions, metrics]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()}>
          <Feather name="chevron-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Mi historial físico</Text>
          <Text style={s.headerSub}>Evolución y Récords</Text>
        </View>
        <TouchableOpacity
          style={[s.exportBtn, exporting && s.iconBtnDisabled]}
          onPress={() => setExportModalVisible(true)}
          disabled={exporting || loading}
        >
          {exporting ? (
            <DumbbellSpinner size="small" color={C.celeste} />
          ) : (
            <>
              <Feather name="download" size={16} color={C.primary} />
              <Text style={s.exportBtnTxt}>Exportar Reporte</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
      >

        {/* ── Stats resumen ────────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <TouchableOpacity 
            style={s.statCard}
            onPress={() => setSelectedMetric({ title: 'Sesiones', value: totalSesiones.toString(), description: 'Total de rutinas completadas, incluyendo entrenamientos libres y asignados.' })}
          >
            <Feather name="check-circle" size={16} color={C.primary} />
            <Text style={s.statVal}>{totalSesiones}</Text>
            <Text style={s.statLbl}>Sesiones</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={s.statCard}
            onPress={() => setSelectedMetric({ title: 'Minutos', value: totalMinutos.toString(), description: 'Tiempo total activo de entrenamiento.' })}
          >
            <Feather name="clock" size={16} color={C.primary} />
            <Text style={s.statVal}>{totalMinutos}</Text>
            <Text style={s.statLbl}>Minutos</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={s.statCard}
            onPress={() => setSelectedMetric({ title: 'Calorías', value: totalKcal.toFixed(0), description: 'Calorías estimadas quemadas durante tus sesiones.' })}
          >
            <Feather name="zap" size={16} color={C.primary} />
            <Text style={s.statVal}>{totalKcal.toFixed(0)}</Text>
            <Text style={s.statLbl}>kcal</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={s.statCard}
            onPress={() => setSelectedMetric({ title: 'Vol. Total', value: volumenTotal.toFixed(0), description: 'Suma de todos los kilogramos levantados (peso × repeticiones) en tu historial. Ideal para medir tu carga de trabajo.' })}
          >
            <Feather name="layers" size={16} color={C.primary} />
            <Text style={s.statVal}>{volumenTotal.toFixed(0)}</Text>
            <Text style={s.statLbl}>Vol. Total</Text>
          </TouchableOpacity>
          {lastWeight != null && (
            <TouchableOpacity 
              style={s.statCard}
              onPress={() => setSelectedMetric({ title: 'Peso', value: lastWeight.toString(), description: 'Tu peso corporal actual registrado.' })}
            >
              <Feather name="user" size={16} color={C.primary} />
              <Text style={s.statVal}>{lastWeight}</Text>
              <Text style={s.statLbl}>kg</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── GRÁFICO 1: Peso Corporal ─────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Feather name="trending-up" size={15} color={C.primary} />
            <Text style={s.sectionTitle}>Peso Corporal</Text>
            <Text style={s.sectionHint}>Naranja · kg</Text>
          </View>
          {loading
            ? <DumbbellSpinner color={C.primary} style={{ marginVertical: 30 }} />
            : <PesoChart metrics={metrics} />
          }
        </View>

        {/* ── GRÁFICO 2: Récord de Fuerza ──────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Feather name="bar-chart-2" size={15} color={C.green} />
            <Text style={s.sectionTitle}>Récord de Hipertrofia</Text>
            <Text style={s.sectionHint}>Verde · kg máx</Text>
          </View>
          {loading
            ? <DumbbellSpinner color={C.green} style={{ marginVertical: 30 }} />
            : <FuerzaChart sessions={sessions} />
          }
        </View>

        {/* ── GRÁFICO 3: Distribución de Actividades ───────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Feather name="pie-chart" size={15} color={C.celeste} />
            <Text style={s.sectionTitle}>Distribución de Actividades</Text>
            <Text style={s.sectionHint}>por tipo de rutina</Text>
          </View>
          {loading
            ? <DumbbellSpinner color={C.celeste} style={{ marginVertical: 30 }} />
            : <ActividadesChart sessions={sessions} />
          }
        </View>

        {/* ── Línea de tiempo de sesiones ──────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Feather name="list" size={15} color={C.primary} />
            <Text style={s.sectionTitle}>Línea de tiempo</Text>
            {!loading && (
              <Text style={s.sectionCount}>
                {sessions.length} sesión{sessions.length !== 1 ? 'es' : ''}
              </Text>
            )}
          </View>

          {loading ? (
            <View style={s.loadingBox}>
              <DumbbellSpinner size="large" color={C.primary} />
              <Text style={s.loadingTxt}>Cargando historial...</Text>
            </View>
          ) : sessions.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="activity" size={44} color={C.border} />
              <Text style={s.emptyTitle}>Aún no hay sesiones</Text>
              <Text style={s.emptyBody}>
                Completa tu primer entrenamiento para ver tu evolución aquí.
              </Text>
            </View>
          ) : (
            <View style={s.timeline}>
              {sessions.map(session => (
                <SessionCard key={session.id} session={session} />
              ))}
              <View style={s.timelineEnd}>
                <View style={s.timelineEndDot} />
                <Text style={s.timelineEndTxt}>Inicio de tu historial</Text>
              </View>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── Modal: selección de rango para exportar ─────────────────────────── */}
      <Modal
        visible={isExportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={m.backdrop}>
          <View style={m.sheet}>
            <Text style={m.title}>Seleccionar rango</Text>
            <Text style={m.sub}>El PDF incluirá solo los datos del período elegido.</Text>

            {/* ── Opciones de rango ─────────────────────────────────────────── */}
            {([
              { key: 'HOY',     label: 'Hoy',             icon: 'sun'      },
              { key: '7_DIAS',  label: 'Últimos 7 días',  icon: 'calendar' },
              { key: '30_DIAS', label: 'Últimos 30 días', icon: 'calendar' },
              { key: '1_AÑO',   label: 'Último año',      icon: 'clock'    },
              { key: 'CUSTOM',  label: 'Personalizado',   icon: 'sliders'  },
            ] as const).map(opt => {
              const active = exportRange === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[m.rangeBtn, active && m.rangeBtnActive]}
                  onPress={() => setExportRange(opt.key)}
                  activeOpacity={0.7}
                >
                  <Feather name={opt.icon} size={18} color={active ? C.primary : C.soft} />
                  <Text style={[m.rangeBtnLabel, active && m.rangeBtnLabelActive]}>
                    {opt.label}
                  </Text>
                  {active && (
                    <Feather name="check-circle" size={16} color={C.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* ── Inputs de fecha (solo cuando CUSTOM está activo) ──────────── */}
            {exportRange === 'CUSTOM' && (
              <View style={m.customRow}>
                {/* Fecha inicio */}
                <View style={m.dateField}>
                  <Text style={m.dateBtnLabel}>Inicio (DD/MM/AAAA)</Text>
                  <View style={m.dateInputRow}>
                    <Feather name="calendar" size={13} color={C.primary} />
                    <TextInput
                      style={m.dateInput}
                      value={customStartStr}
                      onChangeText={raw => {
                        setCustomStartStr(raw);
                        const d = parseDMY(raw);
                        if (d) setCustomStart(d);
                      }}
                      placeholder="01/01/2026"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      maxLength={10}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <Feather name="arrow-right" size={16} color={C.muted} style={{ marginTop: 20 }} />

                {/* Fecha fin */}
                <View style={m.dateField}>
                  <Text style={m.dateBtnLabel}>Fin (DD/MM/AAAA)</Text>
                  <View style={m.dateInputRow}>
                    <Feather name="calendar" size={13} color={C.primary} />
                    <TextInput
                      style={m.dateInput}
                      value={customEndStr}
                      onChangeText={raw => {
                        setCustomEndStr(raw);
                        const d = parseDMY(raw);
                        if (d) setCustomEnd(d);
                      }}
                      placeholder="31/12/2026"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      maxLength={10}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[m.generateBtn, exporting && { opacity: 0.6 }]}
              onPress={generatePDF}
              disabled={exporting}
              activeOpacity={0.8}
            >
              {exporting
                ? <DumbbellSpinner color="#fff" />
                : <Text style={m.generateBtnTxt}>Generar PDF</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={m.cancelBtn}
              onPress={() => setExportModalVisible(false)}
            >
              <Text style={m.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal: explicación de métrica ──────────────────────────────────────── */}
      <Modal animationType="fade" transparent visible={!!selectedMetric} onRequestClose={() => setSelectedMetric(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          {selectedMetric && (
            <View style={{ backgroundColor: '#1E1E1E', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>{selectedMetric.title}</Text>
              <Text style={{ color: '#FF5E00', fontSize: 32, fontWeight: '900', marginBottom: 16 }}>{selectedMetric.value}</Text>
              <Text style={{ color: '#CCCCCC', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>{selectedMetric.description}</Text>
              <TouchableOpacity onPress={() => setSelectedMetric(null)} style={{ backgroundColor: '#333333', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
};

// ─── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
    gap: 12,
  },
  iconBtn:         { width: 40, height: 40, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  exportBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.primary + '55', paddingHorizontal: 12, paddingVertical: 9 },
  exportBtnTxt:    { color: C.primary, fontSize: 12, fontWeight: '700' },
  iconBtnDisabled: { opacity: 0.5 },
  headerCenter:    { flex: 1 },
  headerTitle:     { color: C.text, fontSize: 18, fontWeight: '800' },
  headerSub:       { color: C.soft, fontSize: 11, fontWeight: '600', marginTop: 1 },

  scroll: { paddingBottom: 120, paddingTop: 8 },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 16,
    gap: 8, flexWrap: 'wrap',
  },
  statCard: {
    flex: 1, minWidth: 70,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.primary + '55',
    padding: 12, alignItems: 'center', gap: 4,
  },
  statVal: { color: C.text, fontSize: 18, fontWeight: '900' },
  statLbl: { color: C.soft, fontSize: 10, fontWeight: '600' },

  section:       { marginHorizontal: 16, marginTop: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  sectionTitle:  { color: C.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sectionHint:   { color: C.soft, fontSize: 10 },
  sectionCount:  { color: C.soft, fontSize: 11 },

  timeline: { paddingTop: 4 },
  timelineEnd: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingLeft: 19, paddingBottom: 8,
  },
  timelineEndDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.border, borderWidth: 2, borderColor: C.bg },
  timelineEndTxt: { color: C.muted, fontSize: 11 },

  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingTxt: { color: C.soft, fontSize: 13 },

  emptyBox: {
    alignItems: 'center', paddingVertical: 44,
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    gap: 10, marginTop: 4,
  },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  emptyBody:  { color: C.soft, fontSize: 13, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
});

// ─── Estilos del modal ────────────────────────────────────────────────────────
const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
  },
  title:              { color: C.text, fontSize: 18, fontWeight: '800' },
  sub:                { color: C.soft, fontSize: 12, marginBottom: 4 },
  rangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2,
  },
  rangeBtnActive:      { borderColor: C.primary, backgroundColor: C.primary + '18' },
  rangeBtnLabel:       { color: C.soft, fontSize: 14, fontWeight: '600', flex: 1 },
  rangeBtnLabelActive: { color: C.primary },
  generateBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  generateBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn:      { alignItems: 'center', paddingVertical: 14 },
  cancelTxt:      { color: C.soft, fontSize: 13 },

  // Rango personalizado
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.primary + '55',
    padding: 12,
  },
  dateBtnLabel: { color: C.soft,   fontSize: 10, fontWeight: '600' },
  dateBtnValue: { color: C.celeste, fontSize: 13, fontWeight: '700', marginTop: 2 },

  // Inputs de fecha personalizada
  dateField:    { flex: 1, gap: 4 },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.primary + '55',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateInput:    { flex: 1, color: C.primary, fontSize: 13, fontWeight: '700', padding: 0 },

  // Botón confirmar fecha en iOS (spinner inline) — ya no se usa, se mantiene por si acaso
  pickerOkBtn: {
    backgroundColor: C.celeste + '22',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.primary + '55',
  },
  pickerOkTxt: { color: C.celeste, fontSize: 13, fontWeight: '700' },
});
