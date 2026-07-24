import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../../infrastructure/api.config';
import type { ReportFilters } from '../types';
import type { AforoPdfData } from '../pdf/ReporteAforoPdf';
import { ReportHeader, ReportMetaStripSingle, ReportKpiGrid, ReportSectionTitle, ReportFooter } from './preview-shared';
import { AutoInsights } from '../AutoInsights';
import { insightsAforo } from '../../../lib/insightsEngine';

const COLOR_HIGH   = '#EF4444'; // ≥ 80%
const COLOR_MED    = '#F59E0B'; // 50–79%
const COLOR_LOW    = '#10B981'; // < 50%
const COLOR_NONE   = '#9CA3AF'; // sin datos

function pctColor(pct: number, hasData: boolean): string {
  if (!hasData) return COLOR_NONE;
  if (pct >= 80) return COLOR_HIGH;
  if (pct >= 50) return COLOR_MED;
  return COLOR_LOW;
}

interface GymItem {
  id: number;
  name: string;
  isActive?: boolean;
  maxCapacity?: number;
  aforoActual?: number;
  currentOccupancy?: number;
  infrastructure?: { machineCapacity?: number } | null;
  parentId?: number | null;
  parent?: { id: number; name: string } | null;
  parentName?: string | null;
}

interface Props {
  filters: ReportFilters;
  onCsvReady?: (rows: string[][]) => void;
  onPdfDataReady?: (data: AforoPdfData, chartIds: string[]) => void;
}

