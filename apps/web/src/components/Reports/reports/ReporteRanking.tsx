import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../../infrastructure/api.config';
import type { ReportFilters } from '../types';
import { fmtDate, inRange } from '../types';
import type { RankingPdfData } from '../pdf/ReporteRankingPdf';
import { ReportHeader, ReportMetaStrip, ReportKpiGrid, ReportSectionTitle, ReportFooter } from './preview-shared';
import { AutoInsights } from '../AutoInsights';
import { insightsRanking } from '../../../lib/insightsEngine';

const GOLD   = '#F59E0B';
const SILVER = '#9CA3AF';
const BRONZE = '#B45309';
const ORANGE = '#FF5E00';

interface GymItem { id: number; name: string; parentId?: number | null; parentName?: string | null; parent?: { name: string } | null; maxCapacity?: number; currentOccupancy?: number; aforoActual?: number; isActive?: boolean; }
interface CIItem  { id: number; gymId: number; checkInTime: string; }
interface RsvItem { id: number; reservationDate: string; status: string; gym?: { id: number } | null; }
interface UserItem { id: number; isActive?: boolean; userRoles?: { gym?: { id: number } | null }[] | null; }

interface Props {
  filters: ReportFilters;
  onCsvReady?: (rows: string[][]) => void;
  onPdfDataReady?: (data: RankingPdfData, chartIds: string[]) => void;
}

