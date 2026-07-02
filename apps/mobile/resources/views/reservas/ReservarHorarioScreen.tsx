import { useState, useMemo } from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Colors } from '../../../app/Providers/reservations/theme/colors';
import { useGymActivitiesQuery } from '../../../app/Providers/reservations/hooks/useGymActivitiesQuery';
import { reservationApi } from '../../../app/Providers/reservations/api/reservation.api';
import { CreateFreeReservationPayload } from '../../../app/Providers/reservations/api/reservation.types';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

type RootStackParamList = {
  ReservarHorario: { gymId: number; gymName: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'ReservarHorario'>;

const MIN_STEP    = 15;   // minute increment
const MAX_FREE_H  = 4;    // fallback max hours when activity has no duration limit
const DAY_NAMES   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MIN_OPTIONS = [0, 15, 30, 45];

const pad2 = (n: number) => String(n).padStart(2, '0');

const generateDays = () =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: format(d, 'yyyy-MM-dd'),
      label: format(d, 'dd/MM'),
      dayName: DAY_NAMES[d.getDay()],
    };
  });

// ── Time Spinner component ─────────────────────────────────────────────────────
const TimeSpinner = ({
  label, hour, minute, locked,
  onHourUp, onHourDown, onMinUp, onMinDown,
}: {
  label: string;
  hour: number;
  minute: number;
  locked?: boolean;
  onHourUp?: () => void;
  onHourDown?: () => void;
  onMinUp?: () => void;
  onMinDown?: () => void;
}) => (
  <View style={sp.col}>
    <Text style={sp.label}>{label}</Text>
    <View style={sp.row}>
      <View style={sp.unit}>
        <TouchableOpacity
          style={sp.arrow}
          onPress={onHourUp}
          disabled={locked}
          activeOpacity={locked ? 1 : 0.7}
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={22}
            color={locked ? Colors.border : Colors.secondary}
          />
        </TouchableOpacity>
        <View style={[sp.box, locked && sp.boxLocked]}>
          <Text style={[sp.val, locked && sp.valLocked]}>{pad2(hour)}</Text>
        </View>
        <TouchableOpacity
          style={sp.arrow}
          onPress={onHourDown}
          disabled={locked}
          activeOpacity={locked ? 1 : 0.7}
        >
          <MaterialCommunityIcons
            name="chevron-down"
            size={22}
            color={locked ? Colors.border : Colors.secondary}
          />
        </TouchableOpacity>
      </View>

      <Text style={sp.colon}>:</Text>

      <View style={sp.unit}>
        <TouchableOpacity
          style={sp.arrow}
          onPress={onMinUp}
          disabled={locked}
          activeOpacity={locked ? 1 : 0.7}
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={22}
            color={locked ? Colors.border : Colors.secondary}
          />
        </TouchableOpacity>
        <View style={[sp.box, locked && sp.boxLocked]}>
          <Text style={[sp.val, locked && sp.valLocked]}>{pad2(minute)}</Text>
        </View>
        <TouchableOpacity
          style={sp.arrow}
          onPress={onMinDown}
          disabled={locked}
          activeOpacity={locked ? 1 : 0.7}
        >
          <MaterialCommunityIcons
            name="chevron-down"
            size={22}
            color={locked ? Colors.border : Colors.secondary}
          />
        </TouchableOpacity>
      </View>
    </View>
    {locked && (
      <Text style={sp.autoTxt}>
        <MaterialCommunityIcons name="lock-outline" size={10} color={Colors.textSoft} /> automático
      </Text>
    )}
  </View>
);

