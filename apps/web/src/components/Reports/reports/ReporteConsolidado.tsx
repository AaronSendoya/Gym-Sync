import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../../infrastructure/api.config';
import type { ReportFilters } from '../types';
import { fmtDate, inRange } from '../types';
import type { ConsolidadoPdfData } from '../pdf/ReporteConsolidadoPdf';
import { ReportHeader, ReportMetaStrip, ReportKpiGrid, ReportSectionTitle, ReportFooter } from './preview-shared';
import { AutoInsights } from '../AutoInsights';
import { insightsConsolidado } from '../../../lib/insightsEngine';

const ORANGE  = '#FF5E00';
const BLUE    = '#2563EB';
const GREEN   = '#10B981';

// GET /gyms returns branches only (parentId IS NOT NULL) with parent joined
interface GymItem  { id: number; name: string; parentId: number | null; parentName?: string | null; parent?: { id: number; name: string } | null; }
interface UserItem { id: number; isActive: boolean; userRoles?: { gym?: { id: number } | null; role?: { name: string } | null }[] | null; }
interface MachItem { id: string; gymId: number; status: string; }
interface CIItem   { id: number; gymId: number; checkInTime: string; }
interface RsvItem  { id: number; reservationDate: string; gym?: { id: number } | null; }

interface Props {
  filters: ReportFilters;
  onCsvReady?: (rows: string[][]) => void;
  onPdfDataReady?: (data: ConsolidadoPdfData, chartIds: string[]) => void;
}

