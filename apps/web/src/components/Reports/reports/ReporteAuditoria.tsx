import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../../infrastructure/api.config';
import type { ReportFilters } from '../types';
import { fmtDate, inRange } from '../types';
import type { AuditoriaPdfData } from '../pdf/ReporteAuditoriaPdf';
import { ReportHeader, ReportMetaStrip, ReportKpiGrid, ReportSectionTitle, ReportFooter } from './preview-shared';
import { AutoInsights } from '../AutoInsights';
import { insightsAuditoria } from '../../../lib/insightsEngine';

const ORANGE = '#FF5E00';
const BLUE   = '#2563EB';

interface CI {
  id: number;
  gymId: number;
  checkInTime: string;
  userProfile?: { fullName?: string; role?: string };
  gym?: { name?: string };
}

interface GymItem { id: number; name: string; }

interface Props {
  filters: ReportFilters;
  onCsvReady?: (rows: string[][]) => void;
  onPdfDataReady?: (data: AuditoriaPdfData, chartIds: string[]) => void;
}

export function ReporteAuditoria({ filters, onCsvReady, onPdfDataReady }: Props) {
  const ciUrl = filters.gymId ? `/checkins/gym/${filters.gymId}` : '/checkins';

  const { data: allCI = [], isLoading: lCI } = useQuery<CI[]>({
    queryKey: ['rpt-audit-ci', filters.gymId],
    queryFn: async () => {
      const r = await apiClient.get(ciUrl);
      return Array.isArray(r.data) ? r.data : [];
    },
    staleTime: 60_000,
  });

  const { data: gyms = [], isLoading: lG } = useQuery<GymItem[]>({
    queryKey: ['rpt-audit-gyms'],
    queryFn: async () => {
      const r = await apiClient.get('/gyms');
      return Array.isArray(r.data) ? r.data : [];
    },
    staleTime: 5 * 60_000,
  });

  const gymMap = useMemo(() => {
    const m: Record<number, string> = {};
    gyms.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [gyms]);

  const filtered = useMemo(
    () => allCI
      .filter(c => inRange(c.checkInTime, filters.range.from, filters.range.to))
      .sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()),
    [allCI, filters.range],
  );

  const uniqueUsers = useMemo(() => new Set(filtered.map(c => c.userProfile?.fullName ?? `id-${c.id}`)).size, [filtered]);
  const activeDays  = useMemo(() => new Set(filtered.map(c => c.checkInTime.slice(0, 10))).size, [filtered]);

  const hourCounts: Record<number, number> = {};
  filtered.forEach(c => {
    const h = new Date(c.checkInTime).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const peakHourStr = peakHour ? `${String(peakHour[0]).padStart(2, '0')}:00` : '—';

  const genAt = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!onCsvReady || lCI || lG) return;
    const header = ['Fecha y hora', 'Usuario', 'Rol', 'Sede'];
    const csvRows = filtered.map(c => {
      const d = new Date(c.checkInTime);
      const dateStr = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      return [`${dateStr} ${timeStr}`, c.userProfile?.fullName ?? '—', c.userProfile?.role ?? '—', c.gym?.name ?? gymMap[c.gymId] ?? `Sucursal #${c.gymId}`];
    });
    onCsvReady([header, ...csvRows]);
  }, [filtered, lCI, lG, gymMap, onCsvReady]);

  useEffect(() => {
    if (!onPdfDataReady || lCI || lG) return;
    onPdfDataReady(
      {
        gymName: filters.gymName,
        period: `${fmtDate(filters.range.from)} — ${fmtDate(filters.range.to)}`,
        genAt,
        kpis: [
          { label: 'Total registros',    value: filtered.length.toLocaleString('es-BO'), accent: '#FF5E00' },
          { label: 'Usuarios únicos',    value: String(uniqueUsers),                     accent: '#2563EB' },
          { label: 'Días con actividad', value: String(activeDays),                      accent: '#10B981' },
          { label: 'Hora pico',          value: peakHourStr,                             accent: '#7C3AED' },
        ],
        rows: filtered.map(c => ({
          datetime: fmtDateTime(c.checkInTime),
          user:     c.userProfile?.fullName ?? '—',
          role:     c.userProfile?.role ?? '—',
          gym:      c.gym?.name ?? gymMap[c.gymId] ?? `Sede #${c.gymId}`,
        })),
      },
      [],
    );
  }, [filtered, lCI, lG, onPdfDataReady]);

  function fmtDateTime(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  }

  if (lCI || lG) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 14 }}>
        <Loader2 size={28} style={{ color: '#FF5E00', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: 13 }}>Cargando registro de accesos...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div id="report-content" style={{ width: 900, backgroundColor: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#111827' }}>
      <ReportHeader title="Auditoría de Accesos" gymName={filters.gymName} />
      <ReportMetaStrip from={filters.range.from} to={filters.range.to} genAt={genAt} />

      <div style={{ padding: '28px 40px 40px' }}>
        <ReportKpiGrid kpis={[
          { label: 'Total registros',    value: filtered.length.toLocaleString('es-BO'), accent: ORANGE    },
          { label: 'Usuarios únicos',    value: uniqueUsers.toString(),                  accent: BLUE      },
          { label: 'Días con actividad', value: activeDays.toString(),                   accent: '#10B981' },
          { label: 'Hora pico',          value: peakHourStr,                             accent: '#7C3AED' },
        ]} />

        <AutoInsights insights={insightsAuditoria({ total: filtered.length, uniqueUsers, activeDays, days: Math.max(1, Math.ceil((new Date(filters.range.to).getTime() - new Date(filters.range.from).getTime()) / 86_400_000) + 1) })} />

        {/* Tabla de log */}
        <ReportSectionTitle>Registro Completo de Accesos ({filtered.length} entradas)</ReportSectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111111' }}>
              {['#', 'Fecha y hora', 'Usuario', 'Rol', 'Sede'].map((h) => (
                <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#111111' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const gymName = c.gym?.name ?? gymMap[c.gymId] ?? `Sede #${c.gymId}`;
              return (
                <tr key={c.id} style={{ background: '#ffffff', borderBottom: '1px solid #E5E7EB' }}>
                  <td style={{ padding: '7px 10px', color: '#D1D5DB', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', color: '#374151', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDateTime(c.checkInTime)}</td>
                  <td style={{ padding: '7px 10px', color: '#111827', fontWeight: 600 }}>{c.userProfile?.fullName ?? '—'}</td>
                  <td style={{ padding: '7px 10px', color: '#6B7280' }}>{c.userProfile?.role ?? '—'}</td>
                  <td style={{ padding: '7px 10px', color: '#6B7280' }}>{gymName}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '24px 10px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Sin registros en el período seleccionado.</td>
              </tr>
            )}
          </tbody>
        </table>

        <ReportFooter genAt={genAt} label="GymSync — Registro de Auditoría Interno" />
      </div>
    </div>
  );
}