// ── Screen ────────────────────────────────────────────────────────────────────
export const ReservarHorarioScreen = ({ route, navigation }: Props) => {
  const { gymId, gymName } = route.params;
  const days = useMemo(generateDays, []);

  const [selectedDate,       setSelectedDate]       = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [startH,             setStartH]             = useState(8);
  const [startM,             setStartM]             = useState(0);

  const { data: activities = [], isLoading } = useGymActivitiesQuery(gymId);

  // Activity selected by user
  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId) ?? null,
    [activities, selectedActivityId],
  );

  const maxDurationMin = selectedActivity?.defaultDurationMin ?? 0;
  const hasLimit       = maxDurationMin > 0;

  // Compute end time: locked to start + maxDurationMin (or +4h fallback)
  const { endH, endM } = useMemo(() => {
    const limit = hasLimit ? maxDurationMin : MAX_FREE_H * 60;
    const total = Math.min(startH * 60 + startM + limit, 23 * 60 + 45);
    return { endH: Math.floor(total / 60), endM: total % 60 };
  }, [startH, startM, hasLimit, maxDurationMin]);

  // Spinner controls
  const bumpH = (dir: 1 | -1) => setStartH((h) => (h + dir + 24) % 24);
  const bumpM = (dir: 1 | -1) => {
    setStartM((m) => {
      const idx  = MIN_OPTIONS.indexOf(m);
      const next = (idx + dir + MIN_OPTIONS.length) % MIN_OPTIONS.length;
      return MIN_OPTIONS[next];
    });
  };

  const startTime = `${pad2(startH)}:${pad2(startM)}`;
  const endTime   = `${pad2(endH)}:${pad2(endM)}`;

  const showTimePicker = selectedActivity?.isFreeAccess === true;
  const canConfirm     = !!selectedDate && showTimePicker;

  const mutation = useMutation({
    mutationFn: (payload: CreateFreeReservationPayload) =>
      reservationApi.createFreeReservation(payload),
    onSuccess: () => {
      Alert.alert('¡Reserva confirmada!', 'Tu reserva fue creada con éxito.', [
        {
          text: 'Ver mis reservas',
          onPress: () => (navigation as any).getParent()?.navigate('Mis Reservas'),
        },
      ]);
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      const msg = error?.response?.data?.message;
      if (status === 409) {
        Alert.alert(
          'Reserva duplicada',
          typeof msg === 'string' && msg.trim()
            ? msg
            : 'Ya tienes una reserva activa para este horario.',
        );
      } else {
        Alert.alert(
          'Error al reservar',
          typeof msg === 'string' && msg.trim()
            ? msg
            : 'No se pudo completar la reserva. Verifica tu conexión e inténtalo de nuevo.',
        );
      }
    },
  });

  const handleConfirm = () => {
    if (!canConfirm || !selectedActivity) return;
    mutation.mutate({
      gymId,
      activityId: selectedActivity.id,
      reservationDate: selectedDate!,
      startTime,
      endTime,
    });
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.gymName}>{gymName}</Text>

        {/* ── 1. Día ── */}
        <Text style={s.sectionLabel}>Selecciona un día</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.carousel}>
          {days.map((d) => {
            const active = selectedDate === d.value;
            return (
              <TouchableOpacity
                key={d.value}
                style={[s.dayChip, active && s.dayChipActive]}
                onPress={() => setSelectedDate(active ? null : d.value)}
                activeOpacity={0.8}
              >
                <Text style={[s.dayName, active && s.dayTextActive]}>{d.dayName}</Text>
                <Text style={[s.dayDate, active && s.dayTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── 2. Actividad ── */}
        <Text style={s.sectionLabel}>Selecciona una actividad</Text>
        {isLoading ? (
          <DumbbellSpinner color={Colors.secondary} style={{ marginVertical: 16 }} />
        ) : activities.length === 0 ? (
          <Text style={s.empty}>No hay actividades disponibles.</Text>
        ) : (
          activities.map((a) => {
            const active = selectedActivityId === a.id;
            const isFree = a.isFreeAccess === true;
            return (
              <TouchableOpacity
                key={a.id}
                style={[s.actCard, active && s.actCardActive]}
                onPress={() => {
                  setSelectedActivityId(active ? null : a.id);
                  // Reset start time on activity change
                  setStartH(8);
                  setStartM(0);
                }}
                activeOpacity={0.8}
              >
                <View style={s.actRow}>
                  <View style={s.actInfo}>
                    <View style={s.actNameRow}>
                      <Text style={[s.actName, active && s.actNameActive]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <View style={[s.typeBadge, isFree ? s.typeBadgeFree : s.typeBadgeSched]}>
                        <MaterialCommunityIcons
                          name={isFree ? 'run' : 'calendar-clock'}
                          size={10}
                          color={isFree ? Colors.primary : Colors.secondary}
                        />
                        <Text style={[s.typeBadgeTxt, isFree ? s.typeTxtFree : s.typeTxtSched]}>
                          {isFree ? 'Libre' : 'Horarios'}
                        </Text>
                      </View>
                    </View>
                    {!!a.description && (
                      <Text style={s.actDesc} numberOfLines={2}>{a.description}</Text>
                    )}
                    {!isFree && active && (
                      <Text style={s.schedNote}>
                        Este servicio tiene horarios fijos con instructor.
                      </Text>
                    )}
                  </View>
                  <View style={[s.durationBadge, active && s.durationBadgeActive]}>
                    <Text style={[s.durationTxt, active && s.durationTxtActive]}>
                      {a.defaultDurationMin ? `${a.defaultDurationMin} min` : '? min'}
                    </Text>
                  </View>
                </View>
                {active && isFree && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={Colors.secondary}
                    style={s.checkIcon}
                  />
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* ── 3. Horario (solo acceso libre) ── */}
        {showTimePicker && (
          <>
            <View style={s.timeHeader}>
              <Text style={s.sectionLabel}>
                <Text style={s.stepNum}>3 · </Text>Selecciona el horario
              </Text>
              {hasLimit && (
                <View style={s.limitPill}>
                  <MaterialCommunityIcons name="timer-outline" size={12} color={Colors.primary} />
                  <Text style={s.limitTxt}>Máx. {maxDurationMin} min</Text>
                </View>
              )}
            </View>

            <View style={s.pickerCard}>
              <TimeSpinner
                label="INICIO"
                hour={startH}
                minute={startM}
                onHourUp={() => bumpH(1)}
                onHourDown={() => bumpH(-1)}
                onMinUp={() => bumpM(1)}
                onMinDown={() => bumpM(-1)}
              />
              <View style={s.pickerDivider} />
              <TimeSpinner
                label="FIN"
                hour={endH}
                minute={endM}
                locked
              />
            </View>

            {hasLimit && (
              <View style={s.limitNote}>
                <MaterialCommunityIcons name="information-outline" size={13} color={Colors.textSoft} />
                <Text style={s.limitNoteTxt}>
                  El horario de fin se calcula automáticamente según la duración máxima de este servicio ({maxDurationMin} min).
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={s.bottomBar}>
        {canConfirm && selectedActivity && (
          <View style={s.summaryRow}>
            <Text style={s.summaryName} numberOfLines={1}>{selectedActivity.name}</Text>
            <Text style={s.summaryTime}>
              {selectedDate} · {startTime} – {endTime}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.confirmBtn, (!canConfirm || mutation.isPending) && s.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm || mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending ? (
            <DumbbellSpinner color="#fff" />
          ) : (
            <Text style={s.confirmTxt}>Confirmar Reserva</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Spinner styles ─────────────────────────────────────────────────────────────
const sp = StyleSheet.create({
  col:       { alignItems: 'center', flex: 1 },
  label:     { fontSize: 11, fontWeight: '800', color: Colors.textSoft, letterSpacing: 1, marginBottom: 10 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unit:      { alignItems: 'center', gap: 6 },
  arrow:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  box: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
  },
  boxLocked: { borderColor: Colors.border, backgroundColor: '#111' },
  val:       { fontSize: 28, fontWeight: '800', color: Colors.secondary, fontVariant: ['tabular-nums'] },
  valLocked: { color: Colors.textSoft },
  colon:     { fontSize: 28, fontWeight: '800', color: Colors.textSoft, marginTop: -8 },
  autoTxt:   { fontSize: 10, color: Colors.textSoft, marginTop: 4 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },

  gymName:      { fontSize: 13, color: Colors.textSoft, marginBottom: 20 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 12, marginTop: 8 },
  stepNum:      { color: Colors.secondary },
  empty:        { color: Colors.textSoft, fontSize: 14, marginBottom: 16 },

  carousel:      { flexGrow: 0, marginBottom: 24 },
  dayChip: {
    width: 62, marginRight: 10, paddingVertical: 12,
    borderRadius: 12, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  dayChipActive: { borderColor: Colors.secondary, backgroundColor: '#1C1C1E' },
  dayName:       { fontSize: 11, fontWeight: '700', color: Colors.textSoft },
  dayDate:       { fontSize: 13, fontWeight: '600', color: Colors.textSoft, marginTop: 4 },
  dayTextActive: { color: Colors.secondary },

  actCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  actCardActive: { borderColor: Colors.secondary, backgroundColor: '#1C1C1E' },
  actRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  actInfo:       { flex: 1, marginRight: 10 },
  actNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' },
  actName:       { fontSize: 15, fontWeight: '700', color: Colors.text },
  actNameActive: { color: Colors.secondary },
  actDesc:       { fontSize: 12, color: Colors.textSoft, lineHeight: 17 },
  schedNote:     { fontSize: 11, color: Colors.textSoft, marginTop: 6, fontStyle: 'italic' },
  checkIcon:     { marginTop: 8, alignSelf: 'flex-end' },

  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
  },
  typeBadgeFree:  { backgroundColor: 'rgba(255,94,0,0.08)', borderColor: 'rgba(255,94,0,0.25)' },
  typeBadgeSched: { backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.25)' },
  typeBadgeTxt:   { fontSize: 10, fontWeight: '700' },
  typeTxtFree:    { color: Colors.primary },
  typeTxtSched:   { color: Colors.secondary },

  durationBadge:       { backgroundColor: Colors.border, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  durationBadgeActive: { backgroundColor: '#1C1C1E' },
  durationTxt:         { fontSize: 11, fontWeight: '600', color: Colors.textSoft },
  durationTxtActive:   { color: Colors.secondary },

  timeHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 8, marginBottom: 12,
  },
  limitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,94,0,0.1)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,94,0,0.25)',
  },
  limitTxt: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  pickerCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 20, paddingHorizontal: 10,
    marginBottom: 12,
  },
  pickerDivider: {
    width: 1, height: 80, backgroundColor: Colors.border, marginHorizontal: 4,
  },

  limitNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  limitNoteTxt: { flex: 1, fontSize: 12, color: Colors.textSoft, lineHeight: 18 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 101,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  summaryRow:  { marginBottom: 10 },
  summaryName: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  summaryTime: { fontSize: 12, color: Colors.textSoft },

  confirmBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmTxt: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});
