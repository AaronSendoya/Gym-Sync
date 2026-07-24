import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CheckinCalendarDto } from '../../app/Providers/reservations/api/reservation.types';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmtDate = (iso: string): string => {
  const d = String(iso).split('T')[0];
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

// Misma paleta que el carnet web (MembershipCardModal.tsx): rojo = plan
// ejecutivo/especial (por sesiones), naranja = plan regular (por fecha).
// Sin gradiente (evita sumar expo-linear-gradient como dependencia nueva) —
// fondo sólido con el tono más profundo de cada paleta.
const PALETTE = {
  SESIONES: {
    cardBg:      '#5a0f0f',
    cellBg:      '#7a1616',
    cellBorder:  '#a53232',
    checkedBg:   '#ff5252',
    accent:      '#ff6b6b',
    badgeBg:     'rgba(255, 82, 82, 0.18)',
  },
  FECHA: {
    cardBg:      '#5a2905',
    cellBg:      '#7a3a08',
    cellBorder:  '#c2792f',
    checkedBg:   '#ff9f43',
    accent:      '#ffb066',
    badgeBg:     'rgba(255, 159, 67, 0.18)',
  },
} as const;

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ACTIVA:    { bg: 'rgba(34, 197, 94, 0.18)',  fg: '#4ade80' },
  ACTIVO:    { bg: 'rgba(34, 197, 94, 0.18)',  fg: '#4ade80' },
  CONGELADA: { bg: 'rgba(56, 189, 248, 0.18)', fg: '#38bdf8' },
  VENCIDA:   { bg: 'rgba(142, 142, 147, 0.2)', fg: '#8E8E93' },
  CANCELADA: { bg: 'rgba(239, 68, 68, 0.18)',  fg: '#f87171' },
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <View style={f.field}>
    <Text style={f.fieldLabel}>{label}</Text>
    <View style={f.fieldValueWrap}>
      <Text style={f.fieldValue} numberOfLines={1}>{value}</Text>
    </View>
  </View>
);

/**
 * Carnet visual de membresía — versión app móvil del carnet web
 * (MembershipCardModal.tsx), para el cliente ver su PROPIA membresía. A
 * diferencia de la versión web (que usa el staff para ver el carnet de
 * OTROS clientes), esta NUNCA muestra el número de usuario — decisión
 * explícita: el cliente no necesita ver su propio ID interno.
 */
export const MembershipCarnet = ({ data, onPrevMonth, onNextMonth, canGoNext }: {
  data: CheckinCalendarDto;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoNext: boolean;
}) => {
  const palette = PALETTE[data.planKind];
  const statusStyle = STATUS_STYLE[data.status] ?? STATUS_STYLE.VENCIDA;
  const checkedSet = new Set(data.checkedInDays);
  const dayCells = Array.from({ length: data.daysInMonth }, (_, i) => i + 1);

  return (
    <View style={[c.card, { backgroundColor: palette.cardBg }]}>
      {/* Header: tipo de plan + estado (nunca el N° de usuario) */}
      <View style={c.header}>
        <View style={c.headerLeft}>
          <MaterialCommunityIcons
            name={data.planKind === 'SESIONES' ? 'dumbbell' : 'card-account-details'}
            size={20}
            color={palette.accent}
          />
          <Text style={[c.headerLabel, { color: palette.accent }]}>
            {data.planKind === 'SESIONES' ? 'PLAN EJECUTIVO / ESPECIAL' : 'PLAN REGULAR'}
          </Text>
        </View>
        <View style={[c.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[c.statusTxt, { color: statusStyle.fg }]}>{data.status}</Text>
        </View>
      </View>

      {/* Datos del carnet */}
      <View style={f.grid}>
        <Field label="Cliente" value={data.clientName ?? '—'} />
        <View style={f.row2}>
          <Field label="Plan" value={data.planName} />
          <Field label="Sucursal" value={data.homeGymName ?? 'Global'} />
        </View>
        <View style={f.row2}>
          <Field label="Inicio" value={fmtDate(data.startDate)} />
          <Field label="Vence" value={fmtDate(data.endDate)} />
        </View>
      </View>

      {/* Navegador de mes */}
      <View style={c.monthNav}>
        <TouchableOpacity style={c.navBtn} onPress={onPrevMonth}>
          <MaterialCommunityIcons name="chevron-left" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={c.monthLabel}>{MONTH_NAMES[data.month - 1]} {data.year}</Text>
        <TouchableOpacity
          style={[c.navBtn, !canGoNext && c.navBtnDisabled]}
          onPress={onNextMonth}
          disabled={!canGoNext}
        >
          <MaterialCommunityIcons name="chevron-right" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Grilla de días — automática según el mes (28-31) */}
      <View style={c.grid}>
        {dayCells.map(day => {
          const checked = checkedSet.has(day);
          const isToday = data.todayDay === day;
          return (
            <View
              key={day}
              style={[
                c.dayCell,
                {
                  backgroundColor: checked ? palette.checkedBg : palette.cellBg,
                  borderColor: isToday ? '#fff' : palette.cellBorder,
                },
              ]}
            >
              {checked ? (
                <MaterialCommunityIcons name="calendar-check" size={12} color="#1a0000" />
              ) : (
                <Text style={c.dayTxt}>{String(day).padStart(2, '0')}</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Resumen de asistencia del mes */}
      <View style={c.footer}>
        <Text style={c.footerLabel}>Asistencias del mes</Text>
        <View style={[c.footerBadge, { backgroundColor: palette.badgeBg }]}>
          <Text style={[c.footerValue, { color: palette.accent }]}>
            {data.checkedInDays.length} día{data.checkedInDays.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const CELL_GAP = 6;

const c = StyleSheet.create({
  card: { borderRadius: 20, padding: 18 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  navBtnDisabled: { opacity: 0.35 },
  monthLabel: { color: '#fff', fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP },
  dayCell: {
    width: `${100 / 7 - 1.5}%`,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },

  footer: {
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  footerBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  footerValue: { fontSize: 12, fontWeight: '800' },
});

const f = StyleSheet.create({
  grid: { gap: 10, marginBottom: 16 },
  row2: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)', fontSize: 9.5, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
  },
  fieldValueWrap: {
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  fieldValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
