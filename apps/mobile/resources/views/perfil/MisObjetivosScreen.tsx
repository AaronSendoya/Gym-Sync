import { useState, useEffect } from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { NumericInput } from '../../../app/Shared/components/ui/NumericInput';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

type GoalType = 'perdida' | 'muscular' | 'mantenimiento';

type SavedGoal = {
  type: GoalType;
  targetValue: number;
  baselineValue: number;
};

const storageKey = (userId: number | string) => `gymsync_objetivo_${userId}`;

const CARDS: { type: GoalType; icon: string; title: string; desc: string; color: string }[] = [
  { type: 'perdida',       icon: 'trending-down', title: 'Pérdida de Peso',               desc: 'Alcanza tu peso ideal con un déficit controlado.',        color: '#f05b22' },
  { type: 'muscular',      icon: 'arm-flex',      title: 'Ganancia Muscular',              desc: 'Aumenta tu masa muscular con entrenamiento progresivo.',  color: '#00c853' },
  { type: 'mantenimiento', icon: 'scale-balance', title: 'Mantenimiento / Recomposición',  desc: 'Mantén tu peso y mejora tu composición corporal.',        color: '#2196f3' },
];

// ─── Recomendaciones por objetivo ────────────────────────────────────────────
type GoalRecommendation = {
  routine: {
    sessions: string;
    focus: string;
    exercises: { icon: string; name: string; detail: string }[];
    tips: string[];
  };
  nutrition: {
    calories: string;
    protein: string;
    foods: { icon: string; name: string }[];
    avoid: string[];
    hydration: string;
  };
};

