/**
 * MapaView.tsx — Vista de Mapa de Red de Sucursales.
 * Accesible para SUPER_ADMIN (red completa) y GERENTE (solo su marca).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { SucursalMapaDTO } from '@gymsync/core';
import { Edit, Calendar, Search, ChevronDown } from 'lucide-react';
import { useMapaSucursales } from '../../hooks/useMapaSucursales';

// ── Fix íconos Leaflet en Vite ────────────────────────────────────────────────
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as typeof L.Icon.Default.prototype & { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// ── Tipos de filtro estado ────────────────────────────────────────────────────
type EstadoFiltro = 'abierta' | 'cerrada' | 'inactiva';

const ESTADO_CONFIG: Record<EstadoFiltro, { label: string; color: string }> = {
  abierta:  { label: 'Abierta',  color: '#2ecc71' },
  cerrada:  { label: 'Cerrada',  color: '#e74c3c' },
  inactiva: { label: 'Inactiva', color: '#FF5E00' },
};


// Normaliza tanto abreviados (LUN, MAR…) como completos (LUNES, MARTES…) → forma completa.
// El backend guarda los días como abreviados en gym_schedules.day_of_week.
const DAY_ABBR_TO_FULL: Record<string, string> = {
  LUN: 'LUNES',   LUNES:   'LUNES',
  MAR: 'MARTES',  MARTES:  'MARTES',
  MIE: 'MIERCOLES', MIERCOLES: 'MIERCOLES',
  JUE: 'JUEVES',  JUEVES:  'JUEVES',
  VIE: 'VIERNES', VIERNES: 'VIERNES',
  SAB: 'SABADO',  SABADO:  'SABADO',
  DOM: 'DOMINGO', DOMINGO: 'DOMINGO',
};

const stripAccents = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const normDayKey = (day: string): string => {
  const clean = stripAccents(day);
  return DAY_ABBR_TO_FULL[clean] ?? clean;
};

const getNowLaPaz = (): { dayKey: string; minutesNow: number } => {
  const tz  = 'America/La_Paz';
  const now = new Date();

  const weekdayRaw = new Intl.DateTimeFormat('es-BO', { timeZone: tz, weekday: 'long' })
    .format(now);
  // Normaliza a forma completa sin tilde: LUNES, MARTES, MIERCOLES…
  const dayKey = normDayKey(weekdayRaw);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = parseInt(timeParts.find(p => p.type === 'hour')?.value   ?? '0') % 24;
  const m = parseInt(timeParts.find(p => p.type === 'minute')?.value ?? '0');

  return { dayKey, minutesNow: h * 60 + m };
};

const calculateGymStatus = (s: SucursalMapaDTO): EstadoFiltro => {
  if (!s.isActive) return 'inactiva';

  // Sin horarios registrados → usar el flag calculado por el backend
  if (!s.schedules || s.schedules.length === 0) {
    return s.isOpen ? 'abierta' : 'cerrada';
  }

  const { dayKey, minutesNow } = getNowLaPaz();

  // Normaliza el dayOfWeek del backend (puede ser LUN o LUNES) antes de comparar
  const horarioHoy = s.schedules.find(
    sch => normDayKey(sch.dayOfWeek) === dayKey && !sch.isHoliday
  );

  if (!horarioHoy) return 'cerrada';

  const [hO, mO] = (horarioHoy.opensAt  ?? '00:00').slice(0, 5).split(':').map(Number);
  const [hC, mC] = (horarioHoy.closesAt ?? '00:00').slice(0, 5).split(':').map(Number);

  const minOpen  = hO * 60 + mO;
  let   minClose = hC * 60 + mC;
  if (minClose < minOpen) minClose += 24 * 60;

  return minutesNow >= minOpen && minutesNow <= minClose ? 'abierta' : 'cerrada';
};

// ── Íconos por estado ─────────────────────────────────────────────────────────
const createCustomIcon = (color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 4px 14px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -32],
  });

const iconActiva   = createCustomIcon('#2ecc71');
const iconCerrada  = createCustomIcon('#e74c3c');
const iconInactiva = createCustomIcon('#FF5E00');

// ── Paleta por Sede Principal ─────────────────────────────────────────────────
const SEDE_PALETTE = [
  '#38BDF8','#FF5E00','#00E5A3','#38BDF8','#FF5E00',
  '#00E5A3','#38BDF8','#FF5E00','#00E5A3','#38BDF8',
];
const getSedeColor = (id: number | null): string =>
  id === null ? '#8E8E93' : SEDE_PALETTE[id % SEDE_PALETTE.length];

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
const AutoFitBounds = ({ sucursales }: { sucursales: SucursalMapaDTO[] }) => {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || sucursales.length === 0) return;
    const bounds = L.latLngBounds(sucursales.map(s => [s.latitude, s.longitude]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
    fitted.current = true;
  }, [sucursales, map]);
  return null;
};

// ── Popup JSX ─────────────────────────────────────────────────────────────────
const PopupCard = ({ s, computedStatus, level }: { s: SucursalMapaDTO; computedStatus: EstadoFiltro; level: number }) => {
  const navigate   = useNavigate();
  const sedeColor  = getSedeColor(s.sedePrincipalId);
  const cfg        = ESTADO_CONFIG[computedStatus];
  const currentOccupancy = s.currentOccupancy ?? s.aforoActual ?? 0;
  const pct              = s.maxCapacity > 0 ? Math.round((currentOccupancy / s.maxCapacity) * 100) : 0;
  const barColor   = pct >= 80 ? '#FF5E00' : pct >= 50 ? '#38BDF8' : '#00E5A3';

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#0A0A0A',
      border: '1px solid #1C1C1E',
      borderRadius: '12px',
      padding: '14px 16px',
      minWidth: '220px',
      maxWidth: '270px',
      color: '#FFF',
      boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
    }}>
      {/* Nombre + estado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.nombre}
          </div>
          <span style={{
            display: 'inline-block', marginTop: '4px',
            background: '#0A0A0A',
            border: `1px solid ${sedeColor}`,
            color: sedeColor,
            fontSize: '0.68rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: '12px',
            letterSpacing: '0.04em',
          }}>
            {s.sedePrincipalNombre}
          </span>
        </div>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700,
          color: cfg.color,
          background: '#1C1C1E',
          padding: '3px 7px', borderRadius: '8px',
          border: `1px solid ${cfg.color}`,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: cfg.color, marginRight: '4px', flexShrink: 0 }} />
          {cfg.label.toUpperCase()}
        </span>
      </div>

      {/* Dirección */}
      <div style={{ fontSize: '0.75rem', color: '#8E8E93', marginBottom: '10px', lineHeight: 1.4 }}>
        {s.address}
      </div>

      {/* Aforo personas */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
          <span style={{ color: '#8E8E93' }}>Aforo hoy</span>
          <span style={{ color: '#E5E5EA', fontWeight: 600 }}>{currentOccupancy} / {s.maxCapacity} ({pct}%)</span>
        </div>
        <div style={{ height: '5px', background: '#3A3A3C', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Aforo máquinas */}
      {s.machineStats && s.machineStats.total > 0 ? (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '5px' }}>
            <span style={{ color: '#8E8E93' }}>Máquinas</span>
            <span style={{ color: '#E5E5EA', fontWeight: 600 }}>{s.machineStats.available}/{s.machineStats.total} libres</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <div style={{ flex: 1, background: '#00E5A315', borderRadius: '6px', padding: '4px 0', textAlign: 'center' }}>
              <div style={{ color: '#00E5A3', fontSize: '0.78rem', fontWeight: 700 }}>{s.machineStats.available}</div>
              <div style={{ color: '#555', fontSize: '0.62rem', marginTop: '1px' }}>Libre</div>
            </div>
            <div style={{ flex: 1, background: '#FF5E0015', borderRadius: '6px', padding: '4px 0', textAlign: 'center' }}>
              <div style={{ color: '#FF5E00', fontSize: '0.78rem', fontWeight: 700 }}>{s.machineStats.inUse}</div>
              <div style={{ color: '#555', fontSize: '0.62rem', marginTop: '1px' }}>En uso</div>
            </div>
            <div style={{ flex: 1, background: '#e74c3c15', borderRadius: '6px', padding: '4px 0', textAlign: 'center' }}>
              <div style={{ color: '#e74c3c', fontSize: '0.78rem', fontWeight: 700 }}>{s.machineStats.maintenance}</div>
              <div style={{ color: '#555', fontSize: '0.62rem', marginTop: '1px' }}>Mant.</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '10px' }}>
          <span style={{ color: '#8E8E93' }}>Máquinas</span>
          <span style={{ color: '#555', fontWeight: 600 }}>Sin registro</span>
        </div>
      )}

      {/* Coords + botón */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '0.68rem', color: '#555', fontFamily: 'monospace' }}>
          {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
        </span>
        {(level >= 4 && level < 10) ? (
          <button
            onClick={e => { e.stopPropagation(); navigate('/dashboard/reservas'); }}
            style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: '#00E5A3',
              background: '#1C1C1E',
              border: '1px solid #00E5A3',
              borderRadius: '6px',
              padding: '3px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Calendar size={11} />
            Ver Reservas
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); navigate('/dashboard/sucursales'); }}
            style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: '#38BDF8',
              background: '#1C1C1E',
              border: '1px solid #38BDF8',
              borderRadius: '6px',
              padding: '3px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Edit size={11} />
            Ver Sucursales
          </button>
        )}
      </div>
    </div>
  );
};

