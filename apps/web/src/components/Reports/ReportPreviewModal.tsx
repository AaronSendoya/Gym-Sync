import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { useQueryClient } from '@tanstack/react-query';
import { captureElementAsPng } from '../../lib/pdfExport';
import { btnPrimary, iconBtnCls } from '../Dashboard/Shared/designTokens';
import type { ReportFilters } from './types';
import { ReporteAsistencia }    from './reports/ReporteAsistencia';
import { ReporteMaquinas }      from './reports/ReporteMaquinas';
import { ReporteConsolidado }   from './reports/ReporteConsolidado';
import { ReporteAforo }         from './reports/ReporteAforo';
import { ReporteRanking }       from './reports/ReporteRanking';
import { ReporteActividades }   from './reports/ReporteActividades';
import { ReporteCancelaciones } from './reports/ReporteCancelaciones';
import { ReporteFrecuencia }    from './reports/ReporteFrecuencia';
import { ReporteAuditoria }     from './reports/ReporteAuditoria';
import { ReporteChurn }         from './reports/ReporteChurn';

import { ReporteAsistenciaPdf }    from './pdf/ReporteAsistenciaPdf';
import { ReporteMaquinasPdf }      from './pdf/ReporteMaquinasPdf';
import { ReporteConsolidadoPdf }   from './pdf/ReporteConsolidadoPdf';
import { ReporteAforoPdf }         from './pdf/ReporteAforoPdf';
import { ReporteRankingPdf }       from './pdf/ReporteRankingPdf';
import { ReporteActividadesPdf }   from './pdf/ReporteActividadesPdf';
import { ReporteCancelacionesPdf } from './pdf/ReporteCancelacionesPdf';
import { ReporteFrecuenciaPdf }    from './pdf/ReporteFrecuenciaPdf';
import { ReporteAuditoriaPdf }     from './pdf/ReporteAuditoriaPdf';
import { ReporteChurnPdf }         from './pdf/ReporteChurnPdf';

type PdfDocFn = (data: any) => React.ReactElement;

const PDF_DOCS: Record<string, PdfDocFn> = {
  asistencia:    (d) => <ReporteAsistenciaPdf data={d} />,
  maquinas:      (d) => <ReporteMaquinasPdf data={d} />,
  consolidado:   (d) => <ReporteConsolidadoPdf data={d} />,
  aforo:         (d) => <ReporteAforoPdf data={d} />,
  ranking:       (d) => <ReporteRankingPdf data={d} />,
  actividades:   (d) => <ReporteActividadesPdf data={d} />,
  cancelaciones: (d) => <ReporteCancelacionesPdf data={d} />,
  frecuencia:    (d) => <ReporteFrecuenciaPdf data={d} />,
  auditoria:     (d) => <ReporteAuditoriaPdf data={d} />,
  churn:         (d) => <ReporteChurnPdf data={d} />,
};

const REPORT_LABELS: Record<string, string> = {
  asistencia:  'asistencia-sucursal',
  maquinas:    'inventario-maquinas',
  consolidado: 'consolidado-sucursales',
};

interface Props {
  filters: ReportFilters;
  onClose: () => void;
}

function useFreshness() {
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - mountedAt.current;
  const mins = Math.floor(elapsed / 60_000);
  const label = mins < 1 ? 'recién cargado' : mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins / 60)}h`;
  const color = mins < 5 ? '#10B981' : mins < 15 ? '#F59E0B' : '#EF4444';

  return { label, color };
}

export function ReportPreviewModal({ filters, onClose }: Props) {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const pdfDataRef  = useRef<any>(null);
  const chartIdsRef = useRef<string[]>([]);
  const { label: freshnessLabel, color: freshnessColor } = useFreshness();

  function handleRefresh() {
    queryClient.invalidateQueries();
    toast.success('Datos actualizados.');
  }

  const handlePdfDataReady = useCallback((data: any, chartIds: string[]) => {
    pdfDataRef.current  = data;
    chartIdsRef.current = chartIds;
  }, []);

  async function handleExport() {
    if (!pdfDataRef.current) {
      toast.error('Los datos aún no están listos. Espera un momento.');
      return;
    }
    setExporting(true);
    try {
      // Captura solo las gráficas (elementos pequeños — sin riesgo de canvas overflow)
      const charts: Record<string, string> = {};
      for (const id of chartIdsRef.current) {
        const png = await captureElementAsPng(id);
        if (png) charts[id] = png;
      }

      // Inyecta las imágenes de gráficas en los datos PDF
      const dataWithCharts = { ...pdfDataRef.current, charts };

      // Genera el PDF vectorial con @react-pdf/renderer
      const docFn = PDF_DOCS[filters.type];
      if (!docFn) throw new Error(`No PDF doc for type: ${filters.type}`);

      const blob = await pdf(docFn(dataWithCharts)).toBlob();
      const date     = new Date().toISOString().slice(0, 10);
      const filename = `gymsync-${REPORT_LABELS[filters.type] ?? filters.type}-${date}.pdf`;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF exportado correctamente.');
    } catch (err) {
      console.error('[pdfExport] error:', err);
      toast.error('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      setExporting(false);
    }
  }

  const ReportComponent =
    filters.type === 'asistencia'    ? ReporteAsistencia    :
    filters.type === 'maquinas'      ? ReporteMaquinas      :
    filters.type === 'aforo'         ? ReporteAforo         :
    filters.type === 'ranking'       ? ReporteRanking       :
    filters.type === 'actividades'   ? ReporteActividades   :
    filters.type === 'cancelaciones' ? ReporteCancelaciones :
    filters.type === 'frecuencia'    ? ReporteFrecuencia    :
    filters.type === 'auditoria'     ? ReporteAuditoria     :
    filters.type === 'churn'         ? ReporteChurn         :
    ReporteConsolidado;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
    >
      {/* Top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-bg-surface px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className={`${iconBtnCls} text-gray-400 hover:bg-white/5 hover:text-white`}
            title="Cerrar vista previa"
          >
            <X size={17} />
          </button>
          <div className="h-5 w-px bg-white/10" />
          <span className="text-sm font-medium text-white">Vista Previa del Reporte</span>
          <div className="h-5 w-px bg-white/10" />
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: freshnessColor, display: 'inline-block', flexShrink: 0 }} />
            Datos {freshnessLabel}
          </span>
          <button
            onClick={handleRefresh}
            title="Refrescar datos"
            className={`${iconBtnCls} p-1 text-gray-500 hover:bg-white/5 hover:text-white`}
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            {exporting ? (
              <><Loader2 size={14} className="animate-spin" /> Exportando...</>
            ) : (
              <><Download size={14} /> Exportar PDF</>
            )}
          </button>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ background: '#141414', padding: '32px 0' }}
      >
        <div
          style={{
            width: 900,
            margin: '0 auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            borderRadius: 4,
          }}
        >
          <ReportComponent
            filters={filters}
            onPdfDataReady={handlePdfDataReady}
          />
        </div>
      </div>
    </div>
  );
}