export function ReporteRanking({ filters, onCsvReady, onPdfDataReady }: Props) {
  const { data: allGyms = [],  isLoading: lG  } = useQuery<GymItem[]>({ queryKey: ['rpt-rank-gyms'],  queryFn: async () => { const r = await apiClient.get('/gyms');                                                    return Array.isArray(r.data) ? r.data : []; }, staleTime: 60_000 });
  const { data: checkins  = [], isLoading: lCI } = useQuery<CIItem[]>({  queryKey: ['rpt-rank-ci'],   queryFn: async () => { const r = await apiClient.get('/checkins');                                               return Array.isArray(r.data) ? r.data : []; }, staleTime: 60_000 });
  const { data: reservas  = [], isLoading: lRsv } = useQuery<RsvItem[]>({ queryKey: ['rpt-rank-rsv'], queryFn: async () => { const r = await apiClient.get('/reservations', { params: { limit: 2000 } }); return Array.isArray(r.data) ? r.data : (r.data?.data ?? []); }, staleTime: 60_000 });
  const { data: users     = [], isLoading: lU  } = useQuery<UserItem[]>({ queryKey: ['rpt-rank-users'], queryFn: async () => { const r = await apiClient.get('/users', { params: { limit: 10000, offset: 0 } }); return Array.isArray(r.data) ? r.data : (r.data?.data ?? []); }, staleTime: 60_000 });

  const loading = lG || lCI || lRsv || lU;

  const branches = useMemo(() => allGyms.filter(g => !!g.parentId), [allGyms]);

  const ranked = useMemo(() => {
    const ciPer: Record<number, number>  = {};
    const rsvPer: Record<number, number> = {};
    const memPer: Record<number, Set<number>> = {};

    checkins.forEach(c => {
      if (c.gymId && inRange(c.checkInTime, filters.range.from, filters.range.to))
        ciPer[c.gymId] = (ciPer[c.gymId] ?? 0) + 1;
    });
    reservas.forEach(r => {
      const gid = r.gym?.id;
      const ns = r.status?.toUpperCase() ?? '';
      const isCompleted = ['USED', 'COMPLETADA', 'USADA', 'COMPLETE', 'CONFIRMED', 'CONFIRMADA'].includes(ns);
      if (gid && isCompleted && inRange(r.reservationDate, filters.range.from, filters.range.to))
        rsvPer[gid] = (rsvPer[gid] ?? 0) + 1;
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

    const maxCI  = Math.max(1, ...branches.map(b => ciPer[b.id]  ?? 0));
    const maxRsv = Math.max(1, ...branches.map(b => rsvPer[b.id] ?? 0));
    const maxMem = Math.max(1, ...branches.map(b => memPer[b.id]?.size ?? 0));

    return branches.map(b => {
      const ci   = ciPer[b.id]  ?? 0;
      const rsv  = rsvPer[b.id] ?? 0;
      const mem  = memPer[b.id]?.size ?? 0;
      const occ  = b.currentOccupancy ?? b.aforoActual ?? 0;
      const max  = b.maxCapacity ?? 0;
      const pct  = max > 0 ? occ / max : 0;

      const score = Math.round(
        (ci  / maxCI)  * 40 +
        (rsv / maxRsv) * 30 +
        (mem / maxMem) * 20 +
        pct            * 10
      );
      return {
        id:    b.id,
        name:  b.name,
        brand: b.parentName ?? b.parent?.name ?? '—',
        ci, rsv, mem,
        occPct: max > 0 ? Math.round(pct * 100) : null,
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }, [branches, checkins, reservas, users, filters.range]);

  const genAt = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const top3 = ranked.slice(0, 3);
  const avgScore = ranked.length > 0 ? Math.round(ranked.reduce((s, r) => s + r.score, 0) / ranked.length) : 0;

  const limit = filters.topN ?? 10;
  const rankedVisible = limit > 0 ? ranked.slice(0, limit) : ranked;

  const chartData = rankedVisible.map(r => ({
    name:  r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name,
    score: r.score,
  }));

  const badgeColor = (i: number) => i === 0 ? GOLD : i === 1 ? SILVER : BRONZE;
  const podioHeights = [160, 120, 90];

  useEffect(() => {
    if (!onCsvReady || loading) return;
    const header = ['Posición', 'Sede', 'Marca', 'Check-ins', 'Reservas', 'Miembros', 'Ocupación%', 'Score'];
    const csvRows = ranked.map((r, i) => [String(i + 1), r.name, r.brand, String(r.ci), String(r.rsv), String(r.mem), r.occPct !== null ? String(r.occPct) : '—', String(r.score)]);
    onCsvReady([header, ...csvRows]);
  }, [ranked, loading, onCsvReady]);

  useEffect(() => {
    if (!onPdfDataReady || loading) return;
    onPdfDataReady(
      {
        period: `${fmtDate(filters.range.from)} — ${fmtDate(filters.range.to)}`,
        genAt,
        kpis: [
          { label: 'Sucursales rankeadas', value: String(ranked.length), accent: '#6B7280' },
          { label: 'Sucursal líder',      value: ranked[0]?.name ?? '—', accent: '#F59E0B' },
          { label: 'Score promedio',  value: `${avgScore}/100`,       accent: '#FF5E00' },
        ],
        top3: ranked.slice(0, 3).map(r => ({ name: r.name, brand: r.brand, score: r.score })),
        ranked: ranked.map((r, i) => ({
          pos: `#${i + 1}`, name: r.name, brand: r.brand,
          ci: String(r.ci), rsv: String(r.rsv), mem: String(r.mem),
          occPct: r.occPct !== null ? `${r.occPct}%` : '—',
          score: String(r.score),
        })),
        charts: {},
      },
      ['chart-ranking-bar'],
    );
  }, [ranked, loading, onPdfDataReady]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 14 }}>
        <Loader2 size={28} style={{ color: '#FF5E00', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: 13 }}>Calculando ranking de sucursales...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div id="report-content" style={{ width: 900, backgroundColor: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#111827' }}>
      <ReportHeader title="Ranking de Sucursales" />
      <ReportMetaStrip from={filters.range.from} to={filters.range.to} genAt={genAt} />

      <div style={{ padding: '28px 40px 40px' }}>
        <ReportKpiGrid kpis={[
          { label: 'Sucursales rankeadas', value: ranked.length.toString(),  accent: '#6B7280' },
          { label: 'Sucursal líder',      value: ranked[0]?.name ?? '—',   accent: GOLD      },
          { label: 'Score promedio',  value: `${avgScore}/100`,         accent: ORANGE    },
        ]} />

        <AutoInsights insights={insightsRanking({ ranked, avgScore })} />

        {/* Podio Top 3 */}
        {top3.length >= 1 && (
          <>
            <ReportSectionTitle>Podio — Top 3 Sucursales</ReportSectionTitle>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24, height: 220 }}>
              {/* Reorder: 2nd, 1st, 3rd */}
              {[top3[1], top3[0], top3[2]].map((sede, idx) => {
                if (!sede) return <div key={idx} style={{ width: 160 }} />;
                const realIdx = idx === 0 ? 1 : idx === 1 ? 0 : 2;
                const h = podioHeights[realIdx];
                const c = badgeColor(realIdx);
                const positions = ['1°', '2°', '3°'];
                return (
                  <div key={sede.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 160 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c, marginBottom: 6, letterSpacing: '-0.5px' }}>{positions[realIdx]}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'center', marginBottom: 4, lineHeight: 1.2 }}>{sede.name}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 8 }}>{sede.brand}</div>
                    <div style={{ width: '100%', height: h, background: c, borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#ffffff', fontSize: 22, fontWeight: 800 }}>{sede.score}</span>
                    </div>
                    <div style={{ width: '100%', height: 12, background: '#E5E7EB', borderRadius: '0 0 4px 4px' }} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bar chart top 10 */}
        {chartData.length > 0 && (
          <>
            <ReportSectionTitle>Score por Sucursal — Top {chartData.length}</ReportSectionTitle>
            <div id="chart-ranking-bar">
            <BarChart width={820} height={200} data={chartData} margin={{ top: 4, right: 16, bottom: 20, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${v}/100`, 'Score']} contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff' }} />
              <Bar dataKey="score" radius={[3, 3, 0, 0]} name="Score">
                {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? GOLD : i === 1 ? SILVER : i === 2 ? BRONZE : ORANGE} />)}
              </Bar>
            </BarChart>
            </div>
          </>
        )}

        {/* Tabla completa */}
        <ReportSectionTitle>Tabla Completa</ReportSectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111111' }}>
              {['Pos.', 'Sede', 'Marca', 'Check-ins', 'Reservas', 'Miembros', 'Ocup.%', 'Score'].map((h, i) => (
                <th key={h} style={{ padding: '9px 10px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#111111' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankedVisible.map((r, i) => (
              <tr key={r.id} style={{ background: '#ffffff', borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '9px 10px', color: '#9CA3AF', fontWeight: 700, fontFamily: 'monospace' }}>#{i + 1}</td>
                <td style={{ padding: '9px 10px', color: '#111827', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '9px 10px', color: '#6B7280' }}>{r.brand}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{r.ci.toLocaleString('es-BO')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{r.rsv.toLocaleString('es-BO')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{r.mem.toLocaleString('es-BO')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{r.occPct !== null ? `${r.occPct}%` : '—'}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#111111', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 8, fontSize: 10, color: '#9CA3AF' }}>
          Score = check-ins×40% + reservas completadas×30% + miembros activos×20% + % ocupación×10% (normalizado 0–100)
        </div>

        <ReportFooter genAt={genAt} />
      </div>
    </div>
  );
}
