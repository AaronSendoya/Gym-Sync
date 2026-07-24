import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Serie = { peso: string; reps: string };

const formatTime = (sec: number): string =>
  `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

export const WorkoutSummaryScreen = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const {
    duration_seconds = 0,
    calories_burned  = 0,
    sport            = 'DEFAULT',
    exerciseName,
    series           = [] as Serie[],
  } = route.params ?? {};

  const isStrength = sport !== 'CARDIO' && sport !== 'HIIT';

  const maxWeight = isStrength
    ? Math.max(0, ...series.map((s: Serie) => parseFloat(s.peso) || 0))
    : 0;

  const displayName = (exerciseName ?? String(sport).toUpperCase()) as string;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconCircle, { backgroundColor: '#1C1C1E' }]}>
            <MaterialCommunityIcons name="trophy-outline" size={36} color="#f05b22" />
          </View>
          <Text style={s.title}>Sesión completada</Text>
          <Text style={s.subtitle}>{displayName}</Text>
        </View>

        {/* Stats principales */}
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <MaterialCommunityIcons name="timer-outline" size={22} color="#f05b22" />
            <Text style={s.statValue}>{formatTime(duration_seconds)}</Text>
            <Text style={s.statLabel}>Tiempo total</Text>
          </View>

          <View style={s.statCard}>
            <MaterialCommunityIcons name="fire" size={22} color="#ef476f" />
            <Text style={s.statValue}>{calories_burned}</Text>
            <Text style={s.statLabel}>kcal quemadas</Text>
          </View>

          {isStrength && maxWeight > 0 && (
            <View style={[s.statCard, s.statCardWide]}>
              <MaterialCommunityIcons name="weight-lifter" size={22} color="#9b5de5" />
              <Text style={s.statValue}>{maxWeight.toFixed(0)} kg</Text>
              <Text style={s.statLabel}>Peso Máximo</Text>
            </View>
          )}
        </View>

        {/* Series (solo fuerza) */}
        {isStrength && series.length > 0 && (
          <View style={s.seriesSection}>
            <Text style={s.sectionTitle}>Series realizadas</Text>
            {series.map((ser: Serie, i: number) => (
              <View key={i} style={s.serieRow}>
                <View style={s.serieBadge}>
                  <Text style={s.serieBadgeTxt}>{i + 1}</Text>
                </View>
                <Text style={s.serieDetail}>{ser.peso} kg</Text>
                <Text style={s.serieSep}>×</Text>
                <Text style={s.serieDetail}>{ser.reps} reps</Text>
                <Text style={s.serieVol}>
                  = {((parseFloat(ser.peso) || 0) * (parseInt(ser.reps, 10) || 0)).toFixed(0)} kg vol.
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Botón fijo al fondo */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.homeBtn}
          activeOpacity={0.85}
          onPress={() => navigation.popToTop()}
        >
          <Text style={s.homeBtnTxt}>Volver al Inicio</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll:    { paddingHorizontal: 24, paddingBottom: 24 },

  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 32, gap: 12 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  title:    { color: '#fff', fontSize: 26, fontWeight: '900' },
  subtitle: { color: '#555', fontSize: 15, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#111', borderRadius: 20, borderWidth: 1, borderColor: '#1c1c1e',
    paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 8,
  },
  statCardWide: { minWidth: '100%' },
  statValue:    { color: '#fff', fontSize: 28, fontWeight: '900' },
  statLabel:    { color: '#555', fontSize: 12, textAlign: 'center' },

  seriesSection: { gap: 10 },
  sectionTitle:  { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  serieRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#1c1c1e',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  serieBadge: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#1C1C1E',
    justifyContent: 'center', alignItems: 'center',
  },
  serieBadgeTxt: { color: '#f05b22', fontSize: 12, fontWeight: '800' },
  serieDetail:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  serieSep:      { color: '#444', fontSize: 14 },
  serieVol:      { color: '#555', fontSize: 12, marginLeft: 'auto' },

  footer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 },
  homeBtn: {
    backgroundColor: '#f05b22', borderRadius: 18, height: 60,
    justifyContent: 'center', alignItems: 'center',
  },
  homeBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