export function ReporteAforo({ filters, onCsvReady, onPdfDataReady }: Props) {
  const { data: allGyms = [], isLoading } = useQuery<GymItem[]>({
    queryKey: ['rpt-aforo-gyms'],
    queryFn: async () => {
      const r = await apiClient.get('/gyms');
      return Array.isArray(r.data) ? r.data : [];
    },
    staleTime: 60_000,
  });

  // Solo sucursales (tienen parentId), activas, filtradas por gymId si aplica
  const gyms = useMemo(() => {
    const branches = allGyms.filter(g => !!g.parentId && g.isActive !== false);
    if (filters.gymId) return branches.filter(g => g.id === filters.gymId);
    return branches;
  }, [allGyms, filters.gymId]);

  const rows = useMemo(() => gyms.map(g => {
    const occ     = g.currentOccupancy ?? g.aforoActual ?? 0;
    const max     = g.maxCapacity ?? 0;
    const hasData = max > 0;
    const pct     = hasData ? Math.min(100, Math.round((occ / max) * 100)) : 0;
    const brand   = g.parentName ?? g.parent?.name ?? '—';
    const machCap = g.infrastructure?.machineCapacity ?? null;
    return { id: g.id, name: g.name, brand, occ, max, pct, hasData, machCap };
  }).sort((a, b) => b.pct - a.pct), [gyms]);

  const totals = useMemo(() => ({
    branches:  rows.length,
    maxTotal:  rows.reduce((s, r) => s + r.max, 0),
    occTotal:  rows.reduce((s, r) => s + r.occ, 0),
    avgPct:    rows.length > 0
      ? Math.round(rows.filter(r => r.hasData).reduce((s, r) => s + r.pct, 0) / Math.max(1, rows.filter(r => r.hasData).length))
      : 0,
    highAlert: rows.filter(r => r.pct >= 80).length,
  }), [rows]);

  const chartData = rows.filter(r => r.hasData).slice(0, 12).map(r => ({
    name:  r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name,
    pct:   r.pct,
    color: pctColor(r.pct, true),
  }));

  const genAt = new Date().toLocaleDateString('es-BO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  useEffect(() => {
    if (!onCsvReady || isLoading) return;
    const header = ['Sucursal', 'Marca', 'Ocupación actual', 'Capacidad máx.', 'Utilización%'];
    const csvRows = rows.map(r => [r.name, r.brand, String(r.occ), String(r.max), r.hasData ? String(r.pct) : '—']);
    onCsvReady([header, ...csvRows]);
  }, [rows, isLoading, onCsvReady]);

  useEffect(() => {
    if (!onPdfDataReady || isLoading) return;
    const pctColor = (pct: number, hasData: boolean) => {
      if (!hasData) return '#9CA3AF';
      if (pct >= 80) return '#EF4444';
      if (pct >= 50) return '#F59E0B';
      return '#10B981';
    };
    onPdfDataReady(
      {
        gymName: filters.gymName,
        cutDate: genAt,
        genAt,
        kpis: [
          { label: 'Sucursales',           value: String(totals.branches),                  accent: '#6B7280' },
          { label: 'Cap. total instalada', value: String(totals.maxTotal),                  accent: '#2563EB' },
          { label: 'Ocupación actual',     value: String(totals.occTotal),                  accent: '#FF5E00' },
          { label: 'Utilización promedio', value: `${totals.avgPct}%`,                      accent: pctColor(totals.avgPct, true) },
        ],
        rows: rows.map(r => ({ name: r.name, brand: r.brand, occ: String(r.occ), max: String(r.max), pct: String(r.pct), hasData: r.hasData })),
        machRows: rows.filter(r => r.machCap !== null).map(r => ({ name: r.name, brand: r.brand, machCap: String(r.machCap) })),
        charts: {},
      },
      ['chart-aforo-bar'],
    );
  }, [rows, isLoading, onPdfDataReady]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 14 }}>
        <Loader2 size={28} style={{ color: '#FF5E00', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: 13 }}>Cargando datos de aforo...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      id="report-content"
      style={{ width: 900, backgroundColor: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#111827' }}
    >
      <ReportHeader title="Estado de Aforo" gymName={filters.gymName} />
      <ReportMetaStripSingle label="Corte" value={genAt} genAt={genAt} />

      <div style={{ padding: '28px 40px 40px' }}>
        <ReportKpiGrid kpis={[
          { label: 'Sucursales',           value: totals.branches.toString(),                  accent: '#6B7280' },
          { label: 'Cap. total instalada', value: totals.maxTotal.toLocaleString('es-BO'),     accent: '#2563EB' },
          { label: 'Ocupación actual',     value: totals.occTotal.toLocaleString('es-BO'),     accent: '#FF5E00' },
          { label: 'Utilización promedio', value: `${totals.avgPct}%`,                         accent: pctColor(totals.avgPct, true) },
        ]} />

        <AutoInsights insights={insightsAforo({ avgPct: totals.avgPct, highAlert: totals.highAlert, branches: totals.branches })} />

        {/* Leyenda de colores */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, alignItems: 'center' }}>
          {[
            { color: COLOR_LOW,  label: 'Bajo (< 50%)' },
            { color: COLOR_MED,  label: 'Medio (50–79%)' },
            { color: COLOR_HIGH, label: 'Alto (≥ 80%)' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#6B7280' }}>{l.label}</span>
            </div>
          ))}
          {totals.highAlert > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '3px 10px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_HIGH }} />
              <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>{totals.highAlert} sucursal{totals.highAlert > 1 ? 'es' : ''} en alerta</span>
            </div>
          )}
        </div>

        {/* Gráfica de barras por % utilización */}
        {chartData.length > 0 && (
          <>
            <ReportSectionTitle>Utilización por Sucursal (%)</ReportSectionTitle>
            <div id="chart-aforo-bar">
            <BarChart
              width={820} height={200} data={chartData}
              margin={{ top: 4, right: 16, bottom: 20, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Utilización']}
                contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff' }}
              />
              <Bar dataKey="pct" radius={[3, 3, 0, 0]} name="Utilización">
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
            </div>
          </>
        )}

        {/* Tabla detalle por sucursal */}
        <ReportSectionTitle>Detalle por Sucursal</ReportSectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111111' }}>
              {['Sucursal', 'Marca', 'Ocupación', 'Cap. máx.', 'Utilización', 'Estado'].map((h, i) => (
                <th key={h} style={{ padding: '9px 12px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#111111' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const color = pctColor(r.pct, r.hasData);
              return (
                <tr key={r.id} style={{ background: '#ffffff', borderBottom: '1px solid #E5E7EB' }}>
                  <td style={{ padding: '10px 12px', color: '#111827', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{r.brand}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>
                    {r.hasData ? r.occ.toLocaleString('es-BO') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                    {r.hasData ? r.max.toLocaleString('es-BO') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color, fontWeight: 700 }}>
                    {r.hasData ? `${r.pct}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {r.hasData ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 80, height: 8, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden' }}>
                          <div style={{ width: `${r.pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#D1D5DB', fontSize: 11 }}>Sin datos</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Tabla capacidad de máquinas (si tiene datos) */}
        {rows.some(r => r.machCap !== null) && (
          <>
            <ReportSectionTitle>Capacidad de Máquinas por Sucursal</ReportSectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #111111' }}>
                  {['Sucursal', 'Marca', 'Cap. máquinas'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: i === 2 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#111111' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter(r => r.machCap !== null).map((r) => (
                  <tr key={r.id} style={{ background: '#ffffff', borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '10px 12px', color: '#111827', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6B7280' }}>{r.brand}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontWeight: 700, fontFamily: 'monospace' }}>{r.machCap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <ReportFooter genAt={genAt} />
      </div>
    </div>
  );
}
