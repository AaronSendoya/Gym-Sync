import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building, RefreshCw, Clock,
  Users, Dumbbell, UserCheck, MapPin, Activity,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { apiClient } from '../../infrastructure/api.config';
import { DB_ROLES } from '../../config/rbac.constants';
import { pillCls } from './Shared/designTokens';
import type { GymDto, UserDto } from './Shared/DashboardTypes';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'year';
type HistPoint = { v: number };
type SummaryData = {
  users?:        { total?: number; history?: HistPoint[] };
  checkins?:     { total?: number; history?: HistPoint[] };
  reservations?: { total?: number; history?: HistPoint[] };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const safeData = (h?: HistPoint[]): HistPoint[] =>
  h && h.length >= 2 ? h : [];

const getPeriodLabels = (period: Period): string[] => {
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      return d.toLocaleDateString('es-ES', { month: 'short' })
        .toUpperCase().replace('.', '').slice(0, 3);
    });
  }
  const n = period === 'month' ? 30 : 7;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return period === 'month'
      ? String(d.getDate())
      : d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase().slice(0, 3);
  });
};

const periodSuffix = (period: Period) =>
  period === 'week' ? 'últ. 7 días' : period === 'month' ? 'últ. 30 días' : 'últ. 12 meses';

const fmtTimeAgo = (date: Date): string => {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
};

