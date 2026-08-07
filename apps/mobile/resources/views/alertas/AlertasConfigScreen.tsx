import React from 'react';
import {View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Platform} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AlertasController, AlertaFrequencia } from '../../../app/Http/Controllers/alertas/AlertasController';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

const KEYWORD_TIPS: { keywords: string[]; tip: string; icon: string }[] = [
  { keywords: ['asma'],                          tip: 'Recuerda llevar tu inhalador a la sesión.',              icon: 'lungs'       },
  { keywords: ['rodilla', 'rodillas', 'menisco'], tip: 'Evita ejercicios de alto impacto en rodillas.',          icon: 'run-fast'    },
  { keywords: ['hipertensión', 'presión'],        tip: 'Monitorea tu presión arterial antes y después de entrenar.', icon: 'heart-pulse' },
  { keywords: ['diabetes', 'glucosa'],            tip: 'Ten glucosa disponible durante el entrenamiento.',        icon: 'needle'      },
  { keywords: ['corazón', 'cardíaco', 'cardiaco'], tip: 'Consulta tu médico antes de entrenamientos intensos.',  icon: 'heart'       },
  { keywords: ['columna', 'espalda', 'lumbar'],   tip: 'Mantén postura correcta. Evita cargas en flexión.',      icon: 'human'       },
];

const FRECUENCIA_OPTIONS: { value: AlertaFrequencia; label: string; desc: string }[] = [
  { value: 'AL_INICIAR', label: 'Al iniciar la app', desc: 'Recibirás alerta cada vez que abras GymSync.' },
  { value: 'ANTES_ENTRENAMIENTO', label: 'Antes de entrenar', desc: 'Alerta cuando abras una reserva o sesión.' },
  { value: 'AMBAS', label: 'Ambas', desc: 'Al iniciar y antes de cada entrenamiento.' },
];