// ── Estilos Dinámicos ──────────────────────────────────────────────────────────
const getStyles = (isDark: boolean) => ({
  page: {
    padding: '1.25rem',
    color: isDark ? '#FFFFFF' : '#0F172A',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minHeight: 0,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '1rem',
  } as React.CSSProperties,

  title: {
    margin: 0,
    fontSize: 'clamp(1.2rem, 3vw, 1.75rem)',
    fontWeight: 700,
    lineHeight: 1.2,
    color: isDark ? '#FFFFFF' : '#0F172A',
  } as React.CSSProperties,

  subtitle: {
    margin: '0.25rem 0 0',
    color: isDark ? '#94a3b8' : '#475569',
    fontSize: 'clamp(0.75rem, 1.5vw, 0.9rem)',
  } as React.CSSProperties,

  statsRow: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  } as React.CSSProperties,

  statCard: {
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    border: isDark ? '1px solid #1C1C1E' : '1px solid #E5E7EB',
    borderRadius: '10px',
    padding: '0.55rem 0.9rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: '90px',
  } as React.CSSProperties,

  statLabel: {
    fontSize: 'clamp(0.6rem, 1vw, 0.7rem)',
    color: isDark ? '#94a3b8' : '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  } as React.CSSProperties,

  statValue: {
    fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
    fontWeight: 700,
  } as React.CSSProperties,

  toolbar: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    alignItems: 'center',
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    border: isDark ? '1px solid #1C1C1E' : '1px solid #E5E7EB',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
  } as React.CSSProperties,

  searchInput: {
    flex: '1 1 160px',
    minWidth: '140px',
    maxWidth: '240px',
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    border: isDark ? '1px solid #3A3A3C' : '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '0.45rem 0.75rem 0.45rem 2rem',
    color: isDark ? '#FFFFFF' : '#0F172A',
    fontSize: '0.85rem',
    outline: 'none',
  } as React.CSSProperties,

  pillActive: (color: string): React.CSSProperties => ({
    padding: '0.3rem 0.75rem',
    borderRadius: '20px',
    border: `1px solid ${color}`,
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    color,
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s',
  }),

  pillInactive: {
    padding: '0.3rem 0.75rem',
    borderRadius: '20px',
    border: isDark ? '1px solid #3A3A3C' : '1px solid #E5E7EB',
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    color: isDark ? '#8E8E93' : '#64748b',
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.2s',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '0.75rem',
    color: isDark ? '#94a3b8' : '#475569',
    fontWeight: 600,
    flexShrink: 0,
    alignSelf: 'center',
  } as React.CSSProperties,

  divider: {
    width: '1px',
    height: '24px',
    background: isDark ? '#3A3A3C' : '#D1D5DB',
    flexShrink: 0,
  } as React.CSSProperties,

  filterBtn: {
    padding: '0.3rem 0.8rem',
    borderRadius: '20px',
    border: isDark ? '1px solid #3A3A3C' : '1px solid #D1D5DB',
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    color: isDark ? '#E5E5EA' : '#475569',
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  filterBtnActive: {
    border: '1px solid #38BDF8',
    background: '#1C1C1E',
    color: '#38BDF8',
    fontWeight: 700,
  } as React.CSSProperties,

  mapWrapper: {
    flex: 1,
    borderRadius: '16px',
    overflow: 'hidden',
    border: isDark ? '1px solid #1C1C1E' : '1px solid #E5E7EB',
    minHeight: '560px',
  } as React.CSSProperties,

  legend: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    padding: '0.65rem 1rem',
    background: isDark ? '#1C1C1E' : '#F9FAFB',
    border: isDark ? '1px solid #1C1C1E' : '1px solid #E5E7EB',
    borderRadius: '10px',
    alignItems: 'center',
  } as React.CSSProperties,

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.78rem',
    color: isDark ? '#8e8e93' : '#475569',
  } as React.CSSProperties,

  legendDot: (color: string): React.CSSProperties => ({
    width: '10px', height: '10px', borderRadius: '50%',
    background: color, flexShrink: 0,
    boxShadow: `0 0 5px ${color}`,
  }),
});


