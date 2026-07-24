import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../infrastructure/api.config';
import { ModalOverlay } from './Shared/DashboardShared';
import { ChevronLeft, ChevronRight, CalendarCheck, IdCard } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CheckinCalendarDto {
  subscriptionId: number;
  userId: number;
  clientName: string | null;
  planName: string;
  /** SESIONES = plan ejecutivo/especial (rojo). FECHA = plan regular (naranja). */
  planKind: 'SESIONES' | 'FECHA';
  status: string;
  startDate: string;
  endDate: string;
  homeGymName: string | null;
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  checkedInDays: number[];
  todayDay: number | null;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmtDate = (iso: string): string => {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

// ─── Paleta por tipo de plan ──────────────────────────────────────────────────
// Rojo = plan ejecutivo/especial (por sesiones). Naranja = plan regular (por fecha).
const PALETTE = {
  SESIONES: {
    gradientFrom: '#4a0a0a',
    gradientTo:   '#8f1717',
    cellBg:       '#a51d1d',
    cellBorder:   '#c23a3a',
    checkedBg:    '#ff5252',
    checkedGlow:  'rgba(255, 82, 82, 0.55)',
    accent:       '#ff6b6b',
    badgeBg:      'rgba(255, 82, 82, 0.18)',
  },
  FECHA: {
    gradientFrom: '#4a1f04',
    gradientTo:   '#a34a0a',
    cellBg:       '#c2600f',
    cellBorder:   '#e08a3a',
    checkedBg:    '#ff9f43',
    checkedGlow:  'rgba(255, 159, 67, 0.55)',
    accent:       '#ffb066',
    badgeBg:      'rgba(255, 159, 67, 0.18)',
  },
} as const;

// ─── Card visual (reutilizable, independiente por registro) ─────────────────

const MembershipCard = ({ data, onPrevMonth, onNextMonth, canGoNext }: {
  data: CheckinCalendarDto;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoNext: boolean;
}) => {
  const palette = PALETTE[data.planKind];
  const checkedSet = new Set(data.checkedInDays);
  const dayCells = Array.from({ length: data.daysInMonth }, (_, i) => i + 1);

  return (
    <div
      style={{
        borderRadius: 20,
        padding: '1.5rem',
        background: `linear-gradient(155deg, ${palette.gradientFrom} 0%, ${palette.gradientTo} 100%)`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.35)`,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header: tipo de plan + N° de usuario */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IdCard size={22} color={palette.accent} />
          <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: palette.accent }}>
            {data.planKind === 'SESIONES' ? 'Plan Ejecutivo / Especial' : 'Plan Regular'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.62rem', opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>N° de Usuario</div>
          <div style={{
            marginTop: 3, padding: '0.25rem 0.7rem', borderRadius: 999,
            background: 'rgba(255,255,255,0.14)', fontWeight: 800, fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}>
            {data.userId}
          </div>
        </div>
      </div>

      {/* Datos del cliente */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1.2rem' }}>
        <Field label="Cliente" value={data.clientName ?? '—'} span2 />
        <Field label="Plan" value={data.planName} />
        <Field label="Sucursal" value={data.homeGymName ?? 'Global'} />
        <Field label="Inicio" value={fmtDate(data.startDate)} />
        <Field label="Vence" value={fmtDate(data.endDate)} />
      </div>

      {/* Navegador de mes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
        <button
          onClick={onPrevMonth}
          title="Mes anterior"
          style={{ width: 30, height: 30, borderRadius: 8, border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize' }}>
          {MONTH_NAMES[data.month - 1]} {data.year}
        </span>
        <button
          onClick={onNextMonth}
          disabled={!canGoNext}
          title="Mes siguiente"
          style={{
            width: 30, height: 30, borderRadius: 8, border: 0,
            cursor: canGoNext ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            opacity: canGoNext ? 1 : 0.35,
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Grilla de días — automática según el mes (28-31) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {dayCells.map(day => {
          const checked = checkedSet.has(day);
          const isToday = data.todayDay === day;
          return (
            <div
              key={day}
              title={checked ? `Check-in registrado el día ${day}` : `Día ${day}`}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                background: checked ? palette.checkedBg : palette.cellBg,
                border: `1.5px solid ${isToday ? '#fff' : palette.cellBorder}`,
                boxShadow: checked ? `0 0 10px ${palette.checkedGlow}` : 'none',
                color: checked ? '#1a0000' : 'rgba(255,255,255,0.85)',
                position: 'relative',
              }}
            >
              {checked ? <CalendarCheck size={13} strokeWidth={3} /> : String(day).padStart(2, '0')}
            </div>
          );
        })}
      </div>

      {/* Resumen de asistencia del mes */}
      <div style={{
        marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Asistencias del mes</span>
        <span style={{
          fontWeight: 800, fontSize: '0.85rem', padding: '0.2rem 0.6rem',
          borderRadius: 999, background: palette.badgeBg, color: palette.accent,
        }}>
          {data.checkedInDays.length} día{data.checkedInDays.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
};

const Field = ({ label, value, span2 = false }: { label: string; value: string; span2?: boolean }) => (
  <div style={{ gridColumn: span2 ? 'span 2' : undefined }}>
    <div style={{ fontSize: '0.6rem', opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{
      marginTop: 2, padding: '0.4rem 0.65rem', borderRadius: 8,
      background: 'rgba(255,255,255,0.10)', fontSize: '0.82rem', fontWeight: 600,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value}
    </div>
  </div>
);

// ─── Modal contenedor — independiente por cada registro de usuario ──────────

export const MembershipCardModal = ({ userId, onClose }: {
  userId: number;
  onClose: () => void;
}) => {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const isCurrentOrFutureMonth =
    cursor.year > now.getFullYear() ||
    (cursor.year === now.getFullYear() && cursor.month >= now.getMonth() + 1);

  const monthParam = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['membership-checkin-calendar', userId, monthParam],
    queryFn: async () => {
      const res = await apiClient.get<CheckinCalendarDto | null>(
        `/subscriptions/checkin-calendar/user/${userId}`,
        { params: { month: monthParam } },
      );
      return res.data;
    },
  });

  const goPrevMonth = () => {
    setCursor(c => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }));
  };
  const goNextMonth = () => {
    if (isCurrentOrFutureMonth) return;
    setCursor(c => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }));
  };

  return (
    <ModalOverlay onClose={onClose} maxWidth="26rem">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <IdCard size={19} /> Carnet de Membresía
      </h2>

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-gray-400 py-8 text-center">Cargando...</p>
      ) : isError ? (
        <p className="text-sm text-red-500 py-8 text-center">No se pudo cargar el carnet.</p>
      ) : !data ? (
        <div className="text-center py-10 text-slate-500 dark:text-gray-500">
          <IdCard size={36} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin membresía registrada</p>
          <p className="text-sm">Este cliente aún no tiene un plan inscrito.</p>
        </div>
      ) : (
        <MembershipCard
          data={data}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          canGoNext={!isCurrentOrFutureMonth}
        />
      )}

      <div className="flex justify-end mt-5">
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors cursor-pointer border-0"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </ModalOverlay>
  );
};
