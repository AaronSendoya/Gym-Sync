import React from 'react';
import { Document, Page, View, StyleSheet } from '@react-pdf/renderer';
import { PdfHeader, PdfMetaStrip, PdfKpiRow, PdfSectionTitle, PdfTable, PdfFooter, PdfPageNumbers, base, ORANGE, BLUE } from './shared';

const s = StyleSheet.create({
  page: { ...base.page },
  body: { paddingHorizontal: 32, paddingTop: 18 },
});

export interface AuditoriaPdfData {
  gymName?: string;
  period: string;
  genAt: string;
  kpis: { label: string; value: string; accent: string }[];
  rows: { datetime: string; user: string; role: string; gym: string }[];
}

export function ReporteAuditoriaPdf({ data }: { data: AuditoriaPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader title="Auditoría de Accesos" gymName={data.gymName} />
        <PdfMetaStrip period={data.period} genAt={data.genAt} />
        <View style={s.body}>
          <PdfKpiRow kpis={data.kpis} />

          <PdfSectionTitle>Registro de Accesos ({data.rows.length} entradas)</PdfSectionTitle>
          <PdfTable
            headers={['#', 'Fecha y hora', 'Usuario', 'Rol', 'Sucursal']}
            rows={data.rows.map((r, i) => [String(i + 1), r.datetime, r.user, r.role, r.gym])}
            accent={ORANGE}
          />

          <PdfFooter genAt={data.genAt} label="GymSync — Registro de Auditoría Interno" />
        </View>
        <PdfPageNumbers />
      </Page>
    </Document>
  );
}