// ── Componente principal ──────────────────────────────────────────────────────
export const MapaView: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = getStyles(theme === 'dark');

  const isSuperAdmin = (user?.level ?? 0) >= 10;

  // Filtros de UI
  const [filtroSede,    setFiltroSede]    = useState<string | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [filtroEstados, setFiltroEstados] = useState<Set<EstadoFiltro>>(new Set());

  // Guard — SUPER_ADMIN, GERENTE y RECEPCIONISTA
  if (!user || (user?.level ?? 0) < 4) {
    return <Navigate to="/dashboard/resumen" replace />;
  }

  // Hook compartido: fetch + filtrado por rol
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { sucursales, sinGeo, loading, error, marcaNombre } = useMapaSucursales(user);

  // Sucursales enriquecidas con estado calculado (La Paz TZ + schedules)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const processedGyms = useMemo(() =>
    sucursales.map(sc => ({ ...sc, computedStatus: calculateGymStatus(sc) })),
    [sucursales]
  );

  // Sedes únicas (solo relevante para SUPER_ADMIN)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sedesUnicas = useMemo(() => {
    const map = new Map<string, number | null>();
    sucursales.forEach(sc => map.set(sc.sedePrincipalNombre, sc.sedePrincipalId));
    return Array.from(map.entries()).map(([nombre, id]) => ({ nombre, id }));
  }, [sucursales]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sinSedeCnt = useMemo(
    () => sucursales.filter(sc => sc.sedePrincipalId === null).length,
    [sucursales]
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const estadoCounts = useMemo(() => ({
    abierta:  processedGyms.filter(sc => sc.computedStatus === 'abierta').length,
    cerrada:  processedGyms.filter(sc => sc.computedStatus === 'cerrada').length,
    inactiva: processedGyms.filter(sc => sc.computedStatus === 'inactiva').length,
  }), [processedGyms]);

  const toggleEstado = (e: EstadoFiltro) => {
    setFiltroEstados(prev => {
      const next = new Set(prev);
      if (next.has(e)) { next.delete(e); } else { next.add(e); }
      return next;
    });
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sucursalesFiltradas = useMemo(() => {
    let list = processedGyms;
    // Filtro marca — solo aplica en SUPER_ADMIN (GERENTE ya recibe solo su marca)
    if (isSuperAdmin) {
      if (filtroSede === '__sinSede__') {
        list = list.filter(sc => sc.sedePrincipalId === null);
      } else if (filtroSede !== null) {
        list = list.filter(sc => sc.sedePrincipalNombre === filtroSede);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(sc => sc.nombre.toLowerCase().includes(q));
    }
    if (filtroEstados.size > 0) {
      list = list.filter(sc => filtroEstados.has(sc.computedStatus));
    }
    return list;
  }, [processedGyms, filtroSede, searchQuery, filtroEstados, isSuperAdmin]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section style={s.page} className="glass-panel">

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            {isSuperAdmin ? 'Mapa de Red de Sucursales' : `Mapa de Sucursales${marcaNombre ? ` — ${marcaNombre}` : ''}`}
          </h1>
          <p style={s.subtitle}>
            {isSuperAdmin
              ? 'Visualización geoespacial de toda la red de gimnasios GymSync Suite'
              : `Sucursales pertenecientes a tu marca${marcaNombre ? ` ${marcaNombre}` : ''}`}
          </p>
        </div>

        {/* Stats cards */}
        <div style={s.statsRow}>
          <div style={s.statCard}>
            <span style={s.statLabel}>Total</span>
            <span style={{ ...s.statValue, color: '#38BDF8' }}>{loading ? '—' : sucursales.length}</span>
          </div>
          <div style={s.statCard}>
            <span style={s.statLabel}>En mapa</span>
            <span style={{ ...s.statValue, color: '#00E5A3' }}>{loading ? '—' : sucursalesFiltradas.length}</span>
          </div>
          {isSuperAdmin && (
            <>
              <div style={s.statCard}>
                <span style={s.statLabel}>Marcas</span>
                <span style={{ ...s.statValue, color: '#38BDF8' }}>{loading ? '—' : sedesUnicas.length}</span>
              </div>
              <div style={s.statCard}>
                <span style={s.statLabel}>Sin marca</span>
                <span style={{ ...s.statValue, color: '#8E8E93' }}>{loading ? '—' : sinSedeCnt}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Aviso sin geo */}
      {sinGeo > 0 && !loading && (
        <div style={{ background: '#FF5E00', border: 'none', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.8rem', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span><strong>{sinGeo} sucursal{sinGeo > 1 ? 'es' : ''}</strong> sin coordenadas GPS — no se {sinGeo > 1 ? 'muestran' : 'muestra'} en el mapa.</span>
        </div>
      )}

      {/* Carga / error */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Cargando datos geoespaciales...</div>
        </div>
      )}
      {error && !loading && (
        <div style={{ background: '#FF5E00', border: 'none', borderRadius: '8px', padding: '1rem', color: '#fff', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Toolbar ─────────────────────────────────────────────────────── */}
          <div style={s.toolbar}>

            {/* Buscar por nombre */}
            <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#8E8E93', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar sucursal…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={s.searchInput}
              />
            </div>

            <div style={s.divider} />

            {/* Filtro estado */}
            <span style={s.sectionLabel}>Estado:</span>
            {(Object.keys(ESTADO_CONFIG) as EstadoFiltro[]).map(key => {
              const cfg = ESTADO_CONFIG[key];
              const on  = filtroEstados.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleEstado(key)}
                  style={on ? s.pillActive(cfg.color) : s.pillInactive}
                >
                  <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: cfg.color, marginRight: '5px', flexShrink: 0, boxShadow: `0 0 4px ${cfg.color}` }} />
                  {cfg.label} ({estadoCounts[key]})
                </button>
              );
            })}

            {/* Filtro marca — solo SUPER_ADMIN (dropdown escalable) */}
            {isSuperAdmin && (
              <>
                <div style={s.divider} />
                <span style={s.sectionLabel}>Marca:</span>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <select
                    value={filtroSede ?? ''}
                    onChange={e => setFiltroSede(e.target.value === '' ? null : e.target.value)}
                    style={{
                      appearance: 'none' as const,
                      WebkitAppearance: 'none' as const,
                      background: theme === 'dark' ? '#1C1C1E' : '#F9FAFB',
                      border: filtroSede
                        ? `1px solid #38BDF8`
                        : theme === 'dark' ? '1px solid #3A3A3C' : '1px solid #D1D5DB',
                      borderRadius: '8px',
                      color: filtroSede ? '#38BDF8' : theme === 'dark' ? '#E5E5EA' : '#475569',
                      fontSize: '0.82rem',
                      fontWeight: filtroSede ? 700 : 500,
                      padding: '0.38rem 2rem 0.38rem 0.75rem',
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '170px',
                    }}
                  >
                    <option value="">Todas ({sucursales.length})</option>
                    {sinSedeCnt > 0 && (
                      <option value="__sinSede__">Sin Marca ({sinSedeCnt})</option>
                    )}
                    {sedesUnicas.map(({ nombre }) => {
                      const cnt = sucursales.filter(sc => sc.sedePrincipalNombre === nombre).length;
                      return <option key={nombre} value={nombre}>{nombre} ({cnt})</option>;
                    })}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute', right: '0.5rem', top: '50%',
                      transform: 'translateY(-50%)',
                      color: filtroSede ? '#38BDF8' : theme === 'dark' ? '#8E8E93' : '#64748b',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* ── Mapa ────────────────────────────────────────────────────────── */}
          <div style={s.mapWrapper}>
            <MapContainer
              center={[-17.7833, -63.1667]}
              zoom={12}
              style={{ height: '100%', width: '100%', minHeight: '560px', background: theme === 'dark' ? '#0A0A0A' : '#E5E5EA' }}
              zoomControl
            >
              <TileLayer
                url={theme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                maxZoom={19}
              />
              <AutoFitBounds sucursales={sucursalesFiltradas} />

              {sucursalesFiltradas.map(sc => {
                const icon = sc.computedStatus === 'inactiva'
                  ? iconInactiva
                  : sc.computedStatus === 'abierta'
                    ? iconActiva
                    : iconCerrada;
                return (
                  <Marker key={sc.id} position={[sc.latitude, sc.longitude]} icon={icon}>
                    <Popup className="gymsync-popup" maxWidth={280} minWidth={230}>
                      <PopupCard s={sc} computedStatus={sc.computedStatus} level={user.level ?? 0} />
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* ── Leyenda ─────────────────────────────────────────────────────── */}
          <div style={s.legend}>
            <div style={s.legendItem}><div style={s.legendDot('#2ecc71')} /><span>Abierta</span></div>
            <div style={s.legendItem}><div style={s.legendDot('#e74c3c')} /><span>Cerrada</span></div>
            <div style={s.legendItem}><div style={s.legendDot('#FF5E00')} /><span>Inactiva</span></div>
            {isSuperAdmin && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {sedesUnicas.slice(0, 6).map(({ nombre, id }) => (
                  <div key={nombre} style={s.legendItem}>
                    <div style={s.legendDot(getSedeColor(id))} />
                    <span style={{ color: getSedeColor(id) }}>{nombre}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Estilos globales Leaflet */}
      <style>{`
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }
        .gymsync-popup .leaflet-popup-close-button {
          color: #8E8E93 !important;
          top: 6px !important;
          right: 6px !important;
          font-size: 15px !important;
        }
        .leaflet-container { background: ${theme === 'dark' ? '#0A0A0A' : '#E5E5EA'} !important; }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </section>
  );
};
