import { useState } from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Platform} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import { staffApi, InstructorWeeklySchedule } from '../../../app/Providers/staff/api/staff.api';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const todayStr      = () => new Date().toISOString().slice(0, 10);
const weekStartStr  = () => {
  const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10);
};
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });

type Preset = 'hoy' | 'semana' | 'mes' | 'personalizado';
type Range  = { from: string; to: string };

function getRange(preset: Preset, customFrom: string, customTo: string): Range {
  const t = todayStr();
  switch (preset) {
    case 'hoy':    return { from: t,              to: t };
    case 'semana': return { from: weekStartStr(),  to: t };
    case 'mes':    return { from: monthStartStr(), to: t };
    default:       return { from: customFrom,      to: customTo };
  }
}

function escHtml(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DAY_LABEL: Record<string, string> = {
  LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', MIÉRCOLES: 'Miércoles',
  JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', SÁBADO: 'Sábado', DOMINGO: 'Domingo',
};

// ─── HTML del reporte ─────────────────────────────────────────────────────────

function buildInstructorHtml(schedules: InstructorWeeklySchedule[], range: Range): string {
  const genAt = new Date().toLocaleDateString('es-BO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const totalEnrolled = schedules.reduce((s, c) => s + (c.enrolledCount ?? 0), 0);

  const sections = schedules.map(sch => {
    const day     = DAY_LABEL[(sch.dayOfWeek ?? '').toUpperCase()] ?? sch.dayOfWeek ?? '—';
    const time    = `${(sch.startTime ?? '').substring(0, 5)} – ${(sch.endTime ?? '').substring(0, 5)}`;
    const pct     = sch.maxCapacity > 0 ? Math.round((sch.enrolledCount / sch.maxCapacity) * 100) : 0;
    const pctColor = pct >= 90 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444';

    const attendeeRows = (sch.attendees ?? []).length === 0
      ? `<tr><td colspan="2" style="padding:8px;color:#9CA3AF;font-style:italic;">Sin alumnos inscritos.</td></tr>`
      : (sch.attendees ?? []).map((a, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
            <td style="padding:7px 10px;font-size:12px;color:#374151;">${i + 1}</td>
            <td style="padding:7px 10px;font-size:12px;color:#111827;">${escHtml(a.fullName)}</td>
          </tr>
        `).join('');

    return `
      <div style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <div style="background:#F9FAFB;padding:14px 20px;border-bottom:1px solid #E5E7EB;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:16px;font-weight:700;color:#111827;">${escHtml(sch.activityName)}</div>
              <div style="font-size:12px;color:#6B7280;margin-top:3px;">${escHtml(sch.gymName ?? '—')}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;font-weight:700;color:#FF5E00;">${day}</div>
              <div style="font-size:12px;color:#6B7280;">${time}</div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:14px 20px;border-bottom:1px solid #E5E7EB;">
          <div style="border:1px solid #E5E7EB;border-left:3px solid #FF5E00;border-radius:6px;padding:12px;">
            <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Inscritos</div>
            <div style="color:#111827;font-size:22px;font-weight:700;margin-top:4px;">${sch.enrolledCount ?? 0}</div>
          </div>
          <div style="border:1px solid #E5E7EB;border-left:3px solid #6B7280;border-radius:6px;padding:12px;">
            <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Capacidad</div>
            <div style="color:#111827;font-size:22px;font-weight:700;margin-top:4px;">${sch.maxCapacity > 0 ? sch.maxCapacity : '—'}</div>
          </div>
          <div style="border:1px solid #E5E7EB;border-left:3px solid ${pctColor};border-radius:6px;padding:12px;">
            <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Ocupación</div>
            <div style="color:${pctColor};font-size:22px;font-weight:700;margin-top:4px;">${sch.maxCapacity > 0 ? `${pct}%` : '—'}</div>
          </div>
        </div>
        <div style="padding:12px 20px 16px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#9CA3AF;margin-bottom:8px;">Alumnos inscritos</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#F3F4F6;">
                <th style="padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#9CA3AF;width:32px;">#</th>
                <th style="padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#9CA3AF;">Nombre</th>
              </tr>
            </thead>
            <tbody>${attendeeRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #111827; background: #fff; }</style>
    </head>
    <body>
      <div style="background:linear-gradient(135deg,#111827,#1f2937);padding:24px 32px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="color:#FF5E00;font-size:20px;font-weight:800;letter-spacing:-0.5px;">GYMSYNC</div>
          <div style="color:#9CA3AF;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;margin-top:3px;">Sistema de Gestión Deportiva</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#fff;font-size:16px;font-weight:700;">Reporte de Clases Grupales</div>
          <div style="color:#9CA3AF;font-size:11px;margin-top:3px;">${schedules.length} horario${schedules.length !== 1 ? 's' : ''} · ${totalEnrolled} alumnos</div>
        </div>
      </div>
      <div style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;padding:10px 32px;display:flex;gap:40px;">
        <div>
          <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Período</div>
          <div style="color:#111827;font-size:12px;font-weight:600;margin-top:2px;">${fmtDate(range.from)} — ${fmtDate(range.to)}</div>
        </div>
        <div>
          <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Generado</div>
          <div style="color:#111827;font-size:12px;font-weight:600;margin-top:2px;">${genAt}</div>
        </div>
      </div>
      <div style="padding:24px 32px 40px;">
        ${sections}
        <div style="margin-top:28px;padding-top:12px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:10px;color:#D1D5DB;">
          <span>GymSync — Sistema de Gestión Deportiva</span>
          <span>${genAt}</span>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InstructorReportScreen = () => {
  const navigation = useNavigation<any>();

  const [preset,      setPreset]      = useState<Preset>('mes');
  const [customFrom,  setCustomFrom]  = useState(monthStartStr());
  const [customTo,    setCustomTo]    = useState(todayStr());
  const [scopeAll,    setScopeAll]    = useState(true);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [generating,  setGenerating]  = useState(false);

  // ── Fetch schedules defensively ─────────────────────────────────────────────
  const { data: rawSchedules, isLoading } = useQuery({
    queryKey:  ['instructor-weekly-schedules'],
    queryFn:   () => staffApi.getMyWeeklySchedules(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const schedules: InstructorWeeklySchedule[] = Array.isArray(rawSchedules)
    ? rawSchedules
    : ((rawSchedules as any)?.data ?? []);

  const range = getRange(preset, customFrom, customTo);

  // ── Generate PDF ─────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return;

    const targets = scopeAll
      ? schedules
      : schedules.filter(s => s.id === selectedId);

    if (targets.length === 0) {
      Alert.alert(
        'Sin datos',
        scopeAll
          ? 'No tienes horarios registrados en el sistema.'
          : 'Selecciona un horario específico.',
      );
      return;
    }

    setGenerating(true);
    try {
      const html      = buildInstructorHtml(targets, range);
      const { uri }   = await Print.printToFileAsync({ html });
      const canShare  = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType:    'application/pdf',
          dialogTitle: 'Compartir Reporte de Clases',
          UTI:         'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF generado', 'El archivo se guardó en: ' + uri);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo generar el reporte.');
    } finally {
      setGenerating(false);
    }
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'hoy',          label: 'Hoy' },
    { key: 'semana',       label: 'Semana' },
    { key: 'mes',          label: 'Mes' },
    { key: 'personalizado', label: 'Personalizar' },
  ];

  const selectedSchedule = schedules.find(s => s.id === selectedId) ?? null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Generar Reporte</Text>
          <Text style={s.headerSub}>Informe de clases grupales</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Scope */}
        <Text style={s.sectionLabel}>ALCANCE DEL REPORTE</Text>
        <View style={s.row2}>
          <TouchableOpacity
            style={[s.scopeBtn, scopeAll && s.scopeBtnActive]}
            onPress={() => { setScopeAll(true); setSelectedId(null); }}
            activeOpacity={0.8}
          >
            <Text style={[s.scopeBtnTxt, scopeAll && s.scopeBtnTxtActive]}>Todos mis horarios</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.scopeBtn, !scopeAll && s.scopeBtnActive]}
            onPress={() => setScopeAll(false)}
            activeOpacity={0.8}
          >
            <Text style={[s.scopeBtnTxt, !scopeAll && s.scopeBtnTxtActive]}>Un horario específico</Text>
          </TouchableOpacity>
        </View>

        {/* Schedule picker */}
        {!scopeAll && (
          isLoading ? (
            <View style={s.loadingRow}>
              <DumbbellSpinner size="small" color="#FF5E00" />
              <Text style={s.loadingTxt}>Cargando horarios…</Text>
            </View>
          ) : schedules.length === 0 ? (
            <View style={s.placeholderBox}>
              <Text style={s.placeholderTxt}>Sin horarios registrados.</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.schedulePickerRow}
            >
              {schedules.map(sch => {
                const day   = DAY_LABEL[(sch.dayOfWeek ?? '').toUpperCase()] ?? sch.dayOfWeek ?? '?';
                const time  = (sch.startTime ?? '').substring(0, 5);
                const label = `${sch.activityName} · ${day} ${time}`;
                const active = sch.id === selectedId;
                return (
                  <TouchableOpacity
                    key={sch.id}
                    style={[s.scheduleChip, active && s.scheduleChipActive]}
                    onPress={() => setSelectedId(sch.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.scheduleChipTxt, active && s.scheduleChipTxtActive]} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )
        )}

        {/* Validation hint */}
        {!scopeAll && !selectedId && (
          <View style={s.hintBox}>
            <MaterialCommunityIcons name="information-outline" size={14} color="#FF5E00" />
            <Text style={s.hintTxt}>Selecciona un horario de la lista.</Text>
          </View>
        )}

        {/* Period */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>PERÍODO DE REPORTE</Text>
        <View style={s.presetRow}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[s.presetBtn, preset === p.key && s.presetBtnActive]}
              onPress={() => setPreset(p.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.presetBtnTxt, preset === p.key && s.presetBtnTxtActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date display / custom inputs */}
        {preset !== 'personalizado' ? (
          <View style={s.dateDisplay}>
            <MaterialCommunityIcons name="calendar-range" size={14} color="#FF5E00" />
            <Text style={s.dateDisplayTxt}>
              {fmtDate(range.from)} — {fmtDate(range.to)}
            </Text>
          </View>
        ) : (
          <View style={s.customDates}>
            <View style={s.customField}>
              <Text style={s.customLabel}>Desde</Text>
              <TextInput
                style={s.customInput}
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="AAAA-MM-DD"
                placeholderTextColor="#333"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                maxLength={10}
              />
            </View>
            <View style={s.customField}>
              <Text style={s.customLabel}>Hasta</Text>
              <TextInput
                style={s.customInput}
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="AAAA-MM-DD"
                placeholderTextColor="#333"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                maxLength={10}
              />
            </View>
          </View>
        )}

        {/* Summary info */}
        {(scopeAll || selectedId) && (
          <View style={s.summaryBox}>
            <MaterialCommunityIcons name="information-outline" size={13} color="#555" />
            <Text style={s.summaryTxt}>
              {scopeAll
                ? `${schedules.length} horario${schedules.length !== 1 ? 's' : ''} · ${schedules.reduce((a, s) => a + (s.enrolledCount ?? 0), 0)} alumnos en total`
                : selectedSchedule
                  ? `${selectedSchedule.activityName} · ${selectedSchedule.enrolledCount ?? 0} inscritos`
                  : ''}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Generate button */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.generateBtn, (generating || (!scopeAll && !selectedId)) && s.generateBtnOff]}
          onPress={handleGenerate}
          disabled={generating || (!scopeAll && !selectedId)}
          activeOpacity={0.85}
        >
          {generating ? (
            <DumbbellSpinner color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="file-pdf-box" size={18} color="#fff" />
              <Text style={s.generateBtnTxt}>Generar Reporte PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 20, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#222',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  headerSub:   { color: '#555', fontSize: 12, marginTop: 2 },

  sectionLabel: {
    color: '#555', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 10,
  },

  row2: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  scopeBtn: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 12, backgroundColor: '#111',
    borderWidth: 1, borderColor: '#222',
    alignItems: 'center',
  },
  scopeBtnActive: { backgroundColor: '#3a1800', borderColor: '#FF5E00' },
  scopeBtnTxt:       { color: '#555', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  scopeBtnTxtActive: { color: '#FF5E00', fontWeight: '700' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingTxt: { color: '#555', fontSize: 13 },

  placeholderBox: {
    backgroundColor: '#0e0e0e', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#222', marginBottom: 8,
  },
  placeholderTxt: { color: '#333', fontSize: 13 },

  schedulePickerRow: { paddingBottom: 4, gap: 8, flexDirection: 'row' },
  scheduleChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, backgroundColor: '#111',
    borderWidth: 1, borderColor: '#222',
  },
  scheduleChipActive:    { backgroundColor: '#3a1800', borderColor: '#FF5E00' },
  scheduleChipTxt:       { color: '#555', fontSize: 13, fontWeight: '600' },
  scheduleChipTxtActive: { color: '#FF5E00', fontWeight: '700' },

  hintBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#1a0a00', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FF5E0033', marginBottom: 8,
  },
  hintTxt: { color: '#FF5E00', fontSize: 12 },

  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  presetBtn: {
    flex: 1, paddingVertical: 10,
    borderRadius: 20, backgroundColor: '#111',
    borderWidth: 1, borderColor: '#222', alignItems: 'center',
  },
  presetBtnActive:    { backgroundColor: '#3a1800', borderColor: '#FF5E00' },
  presetBtnTxt:       { color: '#555', fontSize: 12, fontWeight: '600' },
  presetBtnTxtActive: { color: '#FF5E00', fontWeight: '700' },

  dateDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0e0e0e', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#222', marginBottom: 8,
  },
  dateDisplayTxt: { color: '#ccc', fontSize: 13, fontWeight: '600' },

  customDates: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  customField: { flex: 1 },
  customLabel: { color: '#555', fontSize: 11, fontWeight: '600', marginBottom: 6 },
  customInput: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    color: '#fff', fontSize: 14, fontWeight: '600',
    borderWidth: 1, borderColor: '#222',
  },

  summaryBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#0e0e0e', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#222', marginTop: 10,
  },
  summaryTxt: { color: '#555', fontSize: 12 },

  footer: {
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderTopColor: '#111',
    backgroundColor: '#000',
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF5E00', borderRadius: 16, paddingVertical: 16,
  },
  generateBtnOff: { opacity: 0.35 },
  generateBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
