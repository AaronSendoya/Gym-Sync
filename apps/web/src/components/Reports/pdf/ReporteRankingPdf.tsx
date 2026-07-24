import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import { PdfHeader, PdfMetaStrip, PdfKpiRow, PdfSectionTitle, PdfTable, PdfFooter, PdfPageNumbers, base, ORANGE, GRAY_L, DARK } from './shared';

const GOLD   = '#F59E0B';
const SILVER = '#9CA3AF';
const BRONZE = '#B45309';

const s = StyleSheet.create({
  page:      { ...base.page },
  body:      { paddingHorizontal: 32, paddingTop: 18 },
  chartFull: { width: '100%', marginBottom: 8 },
  podio:     { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16, alignItems: 'flex-end' },
  podioItem: { alignItems: 'center', width: 120 },
  podioMedal:{ fontSize: 18, marginBottom: 4 },
  podioName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'center', marginBottom: 2 },
  podioBrand:{ fontSize: 7, color: GRAY_L, textAlign: 'center', marginBottom: 6 },
  podioBar:  { width: '100%', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  podioScore:{ color: '#ffffff', fontSize: 16, fontFamily: 'Helvetica-Bold' },
  noteText:  { fontSize: 7, color: GRAY_L, marginTop: 8 },
});

export interface RankingPdfData {
  period: string;
  genAt: string;
  kpis: { label: string; value: string; accent: string }[];
  top3: { name: string; brand: string; score: number }[];
  ranked: { pos: string; name: string; brand: string; ci: string; rsv: string; mem: string; occPct: string; score: string }[];
  charts: { barScore?: string };
}

const podioHeights = [80, 110, 60]; // 2nd, 1st, 3rd
const podioColors  = [SILVER, GOLD, BRONZE];
const positions    = ['2°', '1°', '3°'];

export function ReporteRankingPdf({ data }: { data: RankingPdfData }) {
  const display = [data.top3[1], data.top3[0], data.top3[2]]; // 2nd 1st 3rd
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader title="Ranking de Sucursales" gymName="Todas las marcas y sucursales" />
        <PdfMetaStrip period={data.period} genAt={data.genAt} />
        <View style={s.body}>
          <PdfKpiRow kpis={data.kpis} />

          {data.top3.length >= 1 && (
            <>
              <PdfSectionTitle>Podio — Top 3 Sucursales</PdfSectionTitle>
              <View style={s.podio}>
                {display.map((sede, idx) => {
                  if (!sede) return <View key={idx} style={{ width: 120 }} />;
                  return (
                    <View key={sede.name} style={s.podioItem}>
                      <Text style={s.podioMedal}>{positions[idx]}</Text>
                      <Text style={s.podioName}>{sede.name}</Text>
                      <Text style={s.podioBrand}>{sede.brand}</Text>
                      <View style={[s.podioBar, { height: podioHeights[idx], backgroundColor: podioColors[idx] }]}>
                        <Text style={s.podioScore}>{sede.score}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {data.charts.barScore && (
            <>
              <PdfSectionTitle>Score por Sucursal</PdfSectionTitle>
              <Image src={data.charts.barScore} style={s.chartFull} />
            </>
          )}

          <PdfSectionTitle>Tabla Completa</PdfSectionTitle>
          <PdfTable
            headers={['Pos.', 'Sede', 'Marca', 'Check-ins', 'Reservas', 'Miembros', 'Ocup.%', 'Score']}
            rows={data.ranked.map(r => [r.pos, r.name, r.brand, r.ci, r.rsv, r.mem, r.occPct, r.score])}
            rightAlignFrom={3}
            accent={ORANGE}
          />
          <Text style={s.noteText}>Score = check-ins×40% + reservas×30% + miembros activos×20% + % ocupación×10% (normalizado 0–100)</Text>

          <PdfFooter genAt={data.genAt} />
        </View>
        <PdfPageNumbers />
      </Page>
    </Document>
  );
}
