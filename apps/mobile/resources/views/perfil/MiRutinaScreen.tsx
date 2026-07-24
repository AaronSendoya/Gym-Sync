import React, { useState, useMemo } from 'react';
import {View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Image} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { staffApi, ClientRoutine, ClientRoutineExercise } from '../../../app/Providers/staff/api/staff.api';
import { cachedFetch } from '../../../app/Providers/offline/QueryCache';
import { ParameterChip } from '../../components/ParameterChip';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO'] as const;
type DayKey = typeof DAYS[number];

const DAY_LABEL: Record<DayKey, { short: string; full: string }> = {
  LUNES:     { short: 'LUN', full: 'Lunes' },
  MARTES:    { short: 'MAR', full: 'Martes' },
  MIERCOLES: { short: 'MIÉ', full: 'Miércoles' },
  JUEVES:    { short: 'JUE', full: 'Jueves' },
  VIERNES:   { short: 'VIE', full: 'Viernes' },
  SABADO:    { short: 'SÁB', full: 'Sábado' },
  DOMINGO:   { short: 'DOM', full: 'Domingo' },
};

const getTodayKey = (): DayKey => {
  const idx = new Date().getDay();
  return DAYS[idx === 0 ? 6 : idx - 1];
};

const formatCell = (ex: ClientRoutineExercise): string => {
  const p = ex.params as any;
  if (p) {
    if (p.durationMin != null) return `${p.durationMin} min`;
    if (p.rounds != null) return `${p.rounds} rondas`;
    if (p.durationSeconds != null) return `${p.durationSeconds}s`;
  }
  const sets = ex.setsRecommended ?? '—';
  const reps = ex.repsRecommended ?? '—';
  return `${sets}×${reps}`;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
type ByDay = Record<DayKey, ClientRoutineExercise[]>;

const buildByDay = (routines: ClientRoutine[]): ByDay => {
  const result = Object.fromEntries(
    DAYS.map(d => [d, [] as ClientRoutineExercise[]]),
  ) as ByDay;
  for (const r of routines) {
    for (const ex of r.exercises) {
      const day = ex.dayOfWeek as DayKey;
      if (day && result[day]) result[day].push(ex);
    }
  }
  return result;
};

// ─── Day Strip ────────────────────────────────────────────────────────────────
const DayStrip = ({ selected, onSelect, byDay }: {
  selected: DayKey;
  onSelect: (d: DayKey) => void;
  byDay: ByDay;
}) => (
  <View style={s.stripContainer}>
    {DAYS.map(d => {
      const isActive = d === selected;
      const count = byDay[d].length;
      return (
        <TouchableOpacity
          key={d}
          style={[s.stripPill, isActive && s.stripPillActive]}
          onPress={() => onSelect(d)}
          activeOpacity={0.8}
        >
          <Text style={[s.stripDay, isActive && s.stripDayActive]}>{DAY_LABEL[d].short}</Text>
          {count > 0 && (
            <View style={[s.stripDot, isActive && s.stripDotActive]}>
              <Text style={[s.stripDotTxt, isActive && s.stripDotTxtActive]}>{count}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── Exercise Card ────────────────────────────────────────────────────────────
const ExerciseCard = ({ ex, idx, onEjecutar }: {
  ex: ClientRoutineExercise;
  idx: number;
  onEjecutar: () => void;
}) => {
  const imgUrl = ex.exercise?.imageUrl;
  const sets = ex.setsRecommended;
  const reps = ex.repsRecommended;
  const weight = ex.weightRecommendedKg;
  const rest = ex.restSecondsBetweenSets;
  const p = ex.params as any;
  const hasDuration = p?.durationMin != null || p?.durationSeconds != null;

  return (
    <TouchableOpacity style={s.exCard} onPress={onEjecutar} activeOpacity={0.9}>
      {/* Row: image + info + play */}
      <View style={s.exRow}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={s.exImg} />
        ) : (
          <View style={[s.exImg, s.exImgFallback]}>
            <MaterialCommunityIcons name="dumbbell" size={22} color="#333" />
          </View>
        )}

        <View style={s.exInfo}>
          <Text style={s.exName} numberOfLines={2}>{ex.exercise?.name ?? '—'}</Text>
          {ex.exercise?.muscleGroup ? (
            <Text style={s.exMuscle}>{ex.exercise.muscleGroup}</Text>
          ) : null}
        </View>

        <View style={s.playBtn}>
          <MaterialCommunityIcons name="play" size={18} color="#fff" />
        </View>
      </View>

      {/* Chips */}
      <View style={s.chipRow}>
        {sets != null && (
          <ParameterChip icon="repeat" value={`${sets} Series`} />
        )}
        {reps != null && !hasDuration && (
          <ParameterChip icon="target" value={`${reps} Reps`} />
        )}
        {hasDuration && (
          <ParameterChip icon="clock-outline" value={formatCell(ex)} accent="#38BDF8" />
        )}
        {weight != null && weight > 0 && (
          <ParameterChip icon="weight-kilogram" value={`${weight} kg`} accent="#38BDF8" />
        )}
        {rest != null && rest > 0 && (
          <ParameterChip icon="timer-sand" value={`${rest}s desc.`} accent="#00E5A3" />
        )}
      </View>

      {ex.notes ? <Text style={s.exNotes}>{ex.notes}</Text> : null}
    </TouchableOpacity>
  );
};

// ─── Legacy Card ──────────────────────────────────────────────────────────────
const LegacyRoutineCard = ({ routine, onEjecutar }: {
  routine: ClientRoutine;
  onEjecutar: (ex: ClientRoutineExercise) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={s.legacyCard}>
      <TouchableOpacity style={s.legacyHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
          <MaterialCommunityIcons name="dumbbell" size={18} color="#FF5E00" />
          <View style={{ flex: 1 }}>
            <Text style={s.legacyName} numberOfLines={1}>{routine.name}</Text>
            <Text style={s.legacyMeta}>{routine.exercises?.length ?? 0} ejercicios</Text>
          </View>
        </View>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#555" />
      </TouchableOpacity>
      {expanded && routine.exercises?.map((ex, idx) => (
        <ExerciseCard key={ex.id} ex={ex} idx={idx} onEjecutar={() => onEjecutar(ex)} />
      ))}
    </View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export const MiRutinaScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = (user as any)?.userId ?? (user as any)?.id;

  const [selectedDay, setSelectedDay] = useState<DayKey>(getTodayKey);

  const { data: routines = [], isLoading, isError, refetch } = useQuery<ClientRoutine[]>({
    queryKey: ['my-routines', userId],
    // Read-through cache SQLite: online refresca el caché; offline sirve el
    // último payload guardado — la rutina es legible y ejecutable sin red.
    queryFn: () =>
      cachedFetch<ClientRoutine[]>(`my-routines:${userId}`, async () => {
        const res = await staffApi.getMyRoutines(userId);
        return Array.isArray(res) ? res : (res?.data ?? []);
      }),
    enabled: !!userId,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const hasDayData = routines.some(r => r.exercises.some(e => e.dayOfWeek));
  const byDay = useMemo(() => hasDayData ? buildByDay(routines) : null, [routines, hasDayData]);

  const todayExercises = byDay ? byDay[selectedDay] : [];
  const totalWeekExercises = byDay ? DAYS.reduce((sum, d) => sum + byDay[d].length, 0) : 0;

  const handleEjecutar = (ex: ClientRoutineExercise) => {
    const routine = routines.find(r => r.exercises.some(e => e.id === ex.id));
    if (routine) navigation.navigate('EjecutarRutina', { routine, exercise: ex });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Mi Rutina</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <DumbbellSpinner size="large" color="#FF5E00" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="wifi-off" size={40} color="#444" />
          <Text style={s.errTxt}>No se pudo cargar tu rutina.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : routines.length === 0 ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="dumbbell" size={52} color="#222" />
          <Text style={s.emptyTitle}>Sin rutina asignada</Text>
          <Text style={s.emptySubTxt}>Tu entrenador aún no te ha asignado una rutina de entrenamiento.</Text>
        </View>
      ) : hasDayData && byDay ? (
        <View style={{ flex: 1 }}>
          {/* Day Strip */}
          <DayStrip selected={selectedDay} onSelect={setSelectedDay} byDay={byDay} />

          {/* Motivational header */}
          <View style={s.dayHeader}>
            <Text style={s.dayHeaderTitle}>{DAY_LABEL[selectedDay].full}</Text>
            <Text style={s.dayHeaderSub}>
              {todayExercises.length > 0
                ? `${todayExercises.length} ejercicio${todayExercises.length > 1 ? 's' : ''} asignado${todayExercises.length > 1 ? 's' : ''}`
                : 'Día de descanso'}
              {totalWeekExercises > 0 ? `  ·  ${totalWeekExercises} en la semana` : ''}
            </Text>
          </View>

          {/* Exercise list */}
          {todayExercises.length === 0 ? (
            <View style={s.restDay}>
              <MaterialCommunityIcons name="sleep" size={40} color="#222" />
              <Text style={s.restDayTitle}>Día de descanso</Text>
              <Text style={s.restDaySub}>No tienes ejercicios programados para hoy. Aprovecha para recuperarte.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
              {todayExercises.map((ex, idx) => (
                <ExerciseCard key={ex.id} ex={ex} idx={idx} onEjecutar={() => handleEjecutar(ex)} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <FlatList
          data={routines}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <LegacyRoutineCard routine={item} onEjecutar={handleEjecutar} />
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

  topBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  backBtn:  { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  // Day Strip
  stripContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  stripPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#151515',
    gap: 4,
  },
  stripPillActive: {
    backgroundColor: '#FF5E00',
  },
  stripDay: { color: '#666', fontSize: 11, fontWeight: '800' },
  stripDayActive: { color: '#fff' },
  stripDot: {
    backgroundColor: '#2a2a2a',
    borderRadius: 7,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stripDotActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  stripDotTxt: { color: '#555', fontSize: 10, fontWeight: '800' },
  stripDotTxtActive: { color: '#fff' },

  // Day header
  dayHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  dayHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  dayHeaderSub: { color: '#555', fontSize: 13, marginTop: 4 },

  // Rest day
  restDay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 40 },
  restDayTitle: { color: '#444', fontSize: 16, fontWeight: '700' },
  restDaySub: { color: '#333', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Exercise card
  exCard: {
    backgroundColor: '#242424',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exImg: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  exImgFallback: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exInfo: { flex: 1 },
  exName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  exMuscle: { color: '#666', fontSize: 12, marginTop: 3 },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FF5E00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exNotes: { color: '#555', fontSize: 12, fontStyle: 'italic' },

  // Legacy
  legacyCard: { backgroundColor: '#0e0e0e', borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  legacyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  legacyName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  legacyMeta: { color: '#555', fontSize: 11, marginTop: 3 },

  // Empty states
  emptyTitle: { color: '#555', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySubTxt: { color: '#333', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  errTxt: { color: '#555', fontSize: 14 },
  retryBtn: { backgroundColor: '#1C1C1E', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  retryTxt: { color: '#FF5E00', fontWeight: '700' },
});