// ── Period Toggle ─────────────────────────────────────────────────────────────
const PeriodToggle = ({
  period, onChange,
}: { period: Period; onChange: (p: Period) => void }) => (
  <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-bg-deep rounded-lg p-1">
    {(['week', 'month', 'year'] as const).map((p) => (
      <button
        key={p}
        onClick={() => onChange(p)}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
          period === p
            ? 'bg-white dark:bg-bg-surface text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
        }`}
      >
        {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
      </button>
    ))}
  </div>
);

// ── KPI card con ícono ────────────────────────────────────────────────────────
const KpiCard = ({
  label, value, icon, color,
}: {
  label: string; value: React.ReactNode; icon: React.ReactNode; color: string;
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-xl flex items-center gap-4 p-5">
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: isDark ? color : `${color}22`,
          border: isDark ? 'none' : `1.5px solid ${color}55`,
        }}
      >
        {React.cloneElement(icon as React.ReactElement, { color: isDark ? '#fff' : color })}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider truncate">
          {label}
        </span>
        <span className="text-2xl font-bold leading-tight text-slate-900 dark:text-white">
          {value}
        </span>
      </div>
    </div>
  );
};

// ── Stat pill compacto ────────────────────────────────────────────────────────
const StatPill = ({
  label, value, color,
}: {
  label: string; value: React.ReactNode; color: string;
}) => (
  <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-3">
    <div className="text-xs text-slate-500 dark:text-gray-400 mb-1 uppercase tracking-wider">{label}</div>
    <div className="text-xl font-bold" style={{ color }}>{value}</div>
  </div>
);

// ── EmptyChart ────────────────────────────────────────────────────────────────
const EmptyChart = () => (
  <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
    Sin datos suficientes
  </div>
);

// ── LineChart SVG ─────────────────────────────────────────────────────────────
const LineChartCard = ({ data, labels }: { data: HistPoint[]; labels: string[] }) => {
  const W = 600; const H = 200; const PX = 24; const PY = 28;
  if (!data.length) return <EmptyChart />;
  const vals = data.map(d => d.v);
  let min = Math.min(...vals); let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const stepX = (W - PX * 2) / Math.max(1, data.length - 1);
  const pts = vals.map((v, i) => ({
    x: PX + i * stepX,
    y: PY + (H - PY * 2) * (1 - (v - min) / span),
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const gridLines = [0.25, 0.5, 0.75].map(p => PY + (H - PY * 2) * p);
  const tickStep = Math.max(1, Math.floor(labels.length / 7));
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {gridLines.map((y, i) => (
        <line key={i} x1={PX} x2={W - PX} y1={y} y2={y} stroke="#ffffff30" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <path d={d} fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        i % tickStep === 0 ? <circle key={i} cx={p.x} cy={p.y} r="3" fill="#ffffff" /> : null
      ))}
      {labels.map((lbl, i) => (
        i % tickStep === 0 && pts[i] ? (
          <text key={i} x={pts[i].x} y={H - 6} fill="#ffffff90" fontSize="11" textAnchor="middle" fontFamily="system-ui">{lbl}</text>
        ) : null
      ))}
    </svg>
  );
};

// ── BarChart SVG ──────────────────────────────────────────────────────────────
const BarChartCard = ({ data, labels }: { data: HistPoint[]; labels: string[] }) => {
  const W = 600; const H = 200; const PX = 24; const PY = 28;
  if (!data.length) return <EmptyChart />;
  const vals = data.map(d => d.v);
  const max = Math.max(...vals, 1);
  const areaW = W - PX * 2;
  const barW = (areaW / data.length) * 0.55;
  const gap  = (areaW / data.length) * 0.45;
  const slot = barW + gap;
  const gridLines = [0.25, 0.5, 0.75].map(p => PY + (H - PY * 2) * p);
  const tickStep = Math.max(1, Math.floor(labels.length / 7));
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {gridLines.map((y, i) => (
        <line key={i} x1={PX} x2={W - PX} y1={y} y2={y} stroke="#ffffff30" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      {vals.map((v, i) => {
        const bH = (H - PY * 2) * (v / max);
        const x = PX + i * slot + gap / 2;
        const y = H - PY - bH;
        return <rect key={i} x={x} y={y} width={barW} height={Math.max(bH, 2)} fill="#ffffff" rx="2" />;
      })}
      {labels.map((lbl, i) => (
        i % tickStep === 0 ? (
          <text key={i} x={PX + i * slot + slot / 2} y={H - 6} fill="#ffffff90" fontSize="11" textAnchor="middle" fontFamily="system-ui">{lbl}</text>
        ) : null
      ))}
    </svg>
  );
};

// ── PieChart SVG ──────────────────────────────────────────────────────────────
const PieChartCard = ({ data, labels, colors }: { data: number[]; labels: string[]; colors: string[] }) => {
  const W = 600; const H = 200; const cx = W / 2 - 80; const cy = H / 2; const r = 78;
  const total = data.reduce((a, b) => a + b, 0);
  if (total === 0) return <EmptyChart />;
  let angle = -90;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {data.map((value, i) => {
        if (value === 0) return null;
        const sliceAngle = (value / total) * 360;
        if (value === total) return <circle key={i} cx={cx} cy={cy} r={r} fill={colors[i]} />;
        const x1 = cx + r * Math.cos((angle * Math.PI) / 180);
        const y1 = cy + r * Math.sin((angle * Math.PI) / 180);
        angle += sliceAngle;
        const x2 = cx + r * Math.cos((angle * Math.PI) / 180);
        const y2 = cy + r * Math.sin((angle * Math.PI) / 180);
        const largeArc = sliceAngle > 180 ? 1 : 0;
        return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={colors[i]} stroke="#00000030" strokeWidth="1.5" />;
      })}
      <g transform={`translate(${cx + r + 36}, ${cy - (data.filter(v => v > 0).length * 26) / 2 + 10})`}>
        {labels.map((lbl, i) => {
          if (data[i] === 0) return null;
          const pct = Math.round((data[i] / total) * 100);
          return (
            <g key={i} transform={`translate(0, ${i * 26})`}>
              <circle cx="0" cy="-5" r="6" fill={colors[i]} />
              <text x="14" y="0" fill="#ffffff" fontSize="14" fontFamily="system-ui" fontWeight="500">
                {lbl} ({data[i]}) — {pct}%
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// ── RingChart SVG ─────────────────────────────────────────────────────────────
const RingChartCard = ({ label, current, max, color }: { label: string; current: number; max: number; color: string }) => {
  const W = 600; const H = 200; const cx = W / 2; const cy = H / 2;
  const r = 70; const sw = 16; const perim = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="#ffffff20" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="transparent" stroke={color} strokeWidth={sw}
        strokeDasharray={`${pct * perim} ${perim - pct * perim}`}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      <text x={cx} y={cy + 4} fill="#ffffff" fontSize="30" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
        {Math.round(pct * 100)}%
      </text>
      <text x={cx} y={cy + 24} fill="#ffffff90" fontSize="12" textAnchor="middle" fontFamily="system-ui">
        {current.toLocaleString('es-ES')} / {max.toLocaleString('es-ES')} {label}
      </text>
    </svg>
  );
};

// ── HBarChart — barras horizontales ──────────────────────────────────────────
const HBarChartCard = ({ data }: { data: { label: string; value: number }[] }) => {
  if (!data.length) return <EmptyChart />;
  const max = Math.max(...data.map(d => d.value), 1);
  const shown = data.slice(0, 6);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', height: '100%', padding: '4px 0' }}>
      {shown.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ffffff99', fontSize: '11px', width: '90px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
          <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: '#ffffff20' }}>
            <div style={{ height: '10px', borderRadius: '5px', background: '#ffffff', width: `${Math.max(5, (d.value / max) * 100)}%` }} />
          </div>
          <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700, width: '18px', textAlign: 'right' }}>
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── ChartCard contenedor ──────────────────────────────────────────────────────
const ChartCard = ({
  bg, title, subtitle, total, totalLabel, updatedAt, children,
}: {
  bg: string; title: string; subtitle: string; total: number | string;
  totalLabel: string; updatedAt: Date; children: React.ReactNode;
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
      <div style={{ background: bg, padding: '16px 20px 0 20px', position: 'relative' }}>
        {!isDark && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.20)', pointerEvents: 'none', zIndex: 0 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="mb-2">
            <div className="text-white/70 text-xs font-semibold uppercase tracking-wider">{totalLabel}</div>
            <div className="text-white text-2xl font-bold leading-tight">
              {typeof total === 'number' ? total.toLocaleString('es-ES') : total}
            </div>
          </div>
          <div style={{ width: '100%', height: '180px' }}>
            {children}
          </div>
        </div>
      </div>
      <div className="px-5 py-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500 mt-3 pt-3 border-t border-slate-100 dark:border-gray-800">
          <Clock size={11} />
          <span>actualizado {fmtTimeAgo(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};

// ── Tabla top sucursales ──────────────────────────────────────────────────────
const TopBranchesCard = ({
  branches, updatedAt,
}: { branches: GymDto[]; updatedAt: Date }) => {
  const sorted = [...branches]
    .sort((a, b) => (b.maxCapacity ?? 0) - (a.maxCapacity ?? 0))
    .slice(0, 7);
  return (
    <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-xl flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Sucursales</h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Mayor capacidad en la red</p>
      </div>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-gray-800">
              <th className="text-left px-5 py-2.5 font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Sucursal</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Cap.</th>
              <th className="text-center px-3 py-2.5 font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Activa</th>
              <th className="text-center px-5 py-2.5 font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Abierta</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => (
              <tr key={g.id} className="border-b border-slate-50 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white max-w-[130px] truncate">{g.name}</td>
                <td className="px-3 py-2.5 text-right text-slate-700 dark:text-gray-300 font-medium">
                  {(g.maxCapacity ?? 0).toLocaleString('es-ES')}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={pillCls(g.isActive ? 'green' : 'gray')}>
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${g.isActive ? 'bg-green-400' : 'bg-gray-400'}`} />
                    {g.isActive ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-center">
                  <span className={pillCls(g.isOpen ? 'sky' : 'gray')}>
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${g.isOpen ? 'bg-sky-400' : 'bg-gray-400'}`} />
                    {g.isOpen ? 'Sí' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500">
          <Clock size={11} />
          <span>actualizado {fmtTimeAgo(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};

// ── Vista cliente ─────────────────────────────────────────────────────────────
const ClienteResumen = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mi Progreso Personal</h1>
      <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
        Aquí podrás ver tu suscripción, check-ins y nivel de asistencia.
      </p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
      <div className="bg-white dark:bg-bg-surface border border-brand-green rounded-xl p-5">
        <p className="text-xs font-semibold text-brand-green uppercase tracking-wider mb-2">Suscripción</p>
        <p className="text-2xl font-bold text-brand-green">ACTIVA</p>
      </div>
      <div className="bg-white dark:bg-bg-surface border border-brand-celeste rounded-xl p-5">
        <p className="text-xs font-semibold text-brand-celeste uppercase tracking-wider mb-2">Último Check-in</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">Hoy, 08:30</p>
      </div>
    </div>
  </div>
);

// ── Componente principal ──────────────────────────────────────────────────────
export const ResumenView = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');

  const { data, isLoading: loading, error: fetchError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['resumen', user?.id, user?.role, period],
    queryFn: async () => {
      const [summaryRes, gymsRes, brandsRes, usersRes] = await Promise.allSettled([
        apiClient.get<SummaryData>(`/dashboard/summary?period=${period}`),
        apiClient.get('/gyms'),
        apiClient.get('/gyms/brands'),
        apiClient.get('/users'),
      ]);
      return {
        summary:   summaryRes.status === 'fulfilled' ? (summaryRes.value.data ?? {}) : {} as SummaryData,
        gyms:      gymsRes.status    === 'fulfilled' && Array.isArray(gymsRes.value.data)    ? gymsRes.value.data    as GymDto[]  : [] as GymDto[],
        gymBrands: brandsRes.status  === 'fulfilled' && Array.isArray(brandsRes.value.data)  ? brandsRes.value.data  as GymDto[]  : [] as GymDto[],
        allUsers:  usersRes.status   === 'fulfilled' && Array.isArray(usersRes.value.data)   ? usersRes.value.data   as UserDto[] : [] as UserDto[],
      };
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const summary   = data?.summary   ?? {};
  const gyms      = data?.gyms      ?? [];
  const gymBrands = data?.gymBrands ?? [];
  const allUsers  = data?.allUsers  ?? [];
  const updatedAt = new Date(dataUpdatedAt);
  const error     = fetchError ? ((fetchError as Error).message || 'No se pudo cargar el resumen.') : null;

  if ((user?.level ?? 0) <= 1) return <ClienteResumen />;

  // ── Datos base ──────────────────────────────────────────────────────────────
  const brands   = gymBrands;
  const branches = gyms.filter(g => !!g.parentId);

  const activeBranches = branches.filter(g => !!g.isActive);
  const openBranches   = branches.filter(g => !!g.isOpen);

  const totalUsers = summary.users?.total        ?? 0;
  const totalCk    = summary.checkins?.total     ?? 0;
  const totalRes   = summary.reservations?.total ?? 0;

  const usersHist    = safeData(summary.users?.history);
  const checkinsHist = safeData(summary.checkins?.history);
  const resHist      = safeData(summary.reservations?.history);

  const labels = getPeriodLabels(period);
  const suffix = periodSuffix(period);

  const adminTotalAforo  = branches.reduce((acc, g) => acc + (g.aforoActual ?? 0), 0);
  const adminMaxCapacity = branches.reduce((acc, g) => acc + (g.maxCapacity ?? 0), 0);
  const avgCapacity      = branches.length > 0 ? Math.round(adminMaxCapacity / branches.length) : 0;
  const avgUsers         = branches.length > 0 ? Math.round(totalUsers / branches.length) : 0;

  void adminTotalAforo;

  // Distribución de roles
  const adminClientes = allUsers.filter(u => u.userRoles?.some(ur => ur.roleId === DB_ROLES.CLIENTE)).length;
  const adminPersonal = allUsers.filter(u => u.userRoles?.some(ur => [DB_ROLES.ENTRENADOR, DB_ROLES.NUTRICIONISTA, DB_ROLES.INSTRUCTOR].includes(ur.roleId))).length;
  const adminGerentes = allUsers.filter(u => u.userRoles?.some(ur => ur.roleId === DB_ROLES.GERENTE || ur.roleId === DB_ROLES.SUPER_ADMIN)).length;

  const adminPieData   = [adminClientes, adminPersonal, adminGerentes];
  const adminPieLabels = ['Clientes', 'Personal', 'Administración'];
  const adminPieColors = ['#38BDF8', '#FF5E00', '#00E5A3'];

  const topBranchesByCapacity = [...branches]
    .sort((a, b) => (b.maxCapacity ?? 0) - (a.maxCapacity ?? 0))
    .slice(0, 6)
    .map(b => ({ label: b.name, value: b.maxCapacity ?? 0 }));

  // Datos GERENTE / RECEPCIONISTA
  const userGymId          = user?.gymId ? Number(user.gymId) : null;
  const userGym            = gyms.find(g => g.id === userGymId);
  const gymName            = userGym?.name ?? 'N/A';

  // Nivel 5 = Gerente: administra una Marca completa
  const isGerenteLevel     = (user?.level ?? 0) === 5;
  // brandName del JWT tiene precedencia; si es dato antiguo (gymId = sucursal), el gymId ya
  // debería apuntar a la Marca tras el fix del formulario; brandName es el fallback seguro
  const marcaDisplayName   = user?.brandName || gymName;

  const clientCount        = allUsers.filter(u => u.userRoles?.some(ur => ur.roleId === DB_ROLES.CLIENTE)).length;
  const entrenadorCount    = allUsers.filter(u => u.userRoles?.some(ur => ur.roleId === DB_ROLES.ENTRENADOR)).length;
  const nutricionistaCount = allUsers.filter(u => u.userRoles?.some(ur => ur.roleId === DB_ROLES.NUTRICIONISTA)).length;
  const totalStaff         = entrenadorCount + nutricionistaCount;

  const roleText = (user?.level ?? 0) >= 10
    ? 'Vista global de toda la cadena de gimnasios.'
    : isGerenteLevel
      ? `Métricas de tu marca ${marcaDisplayName}.`
      : `Métricas de tu sucursal ${gymName}.`;

  const isGerente = (user?.level ?? 0) < 10;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Resumen</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">{roleText}</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodToggle period={period} onChange={setPeriod} />
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-gray-400 bg-white dark:bg-bg-surface border border-slate-200 dark:border-white/10 rounded-lg transition-colors duration-200 hover:border-brand-orange/40 hover:text-brand-orange disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── SUPER_ADMIN ─────────────────────────────────────────────────────── */}
      {!isGerente && (
        <>
          {/* Fila 1: KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Marcas"          value={brands.length}   icon={<Building  size={22} color="#fff" />} color="#38BDF8" />
            <KpiCard label="Sucursales"      value={branches.length} icon={<MapPin    size={22} color="#fff" />} color="#00E5A3" />
            <KpiCard label="Total Usuarios"  value={totalUsers}      icon={<Users     size={22} color="#fff" />} color="#FF5E00" />
            <KpiCard label="Total Reservas"  value={totalRes}        icon={<Activity  size={22} color="#fff" />} color="#FF5E00" />
          </div>

          {/* Fila 2: Pills secundarios */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill label="Sucursales Activas"  value={activeBranches.length} color="#00E5A3" />
            <StatPill label="Sucursales Abiertas" value={openBranches.length}   color="#38BDF8" />
            <StatPill label="Prom. Cap./Sucursal" value={avgCapacity}           color="#FF5E00" />
            <StatPill label="Prom. Usuarios/Suc." value={avgUsers}              color="#FF5E00" />
          </div>

          {/* Fila 3: Gráficos principales (2 columnas) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard
              bg="#00E5A3"
              title="Usuarios registrados"
              subtitle={`Crecimiento de usuarios en la cadena — ${suffix}`}
              total={totalUsers}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <LineChartCard data={usersHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#38BDF8"
              title="Distribución de Roles"
              subtitle="Composición total de la plataforma"
              total={allUsers.length}
              totalLabel="TOTAL USUARIOS"
              updatedAt={updatedAt}
            >
              <PieChartCard data={adminPieData} labels={adminPieLabels} colors={adminPieColors} />
            </ChartCard>
          </div>

          {/* Fila 4: Gráficos secundarios (3 columnas) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <ChartCard
              bg="#FF5E00"
              title="Reservas activas"
              subtitle={`Reservas registradas — ${suffix}`}
              total={totalRes}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <BarChartCard data={resHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#38BDF8"
              title="Check-ins"
              subtitle={`Accesos físicos confirmados — ${suffix}`}
              total={totalCk}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <LineChartCard data={checkinsHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#38BDF8"
              title="Sucursales Activas"
              subtitle="Porcentaje de sucursales en operación"
              total={`${activeBranches.length} / ${branches.length}`}
              totalLabel="ACTIVAS / TOTAL"
              updatedAt={updatedAt}
            >
              <RingChartCard label="sucursales" current={activeBranches.length} max={Math.max(branches.length, 1)} color="#ffffff" />
            </ChartCard>
          </div>

          {/* Fila 5: HBar + Tabla top sucursales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard
              bg="#FF5E00"
              title="Capacidad por Sucursal"
              subtitle="Top sucursales con mayor aforo máximo"
              total={adminMaxCapacity.toLocaleString('es-ES')}
              totalLabel="CAP. TOTAL INSTALADA"
              updatedAt={updatedAt}
            >
              <HBarChartCard data={topBranchesByCapacity} />
            </ChartCard>

            <TopBranchesCard branches={branches} updatedAt={updatedAt} />
          </div>
        </>
      )}

      {/* ── GERENTE / RECEPCIONISTA ──────────────────────────────────────────── */}
      {isGerente && (
        <>
          {/* Fila 1: KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Clientes"       value={clientCount}        icon={<Users     size={22} color="#fff" />} color="#38BDF8" />
            <KpiCard label="Entrenadores"   value={entrenadorCount}    icon={<Dumbbell  size={22} color="#fff" />} color="#38BDF8" />
            <KpiCard label="Nutricionistas" value={nutricionistaCount} icon={<UserCheck size={22} color="#fff" />} color="#00E5A3" />
            <KpiCard label="Personal Total" value={totalStaff}         icon={<Activity  size={22} color="#fff" />} color="#FF5E00" />
          </div>

          {/* Fila 2: Pills secundarios */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill label="Reservas"  value={totalRes}   color="#38BDF8" />
            <StatPill label="Check-ins" value={totalCk}    color="#00E5A3" />
            <StatPill label="Usuarios"  value={totalUsers} color="#FF5E00" />
            <StatPill
              label={isGerenteLevel ? 'Marca' : 'Sucursal'}
              value={isGerenteLevel ? marcaDisplayName : gymName}
              color="#38BDF8"
            />
          </div>

          {/* Gráficos (2×2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard
              bg="#00E5A3"
              title="Clientes registrados"
              subtitle={`Crecimiento de clientes en ${isGerenteLevel ? `la marca ${marcaDisplayName}` : 'tu sucursal'} — ${suffix}`}
              total={totalUsers}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <LineChartCard data={usersHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#FF5E00"
              title="Reservas activas"
              subtitle={`Reservas registradas — ${suffix}`}
              total={totalRes}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <BarChartCard data={resHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#38BDF8"
              title="Check-ins"
              subtitle={`Accesos físicos en ${isGerenteLevel ? `la marca ${marcaDisplayName}` : 'tu sucursal'} — ${suffix}`}
              total={totalCk}
              totalLabel="TOTAL"
              updatedAt={updatedAt}
            >
              <LineChartCard data={checkinsHist} labels={labels} />
            </ChartCard>

            <ChartCard
              bg="#FF5E00"
              title="Personal por Rol"
              subtitle={`Distribución del equipo en ${isGerenteLevel ? `la marca ${marcaDisplayName}` : 'tu sucursal'}`}
              total={totalStaff}
              totalLabel="TOTAL PERSONAL"
              updatedAt={updatedAt}
            >
              <BarChartCard
                data={[{ v: entrenadorCount }, { v: nutricionistaCount }]}
                labels={['Entrenadores', 'Nutricionistas']}
              />
            </ChartCard>
          </div>
        </>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-brand-celeste rounded-full animate-spin" />
          Cargando métricas…
        </div>
      )}
    </div>
  );
};