const RECOMMENDATIONS: Record<GoalType, GoalRecommendation> = {
  perdida: {
    routine: {
      sessions: '4–5 sesiones / semana',
      focus: 'Cardio + fuerza para quemar grasa y preservar músculo',
      exercises: [
        { icon: 'run-fast',          name: 'HIIT',           detail: '20–30 min · 3×/sem' },
        { icon: 'bike',              name: 'Cardio suave',   detail: 'Bicicleta o caminata 45 min' },
        { icon: 'weight-lifter',     name: 'Fuerza',         detail: 'Circuito 3×12 · 2×/sem' },
        { icon: 'swim',              name: 'Natación',       detail: 'Opcional · 40 min' },
      ],
      tips: [
        'Descansa al menos 1 día completo por semana.',
        'Prioriza el sueño: 7–8 horas para regular el cortisol.',
        'Aumenta pasos diarios (≥ 8 000) para sumar déficit.',
      ],
    },
    nutrition: {
      calories: 'Déficit de 300–500 kcal/día',
      protein:  '1.6–2 g por kg de peso corporal',
      foods: [
        { icon: 'food-drumstick-outline', name: 'Pollo / Pavo' },
        { icon: 'fish',                   name: 'Pescado blanco' },
        { icon: 'leaf',                   name: 'Vegetales verdes' },
        { icon: 'seed-outline',           name: 'Legumbres' },
        { icon: 'egg-outline',            name: 'Claras de huevo' },
        { icon: 'fruit-citrus',           name: 'Frutas de bajo IG' },
      ],
      avoid: ['Azúcares añadidos', 'Ultraprocesados', 'Alcohol', 'Frituras'],
      hydration: '2.5–3 L de agua al día',
    },
  },
  muscular: {
    routine: {
      sessions: '4–5 sesiones / semana',
      focus: 'Hipertrofia progresiva con sobrecarga',
      exercises: [
        { icon: 'weight-lifter',  name: 'Press banca',    detail: '4×6–10 · 2×/sem' },
        { icon: 'human-handsup',  name: 'Sentadillas',    detail: '4×6–10 · 2×/sem' },
        { icon: 'arm-flex',       name: 'Peso muerto',    detail: '3×5 · 1×/sem' },
        { icon: 'human',          name: 'Dominadas',      detail: '3×8–12 · 2×/sem' },
      ],
      tips: [
        'Registra tus cargas y súbelas un 2.5–5% cada semana.',
        'Descansa 48 h antes de volver a entrenar el mismo grupo muscular.',
        'Prioriza los ejercicios compuestos sobre los aislados.',
      ],
    },
    nutrition: {
      calories: 'Superávit de 200–300 kcal/día',
      protein:  '2–2.5 g por kg de peso corporal',
      foods: [
        { icon: 'egg-outline',           name: 'Huevos enteros' },
        { icon: 'food-steak',            name: 'Carne magra' },
        { icon: 'grain',                 name: 'Arroz / Avena' },
        { icon: 'peanut-outline',        name: 'Frutos secos' },
        { icon: 'cup',                   name: 'Batido proteico' },
        { icon: 'food-apple-outline',    name: 'Frutas energéticas' },
      ],
      avoid: ['Alcohol', 'Dieta hipocalórica', 'Saltarse comidas', 'Comida basura'],
      hydration: '3–4 L de agua al día',
    },
  },
  mantenimiento: {
    routine: {
      sessions: '3–4 sesiones / semana',
      focus: 'Equilibrio entre fuerza, movilidad y bienestar',
      exercises: [
        { icon: 'yoga',           name: 'Yoga / Movilidad', detail: '30 min · 2×/sem' },
        { icon: 'weight-lifter',  name: 'Fuerza funcional', detail: '3×12 · 2×/sem' },
        { icon: 'bike',           name: 'Cardio moderado',  detail: '30 min · 2×/sem' },
        { icon: 'swim',           name: 'Natación',         detail: 'Opcional · 45 min' },
      ],
      tips: [
        'Varía los ejercicios cada 4–6 semanas para evitar estancamiento.',
        'Integra actividades que disfrutes para mantener la constancia.',
        'El manejo del estrés es clave para la recomposición corporal.',
      ],
    },
    nutrition: {
      calories: 'Calorías de mantenimiento (TDEE)',
      protein:  '1.6–2 g por kg de peso corporal',
      foods: [
        { icon: 'food-variant',      name: 'Dieta variada' },
        { icon: 'leaf',              name: 'Verduras de todo color' },
        { icon: 'grain',             name: 'Carbohidratos complejos' },
        { icon: 'food-drumstick-outline', name: 'Proteína magra' },
        { icon: 'oil',               name: 'Grasas saludables' },
        { icon: 'seed-outline',      name: 'Legumbres / Fibra' },
      ],
      avoid: ['Ultraprocesados', 'Exceso de azúcar', 'Alcohol frecuente'],
      hydration: '2–3 L de agua al día',
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function calcProgress(goal: SavedGoal, current: number): number {
  if (goal.type === 'mantenimiento') return 100;
  const { targetValue: target, baselineValue: baseline } = goal;
  if (goal.type === 'perdida') {
    if (baseline <= target) return 100;
    return clamp(0, 100, ((baseline - current) / (baseline - target)) * 100);
  }
  if (target <= baseline) return 100;
  return clamp(0, 100, ((current - baseline) / (target - baseline)) * 100);
}

// ─── Sub-componente: Recomendaciones ─────────────────────────────────────────
const RecommendationsPanel = ({ goalType, color }: { goalType: GoalType; color: string }) => {
  const rec = RECOMMENDATIONS[goalType];

  return (
    <>
      {/* ── Rutina ── */}
      <View style={[r.section, { borderColor: color + '44' }]}>
        <View style={r.sectionHeader}>
          <View style={[r.sectionIcon, { backgroundColor: color + '22' }]}>
            <MaterialCommunityIcons name="dumbbell" size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={r.sectionTitle}>Rutina Recomendada</Text>
            <Text style={r.sectionMeta}>{rec.routine.sessions}</Text>
          </View>
        </View>

        <Text style={r.focusText}>{rec.routine.focus}</Text>

        <View style={r.exerciseGrid}>
          {rec.routine.exercises.map((ex, i) => (
            <View key={i} style={r.exerciseCard}>
              <MaterialCommunityIcons name={ex.icon as any} size={22} color={color} />
              <Text style={r.exerciseName}>{ex.name}</Text>
              <Text style={r.exerciseDetail}>{ex.detail}</Text>
            </View>
          ))}
        </View>

        <View style={r.tipsBox}>
          {rec.routine.tips.map((tip, i) => (
            <View key={i} style={r.tipRow}>
              <MaterialCommunityIcons name="lightbulb-outline" size={14} color={color} />
              <Text style={r.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Nutrición ── */}
      <View style={[r.section, { borderColor: color + '44' }]}>
        <View style={r.sectionHeader}>
          <View style={[r.sectionIcon, { backgroundColor: color + '22' }]}>
            <MaterialCommunityIcons name="food-apple-outline" size={18} color={color} />
          </View>
          <Text style={r.sectionTitle}>Plan Nutricional</Text>
        </View>

        <View style={r.macroRow}>
          <View style={r.macroCard}>
            <MaterialCommunityIcons name="fire" size={16} color={color} />
            <Text style={r.macroLabel}>Calorías</Text>
            <Text style={r.macroValue}>{rec.nutrition.calories}</Text>
          </View>
          <View style={r.macroCard}>
            <MaterialCommunityIcons name="arm-flex-outline" size={16} color={color} />
            <Text style={r.macroLabel}>Proteína</Text>
            <Text style={r.macroValue}>{rec.nutrition.protein}</Text>
          </View>
        </View>

        <Text style={r.foodLabel}>Alimentos clave</Text>
        <View style={r.foodGrid}>
          {rec.nutrition.foods.map((f, i) => (
            <View key={i} style={[r.foodChip, { borderColor: color + '33' }]}>
              <MaterialCommunityIcons name={f.icon as any} size={14} color={color} />
              <Text style={r.foodName}>{f.name}</Text>
            </View>
          ))}
        </View>

        <Text style={r.foodLabel}>Evitar o reducir</Text>
        <View style={r.avoidRow}>
          {rec.nutrition.avoid.map((a, i) => (
            <View key={i} style={r.avoidChip}>
              <MaterialCommunityIcons name="close-circle-outline" size={12} color="#ff4444" />
              <Text style={r.avoidText}>{a}</Text>
            </View>
          ))}
        </View>

        <View style={[r.hydrationRow, { borderColor: color + '33' }]}>
          <MaterialCommunityIcons name="cup-water" size={18} color={color} />
          <Text style={r.hydrationText}>{rec.nutrition.hydration}</Text>
        </View>
      </View>
    </>
  );
};

// ─── Pantalla principal ───────────────────────────────────────────────────────
export const MisObjetivosScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const userId = (user as any)?.id ?? (user as any)?.userId;
  const KEY = userId ? storageKey(userId) : null;
  const pm = (user as any)?.profile?.physicalMetrics;

  const currentWeight = pm?.weightKg     ? Number(pm.weightKg)     : null;
  const currentMuscle = pm?.muscleMassKg ? Number(pm.muscleMassKg) : null;

  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [targetInput,  setTargetInput]  = useState('');
  const [savedGoal,    setSavedGoal]    = useState<SavedGoal | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!KEY) { setLoading(false); return; }
    const load = async () => {
      try {
        // Migrar clave legacy (sin userId) si existe y aún no tiene clave nueva
        const legacy = await AsyncStorage.getItem('gymsync_objetivo');
        const scoped = await AsyncStorage.getItem(KEY);
        if (legacy && !scoped) {
          await AsyncStorage.setItem(KEY, legacy);
          await AsyncStorage.removeItem('gymsync_objetivo');
          setSavedGoal(JSON.parse(legacy) as SavedGoal);
        } else if (scoped) {
          setSavedGoal(JSON.parse(scoped) as SavedGoal);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [KEY]);

  const handleSave = async () => {
    if (!selectedType || !KEY) return;
    const needsValue = selectedType !== 'mantenimiento';
    const target = parseFloat(targetInput);
    if (needsValue && (isNaN(target) || target <= 0)) {
      Alert.alert('Error', 'Ingresa un valor objetivo válido.');
      return;
    }
    const baseline = selectedType === 'muscular' ? (currentMuscle ?? 0) : (currentWeight ?? 0);
    const goal: SavedGoal = { type: selectedType, targetValue: needsValue ? target : 0, baselineValue: baseline };
    setSaving(true);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(goal));
      setSavedGoal(goal);
      setSelectedType(null);
      setTargetInput('');
    } catch {
      Alert.alert('Error', 'No se pudo guardar el objetivo.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    if (!KEY) return;
    Alert.alert('Confirmar', '¿Eliminar objetivo actual?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem(KEY);
        setSavedGoal(null);
        setSelectedType(null);
        setTargetInput('');
      }},
    ]);
  };

  if (loading) return (
    <SafeAreaView style={[s.container, s.center]}>
      <DumbbellSpinner size="large" color="#f05b22" />
    </SafeAreaView>
  );

  // ── Objetivo activo ──────────────────────────────────────────────────────────
  if (savedGoal) {
    const card     = CARDS.find(c => c.type === savedGoal.type)!;
    const current  = savedGoal.type === 'muscular' ? (currentMuscle ?? savedGoal.baselineValue) : (currentWeight ?? savedGoal.baselineValue);
    const progress = calcProgress(savedGoal, current);
    const curLbl   = savedGoal.type === 'muscular' ? 'Músculo actual' : 'Peso actual';

    return (
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Mis Objetivos</Text>
        </View>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Cabecera del objetivo ── */}
          <View style={[s.activeCard, { borderColor: card.color }]}>
            <View style={[s.activeIconBadge, { backgroundColor: card.color + '22' }]}>
              <MaterialCommunityIcons name={card.icon as any} size={32} color={card.color} />
            </View>
            <Text style={[s.activeTitle, { color: card.color }]}>{card.title}</Text>
            <Text style={s.activeDesc}>{card.desc}</Text>
          </View>

          {/* ── Estadísticas y progreso ── */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statLbl}>{curLbl}</Text>
              <Text style={[s.statVal, { color: card.color }]}>
                {current > 0 ? `${current} kg` : '—'}
              </Text>
            </View>
            {savedGoal.type !== 'mantenimiento' && (
              <View style={s.statBox}>
                <Text style={s.statLbl}>Objetivo</Text>
                <Text style={[s.statVal, { color: '#fff' }]}>{savedGoal.targetValue} kg</Text>
              </View>
            )}
          </View>

          <View style={s.progressSection}>
            <View style={s.progressHeader}>
              <Text style={s.progressLabel}>Progreso</Text>
              <Text style={[s.progressPct, { color: card.color }]}>{Math.round(progress)}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: card.color }]} />
            </View>
            {progress >= 100 && (
              <Text style={[s.goalReached, { color: card.color }]}>¡Objetivo alcanzado!</Text>
            )}
          </View>

          {current <= 0 && (
            <View style={s.warnBox}>
              <MaterialCommunityIcons name="information-outline" size={18} color="#f5a623" />
              <Text style={s.warnText}>Guarda tus métricas físicas para ver el progreso real.</Text>
            </View>
          )}

          {/* ── Recomendaciones (rutina + nutrición) ── */}
          <RecommendationsPanel goalType={savedGoal.type} color={card.color} />

          {/* ── Cambiar objetivo ── */}
          <TouchableOpacity style={s.clearBtn} onPress={handleClear} activeOpacity={0.8}>
            <MaterialCommunityIcons name="delete-outline" size={18} color="#ff4444" />
            <Text style={s.clearBtnText}>Cambiar objetivo</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Selección de objetivo ────────────────────────────────────────────────────
  const needsValue     = selectedType && selectedType !== 'mantenimiento';
  const currentForHint = selectedType === 'muscular' ? currentMuscle : currentWeight;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Mis Objetivos</Text>
      </View>
      <ScrollView contentContainerStyle={s.scrollContent}>

        <Text style={s.heading}>¿Cuál es tu objetivo?</Text>
        <Text style={s.subheading}>Elige una meta y te ayudamos a seguir tu progreso.</Text>

        {CARDS.map(card => (
          <TouchableOpacity
            key={card.type}
            style={[s.card, selectedType === card.type && { borderColor: card.color, backgroundColor: card.color + '14' }]}
            onPress={() => { setSelectedType(card.type); setTargetInput(''); }}
            activeOpacity={0.85}
          >
            <View style={[s.cardIcon, { backgroundColor: card.color + '22' }]}>
              <MaterialCommunityIcons name={card.icon as any} size={28} color={card.color} />
            </View>
            <View style={s.cardBody}>
              <Text style={[s.cardTitle, selectedType === card.type && { color: card.color }]}>{card.title}</Text>
              <Text style={s.cardDesc}>{card.desc}</Text>
            </View>
            {selectedType === card.type && (
              <MaterialCommunityIcons name="check-circle" size={22} color={card.color} />
            )}
          </TouchableOpacity>
        ))}

        {needsValue && (
          <View style={s.inputSection}>
            <Text style={s.inputLabel}>
              {selectedType === 'perdida' ? 'Peso objetivo (kg)' : 'Masa muscular objetivo (kg)'}
            </Text>
            {currentForHint != null && (
              <Text style={s.inputHint}>Actual: {currentForHint} kg</Text>
            )}
            <NumericInput
              style={s.input}
              value={targetInput}
              onChangeText={setTargetInput}
              placeholder="Ej: 70.0"
              placeholderTextColor="#555"
            />
          </View>
        )}

        {/* Vista previa de recomendaciones al seleccionar objetivo */}
        {selectedType && (
          <>
            <View style={s.previewDivider}>
              <View style={s.previewLine} />
              <Text style={s.previewLabel}>Vista previa del plan</Text>
              <View style={s.previewLine} />
            </View>
            <RecommendationsPanel
              goalType={selectedType}
              color={CARDS.find(c => c.type === selectedType)!.color}
            />
          </>
        )}

        {selectedType && (
          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnOff]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <DumbbellSpinner color="#fff" size="small" />
              : <Text style={s.saveBtnText}>Guardar Objetivo</Text>
            }
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Estilos principales ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000000' },
  center:          { justifyContent: 'center', alignItems: 'center' },
  scrollContent:   { padding: 20, paddingBottom: 80 },

  heading:         { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 6 },
  subheading:      { color: '#666', fontSize: 14, marginBottom: 28 },
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#1e1e1e', gap: 14 },
  cardIcon:        { width: 52, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardBody:        { flex: 1 },
  cardTitle:       { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 3 },
  cardDesc:        { color: '#666', fontSize: 12, lineHeight: 17 },
  inputSection:    { backgroundColor: '#111', borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e1e1e' },
  inputLabel:      { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  inputHint:       { color: '#555', fontSize: 12, marginBottom: 8 },
  input:           { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2a2a2a' },

  previewDivider:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  previewLine:     { flex: 1, height: 1, backgroundColor: '#1e1e1e' },
  previewLabel:    { color: '#444', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  saveBtn:         { backgroundColor: '#f05b22', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveBtnOff:      {},
  saveBtnText:     { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  activeCard:      { borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: 'center', marginBottom: 16, backgroundColor: '#111' },
  activeIconBadge: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  activeTitle:     { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  activeDesc:      { color: '#666', fontSize: 13, textAlign: 'center' },
  statsRow:        { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox:         { flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e' },
  statLbl:         { color: '#666', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  statVal:         { fontSize: 20, fontWeight: '900' },
  progressSection: { backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel:   { color: '#888', fontWeight: '700', fontSize: 13 },
  progressPct:     { fontWeight: '900', fontSize: 16 },
  progressTrack:   { height: 10, backgroundColor: '#1e1e1e', borderRadius: 5, overflow: 'hidden' },
  progressFill:    { height: 10, borderRadius: 5 },
  goalReached:     { marginTop: 10, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  warnBox:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a1400', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#332200', marginBottom: 16 },
  warnText:        { color: '#f5a623', fontSize: 12, flex: 1 },
  clearBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a0a0a', backgroundColor: '#110000', marginTop: 8 },
  clearBtnText:    { color: '#ff4444', fontWeight: '700', fontSize: 14 },
  topBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:         { width: 40, height: 40, backgroundColor: '#1C1C1E', borderRadius: 12, borderWidth: 1, borderColor: '#3A3A3C', justifyContent: 'center', alignItems: 'center' },
  topBarTitle:     { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
});

// ─── Estilos del panel de recomendaciones ─────────────────────────────────────
const r = StyleSheet.create({
  section:       { backgroundColor: '#0d0d0d', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sectionIcon:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionTitle:  { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  sectionMeta:   { color: '#555', fontSize: 11, marginTop: 1 },
  focusText:     { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 14 },

  exerciseGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  exerciseCard:  { width: '47%', backgroundColor: '#161616', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#1e1e1e' },
  exerciseName:  { color: '#ddd', fontSize: 12, fontWeight: '700' },
  exerciseDetail:{ color: '#555', fontSize: 11 },

  tipsBox:       { backgroundColor: '#111', borderRadius: 10, padding: 12, gap: 8 },
  tipRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipText:       { color: '#777', fontSize: 12, lineHeight: 17, flex: 1 },

  macroRow:      { flexDirection: 'row', gap: 10, marginBottom: 14 },
  macroCard:     { flex: 1, backgroundColor: '#161616', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#1e1e1e', alignItems: 'center' },
  macroLabel:    { color: '#555', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  macroValue:    { color: '#ccc', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  foodLabel:     { color: '#555', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  foodGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  foodChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#161616', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  foodName:      { color: '#aaa', fontSize: 11 },

  avoidRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  avoidChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1a0000', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#330000' },
  avoidText:     { color: '#ff4444', fontSize: 11 },

  hydrationRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#161616', borderRadius: 10, padding: 12, borderWidth: 1 },
  hydrationText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
});