export const AlertasConfigScreen = () => {
  const navigation          = useNavigation();
  const { user }            = useAuth();
  const medicalConditions   = (user as any)?.profile?.medicalConditions as string | undefined;
  const vm                  = AlertasController(medicalConditions);

  if (vm.isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <DumbbellSpinner size="large" color="#f05b22" />
      </View>
    );
  }

  const severidadColor = (sev: string) => {
    if (sev === 'ALTA') return '#ff4444';
    if (sev === 'MEDIA') return '#ffa726';
    return '#66bb6a';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Alertas de Salud</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Configura notificaciones automáticas basadas en tus restricciones médicas registradas.
        </Text>

        {/* Tarjeta estado médico */}
        {medicalConditions ? (
          <View style={styles.alertCard}>
            <MaterialCommunityIcons name="alert" size={32} color="#ff3333" />
            <Text style={styles.alertTitle}>Atención Médica Requerida</Text>
            <Text style={styles.alertText}>{medicalConditions}</Text>
            <Text style={styles.alertHint}>Esta información se compartirá con tu instructor por seguridad.</Text>
          </View>
        ) : (
          <View style={styles.safeCard}>
            <MaterialCommunityIcons name="check-circle" size={32} color="#00C853" />
            <Text style={styles.safeTitle}>No tienes restricciones médicas registradas.</Text>
          </View>
        )}

        {/* Global toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <MaterialCommunityIcons name="bell-ring" size={24} color="#f05b22" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.toggleLabel}>Sistema de alertas</Text>
                <Text style={styles.toggleDesc}>
                  {vm.config.globalEnabled ? 'Activado' : 'Desactivado'}
                </Text>
              </View>
            </View>
            <Switch
              value={vm.config.globalEnabled}
              onValueChange={vm.toggleGlobal}
              trackColor={{ false: '#333', true: '#f05b22' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Frecuencia */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Frecuencia de alertas</Text>
          {FRECUENCIA_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.freqOption,
                vm.config.frecuencia === opt.value && styles.freqOptionActive,
              ]}
              onPress={() => vm.setFrecuencia(opt.value)}
              activeOpacity={0.7}
            >
              <View style={styles.freqRadio}>
                {vm.config.frecuencia === opt.value && <View style={styles.freqRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.freqLabel}>{opt.label}</Text>
                <Text style={styles.freqDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lista de restricciones con toggles */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Restricciones detectadas</Text>

          {vm.alertas.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-circle" size={48} color="#66bb6a" />
              <Text style={styles.emptyText}>
                No tienes restricciones médicas registradas.
              </Text>
              <Text style={styles.emptySubtext}>
                Agrega condiciones médicas en Mis Datos Personales para activar alertas automáticas.
              </Text>
            </View>
          ) : (
            <>
              {vm.alertas.map((alerta, idx) => (
                <View key={idx} style={styles.alertaRow}>
                  <View style={styles.alertaLeft}>
                    <View
                      style={[
                        styles.severidadDot,
                        { backgroundColor: severidadColor(alerta.severidad) },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertaCondicion}>{alerta.condicion}</Text>
                      <Text style={styles.alertaSeveridad}>
                        Severidad: {alerta.severidad}
                      </Text>
                      {alerta.recomendaciones ? (
                        <Text style={styles.alertaRec} numberOfLines={2}>
                          {alerta.recomendaciones}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Switch
                    value={alerta.enabled}
                    onValueChange={() => vm.toggleAlerta(alerta.condicion)}
                    trackColor={{ false: '#333', true: '#f05b22' }}
                    thumbColor="#fff"
                  />
                </View>
              ))}

              {/* Tips por palabras clave */}
              {KEYWORD_TIPS.filter(t =>
                vm.alertasActivas.some(a =>
                  t.keywords.some(k => a.condicion.toLowerCase().includes(k))
                )
              ).map((t, i) => (
                <View key={i} style={styles.tipCard}>
                  <MaterialCommunityIcons name={t.icon as any} size={18} color="#ffa726" />
                  <Text style={styles.tipText}>{t.tip}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Vista previa del banner */}
        {vm.alertas.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vista previa</Text>
            <View style={styles.previewBanner}>
              <MaterialCommunityIcons name="alert-circle" size={24} color="#fff" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.previewTitle}>
                  Tienes {vm.alertasActivas.length} restricción(es) activa(s)
                </Text>
                <Text style={styles.previewSub}>
                  {vm.alertasAltas.length > 0
                    ? `${vm.alertasAltas.length} de severidad alta`
                    : 'Recuerda tomar precauciones'}
                </Text>
              </View>
            </View>
            <Text style={styles.previewNote}>
              Esto es lo que verás al abrir la aplicación.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:     { width: 40, height: 40, backgroundColor: '#1C1C1E', borderRadius: 12, borderWidth: 1, borderColor: '#3A3A3C', justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  freqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#1c1c1e',
    gap: 12,
  },
  freqOptionActive: {
    borderWidth: 1,
    borderColor: '#f05b22',
    backgroundColor: '#1C1C1E',
  },
  freqRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  freqRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f05b22',
  },
  freqLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  freqDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  alertaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  alertaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  severidadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  alertaCondicion: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  alertaSeveridad: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  alertaRec: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c62828',
    borderRadius: 12,
    padding: 12,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewSub: {
    color: '#FFFFFF',
    fontSize: 11,
    marginTop: 2,
  },
  previewNote: {
    color: '#666',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  alertCard: {
    backgroundColor: '#1a0000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ff3333',
    alignItems: 'center',
    gap: 10,
  },
  alertTitle: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  alertText: {
    color: '#ffaaaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  alertHint: {
    color: '#cc5555',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  safeCard: {
    backgroundColor: '#001a08',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00C853',
    alignItems: 'center',
    gap: 10,
  },
  safeTitle: {
    color: '#00C853',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1a1100',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#332500',
  },
  tipText: {
    color: '#ffa726',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