export function ReporteConsolidado({ filters, onCsvReady, onPdfDataReady }: Props) {
  const { data: gyms = [],     isLoading: lG  } = useQuery<GymItem[]>({
    queryKey: ['rpt-con-gyms'],
    queryFn: async () => { const r = await apiClient.get('/gyms'); return Array.isArray(r.data) ? r.data : []; },
    staleTime: 60_000,
  });

  const { data: users = [],    isLoading: lU  } = useQuery<UserItem[]>({
    queryKey: ['rpt-con-users'],
    queryFn: async () => {
      const r = await apiClient.get('/users', { params: { limit: 10000, offset: 0 } });
      return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
    },
    staleTime: 60_000,
  });

  const { data: machines = [], isLoading: lM  } = useQuery<MachItem[]>({
    queryKey: ['rpt-con-machines'],
    queryFn: async () => { const r = await apiClient.get('/machines'); return Array.isArray(r.data) ? r.data : []; },
    staleTime: 60_000,
  });

  const { data: checkins = [], isLoading: lCI } = useQuery<CIItem[]>({
    queryKey: ['rpt-con-ci'],
    queryFn: async () => { const r = await apiClient.get('/checkins'); return Array.isArray(r.data) ? r.data : []; },
    staleTime: 60_000,
  });

  const { data: reservations = [], isLoading: lRsv } = useQuery<RsvItem[]>({
    queryKey: ['rpt-con-rsv', filters.range.from, filters.range.to],
    queryFn: async () => {
      const r = await apiClient.get('/reservations', { params: { limit: 2000 } });
      return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
    },
    staleTime: 60_000,
  });

  const loading = lG || lU || lM || lCI || lRsv;

  // Super Admin receives brands (parentId=null) + branches — keep only branches
  const branches = useMemo(() => gyms.filter(g => g.parentId !== null), [gyms]);

  const branchData = useMemo(() => {
    const ciPer: Record<number, number>  = {};
    const rsvPer: Record<number, number> = {};
    const machPer: Record<number, number> = {};
    const memPer: Record<number, Set<number>> = {};

    checkins.forEach(c => {
      if (c.gymId && inRange(c.checkInTime, filters.range.from, filters.range.to)) {
        ciPer[c.gymId] = (ciPer[c.gymId] ?? 0) + 1;
      }
    });

    reservations.forEach(r => {
      if (r.gym?.id && inRange(r.reservationDate, filters.range.from, filters.range.to)) {
        rsvPer[r.gym.id] = (rsvPer[r.gym.id] ?? 0) + 1;
      }
    });

    machines.forEach(m => {
      machPer[m.gymId] = (machPer[m.gymId] ?? 0) + 1;
    });

    users.forEach(u => {
      if (!u.isActive) return;
      u.userRoles?.forEach(ur => {
        if (ur.gym?.id) {
          if (!memPer[ur.gym.id]) memPer[ur.gym.id] = new Set();
          memPer[ur.gym.id].add(u.id);
        }
      });
    });

    return branches.map(b => ({
      id:           b.id,
      name:         b.name,
      brandName:    b.parentName ?? b.parent?.name ?? 'Sin Marca',
      checkins:     ciPer[b.id]  ?? 0,
      reservations: rsvPer[b.id] ?? 0,
      machines:     machPer[b.id] ?? 0,
      members:      memPer[b.id]?.size ?? 0,
    }));
  }, [branches, checkins, reservations, machines, users, filters.range]);

  // Group by brand
  const brandGroups = useMemo(() => {
    const map: Record<string, typeof branchData> = {};
    branchData.forEach(b => {
      if (!map[b.brandName]) map[b.brandName] = [];
      map[b.brandName].push(b);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [branchData]);

  // Summary totals
  const totals = useMemo(() => ({
    members:      branchData.reduce((s, b) => s + b.members, 0),
    checkins:     branchData.reduce((s, b) => s + b.checkins, 0),
    reservations: branchData.reduce((s, b) => s + b.reservations, 0),
    machines:     branchData.reduce((s, b) => s + b.machines, 0),
    branches:     branchData.length,
    brands:       brandGroups.length,
  }), [branchData, brandGroups]);

  const chartData = useMemo(
    () => branchData
      .sort((a, b) => b.checkins - a.checkins)
      .slice(0, 10)
      .map(b => ({ name: b.name.length > 14 ? b.name.slice(0, 13) + '…' : b.name, checkins: b.checkins, reservas: b.reservations })),
    [branchData],
  );

  const genAt = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!onCsvReady || loading) return;
    const header = ['Sucursal', 'Marca', 'Check-ins', 'Reservas', 'Miembros activos', 'Máquinas'];
    const rows = branchData.map(b => [b.name, b.brandName, String(b.checkins), String(b.reservations), String(b.members), String(b.machines)]);
    onCsvReady([header, ...rows]);
  }, [branchData, loading, onCsvReady]);

  useEffect(() => {
    if (!onPdfDataReady || loading) return;
    onPdfDataReady(
      {
        period: `${fmtDate(filters.range.from)} — ${fmtDate(filters.range.to)}`,
        genAt,
        kpis: [
          { label: 'Marcas',              value: String(totals.brands),       accent: '#7C3AED' },
          { label: 'Sucursales',          value: String(totals.branches),     accent: '#6B7280' },
          { label: 'Miembros activos',    value: String(totals.members),      accent: '#2563EB' },
          { label: 'Check-ins período',   value: String(totals.checkins),     accent: '#FF5E00' },
          { label: 'Reservas período',    value: String(totals.reservations), accent: '#10B981' },
          { label: 'Máquinas',            value: String(totals.machines),     accent: '#F59E0B' },
        ],
        brandGroups: brandGroups.map(([brand, branches]) => ({
          brand,
          rows: branches.map(b => ({
            name:         b.name,
            members:      String(b.members),
            checkins:     String(b.checkins),
            reservations: String(b.reservations),
            machines:     String(b.machines),
          })),
        })),
        totals: {
          members:      String(totals.members),
          checkins:     String(totals.checkins),
          reservations: String(totals.reservations),
          machines:     String(totals.machines),
        },
        charts: {},
      },
      ['chart-consolidado-bar'],
    );
  }, [branchData, loading, onPdfDataReady]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 14 }}>
        <Loader2 size={28} style={{ color: '#FF5E00', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: 13 }}>Consolidando datos de todas las sucursales...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      id="report-content"
      style={{ width: 900, backgroundColor: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#111827' }}
    >
      <ReportHeader title="Consolidado de Sucursales" />
      <ReportMetaStrip from={filters.range.from} to={filters.range.to} genAt={genAt} />

      <div style={{ padding: '28px 40px 40px' }}>
        <ReportKpiGrid kpis={[
          { label: 'Marcas',              value: totals.brands.toLocaleString('es-BO'),       accent: '#7C3AED' },
          { label: 'Sucursales',          value: totals.branches.toLocaleString('es-BO'),     accent: '#6B7280' },
          { label: 'Miembros activos',    value: totals.members.toLocaleString('es-BO'),      accent: '#2563EB' },
          { label: 'Check-ins período',   value: totals.checkins.toLocaleString('es-BO'),     accent: ORANGE },
          { label: 'Reservas período',    value: totals.reservations.toLocaleString('es-BO'), accent: GREEN  },
          { label: 'Máquinas registradas', value: totals.machines.toLocaleString('es-BO'),   accent: '#F59E0B' },
        ]} />

        <AutoInsights insights={insightsConsolidado({ branchData, totals })} />

        {/* Bar chart: top branches by activity */}
        {chartData.length > 0 && (
          <>
            <ReportSectionTitle>Actividad por Sucursal — Top {chartData.length}</ReportSectionTitle>
            <div id="chart-consolidado-bar">
            <BarChart width={820} height={240} data={chartData} margin={{ top: 4, right: 16, bottom: 20, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="checkins" name="Check-ins" fill={ORANGE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="reservas" name="Reservas"   fill={BLUE}   radius={[3, 3, 0, 0]} />
            </BarChart>
            </div>
          </>
        )}

        {/* Summary table per brand */}
        {brandGroups.map(([brand, branches]) => (
          <div key={brand} style={{ marginBottom: 28 }}>
            <ReportSectionTitle>{brand}</ReportSectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #111111' }}>
                  {['Sucursal', 'Usuarios', 'Check-ins', 'Reservas', 'Máquinas'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#111111' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} style={{ background: '#ffffff', borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '10px 12px', color: '#111827', fontWeight: 600 }}>{b.name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{b.members.toLocaleString('es-BO')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{b.checkins.toLocaleString('es-BO')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{b.reservations.toLocaleString('es-BO')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{b.machines.toLocaleString('es-BO')}</td>
                  </tr>
                ))}
                <tr style={{ background: '#F9FAFB', borderTop: '2px solid #111111' }}>
                  <td style={{ padding: '8px 12px', color: '#111111', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Subtotal {brand}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{branches.reduce((s, b) => s + b.members, 0).toLocaleString('es-BO')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{branches.reduce((s, b) => s + b.checkins, 0).toLocaleString('es-BO')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{branches.reduce((s, b) => s + b.reservations, 0).toLocaleString('es-BO')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{branches.reduce((s, b) => s + b.machines, 0).toLocaleString('es-BO')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        {/* Grand total row */}
        <div style={{ borderTop: '2px solid #111111', borderBottom: '2px solid #111111', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#111111', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '2px' }}>Total General</span>
          <div style={{ display: 'flex', gap: 48 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Usuarios</div>
              <div style={{ color: '#111111', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>{totals.members.toLocaleString('es-BO')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Check-ins</div>
              <div style={{ color: '#111111', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>{totals.checkins.toLocaleString('es-BO')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Reservas</div>
              <div style={{ color: '#111111', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>{totals.reservations.toLocaleString('es-BO')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Máquinas</div>
              <div style={{ color: '#111111', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>{totals.machines.toLocaleString('es-BO')}</div>
            </div>
          </div>
        </div>

        <ReportFooter genAt={genAt} />
      </div>
    </div>
  );
}
