import React, { useState, useEffect, useRef, useCallback } from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { ClientRoutine, ClientRoutineExercise } from '../../../app/Providers/staff/api/staff.api';
import { trainingApi } from '../../../app/Providers/training/api/training.api';
import { OfflineSessions } from '../../../app/Providers/offline/OfflineSessions';
import { ExerciseDetailModal } from '../../components/ExerciseDetailModal';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';


// ─── Types ────────────────────────────────────────────────────────────────────

type LogType = 'WEIGHT_REPS' | 'REPS_ONLY' | 'TIME_DISTANCE' | 'TIME_ONLY';

type SetRow = {
  setNumber:         number;
  totalSets:         number;
  repsRecommended:   string;
  weightRecommended: number;
  repsInput:         string;
  weightInput:       string;
  durationInput:     string;
  speedInput:        string;
  done:              boolean;
};

type Phase = 'detecting' | 'ready' | 'countdown' | 'active' | 'finishing';
type RouteParams = { routine: ClientRoutine; exercise: ClientRoutineExercise };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const GYM_RADIUS_KM = 0.2;

const getLogType = (ex: ClientRoutineExercise): LogType => {
  if (ex.exercise?.logType) return ex.exercise.logType;
  const cat = (ex.exercise?.category ?? '').toUpperCase();
  if (cat.includes('CARDIO')) return 'TIME_DISTANCE';
  return 'WEIGHT_REPS';
};

const buildSets = (ex: ClientRoutineExercise): SetRow[] => {
  const total  = ex.setsRecommended ?? 1;
  const reps   = String(ex.repsRecommended ?? 10);
  const weight = ex.weightRecommendedKg ?? 0;
  return Array.from({ length: total }, (_, i) => ({
    setNumber:         i + 1,
    totalSets:         total,
    repsRecommended:   reps,
    weightRecommended: weight,
    repsInput:         reps.replace(/[^0-9]/g, ''),
    weightInput:       weight > 0 ? String(weight) : '0',
    durationInput:     '0',
    speedInput:        '0',
    done:              false,
  }));
};

const fmt = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  const msPart = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
  return `${m}:${s}:${msPart}`;
};

const getExerciseCover = (imageUrl?: string | null, equipment?: string | null) => {
  if (imageUrl) return imageUrl;

  const eq = (equipment ?? '').toLowerCase();
  if (eq.includes('mancuerna')) return 'https://images.pexels.com/photos/3289711/pexels-photo-3289711.jpeg?auto=compress&cs=tinysrgb&w=600';
  if (eq.includes('barra')) return 'https://images.pexels.com/photos/949126/pexels-photo-949126.jpeg?auto=compress&cs=tinysrgb&w=600';
  if (eq.includes('polea') || eq.includes('máquina') || eq.includes('prensa')) return 'https://images.pexels.com/photos/1954524/pexels-photo-1954524.jpeg?auto=compress&cs=tinysrgb&w=600';
  if (eq.includes('cinta') || eq.includes('bicicleta') || eq.includes('cardio')) return 'https://images.pexels.com/photos/3768916/pexels-photo-3768916.jpeg?auto=compress&cs=tinysrgb&w=600';
  if (eq.includes('kettlebell') || eq.includes('pesa rusa')) return 'https://images.pexels.com/photos/221247/pexels-photo-221247.jpeg?auto=compress&cs=tinysrgb&w=600';

  return 'https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg?auto=compress&cs=tinysrgb&w=600';
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const EjecutarRutinaScreen = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const { routine, exercise } = route.params;

  const logType = getLogType(exercise);

  const [phase,     setPhase]     = useState<Phase>('detecting');
  const [gymId,     setGymId]     = useState<number | null>(null);
  const [gymLabel,  setGymLabel]  = useState<string>('Fuera de Sucursales');
  const [sessionId, setSessionId] = useState<number | null>(null);
  // Sesión offline: el servidor no respondió al iniciar — todo se registra
  // localmente y al finalizar se guarda en SQLite para sincronización posterior.
  const [offlineMode, setOfflineMode] = useState(false);
  const [sets,      setSets]      = useState<SetRow[]>(() => buildSets(exercise));
  const [cursor,    setCursor]    = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsed = Math.floor(elapsedMs / 1000);
  const [countdown,  setCountdown] = useState(3);
  const [showDetail, setShowDetail] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Descanso entre series ──
  const [restDuration, setRestDuration] = useState(exercise.restSecondsBetweenSets ?? 60);
  const [restEndTime,  setRestEndTime]  = useState<number | null>(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const restEndRef = useRef<number | null>(null);
  const isResting = restTimeLeft > 0;

  // ── GPS ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) { if (!cancelled) setPhase('ready'); return; }

        // Caché del OS (instantáneo) y fetch de sucursales en paralelo
        const [locs, cached] = await Promise.all([
          trainingApi.getGymLocations().catch(() => [] as Awaited<ReturnType<typeof trainingApi.getGymLocations>>),
          Location.getLastKnownPositionAsync().catch(() => null),
        ]);

        // Si no hay caché, pedir posición con timeout de 3 s
        let pos: Awaited<ReturnType<typeof Location.getCurrentPositionAsync>> | null = cached;
        if (!pos) {
          const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const timeout = new Promise<null>(r => setTimeout(() => r(null), 3000));
          pos = await Promise.race([fresh, timeout]);
        }

        if (!cancelled && pos) {
          let nearestId: number | null = null;
          let nearestLabel = 'Fuera de Sucursales';
          let minDist = Infinity;
          for (const loc of locs) {
            const dist = haversineKm(pos.coords.latitude, pos.coords.longitude, loc.latitude, loc.longitude);
            if (dist < minDist) {
              minDist = dist;
              if (dist <= GYM_RADIUS_KM) {
                nearestId    = loc.gymId;
                nearestLabel = loc.brandName ? `${loc.brandName} - ${loc.gymName}` : loc.gymName;
              }
            }
          }
          setGymId(nearestId);
          setGymLabel(nearestLabel);
        }
      } catch {/* sin GPS */}
      finally { if (!cancelled) setPhase('ready'); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (!restEndTime) return;
    restEndRef.current = restEndTime;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((restEndRef.current! - Date.now()) / 1000));
      if (left <= 0) {
        clearInterval(tick);
        setRestTimeLeft(0);
        setRestEndTime(null);
        restEndRef.current = null;
      } else {
        setRestTimeLeft(left);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [restEndTime]);

  const handleSkipRest = () => {
    restEndRef.current = null;
    setRestEndTime(null);
    setRestTimeLeft(0);
  };

  const adjustRest = (delta: number) =>
    setRestDuration(prev => Math.max(15, Math.min(300, prev + delta)));

  const startTimeRef = useRef<number>(0);
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 50);
  }, []);

  // ── Countdown 3-2-1 antes de iniciar ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    let count = 3;
    let cleanedUp = false;
    let beepSound: Audio.Sound | null = null;
    setCountdown(3);

    // Reproducir beep.m4a UNA sola vez al inicio del conteo
    Audio.Sound.createAsync(
      require('../../../assets/beep.m4a'),
      { shouldPlay: true, volume: 0.8 },
    ).then(({ sound }) => {
      if (cleanedUp) { sound.unloadAsync(); return; }
      beepSound = sound;
      sound.setOnPlaybackStatusUpdate(st => {
        if (st.isLoaded && st.didJustFinish) sound.unloadAsync();
      });
    }).catch(() => {});

    const tick = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(tick);
        if (!cleanedUp) {
          (async () => {
            setPhase('active');
            try {
              const session = await trainingApi.startRoutineSession({
                routineId: routine.id,
                gymId,
                sportType: (logType === 'TIME_DISTANCE' || logType === 'TIME_ONLY') ? 'CARDIO' : 'MUSCULACION',
              });
              if (session?.id) {
                setSessionId(session.id);
              } else {
                // Respuesta sin id (ej. encolada offline) → modo local
                setOfflineMode(true);
              }
            } catch {
              // Sin conexión: la sesión corre 100% local y se sincroniza después.
              setOfflineMode(true);
              Alert.alert(
                'Modo sin conexión',
                'Tu entrenamiento se guardará en el teléfono y se sincronizará automáticamente cuando vuelva el internet.',
              );
            }
            startTimer();
          })();
        }
      }
    }, 1000);

    return () => {
      cleanedUp = true;
      clearInterval(tick);
      beepSound?.stopAsync().catch(() => {});
      beepSound?.unloadAsync().catch(() => {});
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start session ────────────────────────────────────────────────────────────
  const handleStart = () => setPhase('countdown');

  // ── Serialización de un SetRow al formato del backend según logType ─────────
  const setRowToPayload = (row: SetRow) => {
    const base = {
      routineExerciseId: exercise.id,
      exerciseId:        exercise.exercise?.id ?? undefined,
      setNumber:         row.setNumber,
    };
    switch (logType) {
      case 'REPS_ONLY':
        return { ...base, repsCompleted: parseInt(row.repsInput) || 0 };
      case 'TIME_DISTANCE':
        return { ...base, durationSeconds: Math.round((parseFloat(row.durationInput) || 0) * 60), distanceMeters: Math.round((parseFloat(row.speedInput) || 0) * (parseFloat(row.durationInput) || 0) * 1000 / 60) };
      case 'TIME_ONLY':
        return { ...base, durationSeconds: Math.round((parseFloat(row.durationInput) || 0) * 60) };
      case 'WEIGHT_REPS':
      default:
        return { ...base, repsCompleted: parseInt(row.repsInput) || 0, weightUsedKg: parseFloat(row.weightInput) || 0 };
    }
  };

  // ── Complete a set ───────────────────────────────────────────────────────────
  const handleCompleteSet = async () => {
    if (!sessionId && !offlineMode) return;
    const set = sets[cursor];

    // Online: enviar el set de inmediato. Si la red cae a mitad de sesión, el
    // interceptor offline encola el POST y se sincroniza al reconectar.
    // Offline: no se envía nada — los sets viajan completos al finalizar.
    if (sessionId) {
      try {
        trainingApi.addSet(sessionId, setRowToPayload(set)).catch(() => {});
      } catch { /* nunca romper el flujo de la sesión */ }
    }

    const next = sets.map((s, i) => i === cursor ? { ...s, done: true } : s);
    setSets(next);
    const nextIdx = cursor + 1;
    if (nextIdx < next.length) {
      setCursor(nextIdx);
      if (restDuration > 0) {
        const end = Date.now() + restDuration * 1000;
        restEndRef.current = end;
        setRestEndTime(end);
        setRestTimeLeft(restDuration);
      }
    } else {
      finishSession(next, 'COMPLETED');
    }
  };

  const handleSkipSet = () => {
    const nextIdx = cursor + 1;
    if (nextIdx < sets.length) { setCursor(nextIdx); }
    else { finishSession(sets, 'PARTIAL'); }
  };

  const handleFinishEarly = () => {
    const allDone = sets.every(s => s.done);
    if (allDone) { finishSession(sets, 'COMPLETED'); return; }
    Alert.alert(
      'Ejercicio incompleto',
      'No has completado todas las series. El entrenador monitorea tu progreso.\n\n¿Estás seguro de finalizar ahora?',
      [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Finalizar de todos modos', style: 'destructive', onPress: () => finishSession(sets, 'PARTIAL') },
      ],
    );
  };

  const finishSession = async (finalSets: SetRow[], status: 'COMPLETED' | 'PARTIAL') => {
    if ((!sessionId && !offlineMode) || phase === 'finishing') return;
    setPhase('finishing');
    if (timerRef.current) clearInterval(timerRef.current);

    let savedOffline = false;

    if (sessionId) {
      // Online (o red caída a mitad: el interceptor encola el PUT)
      try { await trainingApi.finishSession(sessionId, status, elapsed); } catch {/**/}
    } else {
      // Sesión 100% offline: guardar payload completo (sesión + sets) en SQLite.
      // El SyncManager la enviará como un único POST /sessions/completed.
      try {
        const doneSets = finalSets.filter(r => r.done).map(setRowToPayload);
        // El backend rechaza sesiones vacías de < 1 min: si no hay nada que
        // guardar, no se encola (no hay progreso que perder).
        if (doneSets.length > 0 || elapsed >= 60) {
          const localId = await OfflineSessions.enqueue(
            {
              routineId:       routine.id,
              gymId:           gymId ?? undefined,
              sportType:       (logType === 'TIME_DISTANCE' || logType === 'TIME_ONLY') ? 'CARDIO' : 'MUSCULACION',
              durationSeconds: elapsed,
              sets:            doneSets,
            },
            { routineName: routine.name, exerciseName: exercise.exercise?.name ?? '' },
          );
          savedOffline = localId !== null;
        }
      } catch { /* la navegación al resumen ocurre igual */ }
    }

    navigation.replace('ResumenEjercicio', {
      status,
      label:        savedOffline
        ? 'Guardada offline'
        : status === 'COMPLETED' ? 'Completada' : 'Parcial',
      color:        savedOffline
        ? '#f59e0b'
        : status === 'COMPLETED' ? '#22c55e' : '#facc15',
      routineName:  routine.name,
      exerciseName: exercise.exercise?.name ?? 'Ejercicio',
      elapsed,
      gymLabel,
      totalSets:    finalSets.length,
      doneSets:     finalSets.filter(s => s.done).length,
    });
  };

  // ── Loading states ───────────────────────────────────────────────────────────
  if (phase === 'detecting') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <DumbbellSpinner size="large" color="#f05b22" />
          <Text style={s.infoTxt}>Detectando ubicación...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'finishing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <DumbbellSpinner size="large" color="#f05b22" />
          <Text style={s.infoTxt}>Guardando sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── COUNTDOWN phase ──────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.cdLabel}>¡Prepárate!</Text>
          <Text style={s.cdNum}>{countdown}</Text>
          <Text style={s.cdSub} numberOfLines={2}>{exercise.exercise?.name ?? 'Ejercicio'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── READY phase ──────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    const isCardio = logType === 'TIME_DISTANCE' || logType === 'TIME_ONLY';
    const coverUri = getExerciseCover(exercise.exercise?.imageUrl, exercise.exercise?.equipmentRequired);

    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle} numberOfLines={1}>{exercise.exercise?.name ?? 'Ejercicio'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.readyContent}>
          <View style={s.gymBadge}>
            <MaterialCommunityIcons
              name={gymId ? 'map-marker-check' : 'map-marker-off'}
              size={18} color={gymId ? '#22c55e' : '#888'}
            />
            <Text style={[s.gymTxt, { color: gymId ? '#22c55e' : '#888' }]}>{gymLabel}</Text>
          </View>

          <Text style={s.readyTitle}>¿Listo para entrenar?</Text>

          {/* Hero cover */}
          <View style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12, height: 200, backgroundColor: '#111' }}>
            <Image source={{ uri: coverUri }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{exercise.exercise?.name ?? '—'}</Text>
              <Text style={{ color: '#a0a0a0', fontSize: 12, fontWeight: '600', marginTop: 2 }}>{exercise.exercise?.muscleGroup ?? ''}</Text>
            </View>
          </View>

          {/* Detalle técnico */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A2C', gap: 8 }}
            activeOpacity={0.75}
            onPress={() => setShowDetail(true)}
          >
            <MaterialCommunityIcons name="information-outline" size={18} color="#FF5E00" />
            <Text style={{ flex: 1, color: '#ccc', fontSize: 14, fontWeight: '600' }}>Ver detalle técnico</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#555" />
          </TouchableOpacity>

          {/* Stats preview */}
          <View style={s.previewCard}>
            <View style={s.previewStats}>
              <View style={s.previewStat}>
                <Text style={s.previewStatVal}>{exercise.setsRecommended}</Text>
                <Text style={s.previewStatLbl}>series</Text>
              </View>
              {isCardio ? (
                <>
                  <View style={s.previewStatDiv} />
                  <View style={s.previewStat}>
                    <Text style={s.previewStatVal}>{exercise.repsRecommended}</Text>
                    <Text style={s.previewStatLbl}>tiempo/dist.</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.previewStatDiv} />
                  <View style={s.previewStat}>
                    <Text style={s.previewStatVal}>{exercise.repsRecommended}</Text>
                    <Text style={s.previewStatLbl}>reps</Text>
                  </View>
                  {(exercise.weightRecommendedKg ?? 0) > 0 && (
                    <>
                      <View style={s.previewStatDiv} />
                      <View style={s.previewStat}>
                        <Text style={s.previewStatVal}>{exercise.weightRecommendedKg} kg</Text>
                        <Text style={s.previewStatLbl}>peso rec.</Text>
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
            {exercise.notes ? <Text style={s.previewNotes}>{exercise.notes}</Text> : null}
          </View>

          <TouchableOpacity style={s.startBtn} onPress={handleStart} activeOpacity={0.85}>
            <MaterialCommunityIcons name="play-circle" size={22} color="#fff" />
            <Text style={s.startTxt}>Iniciar</Text>
          </TouchableOpacity>
        </ScrollView>

        <ExerciseDetailModal
          visible={showDetail}
          exercise={{
            name: exercise.exercise?.name ?? 'Ejercicio',
            description: exercise.exercise?.description,
            muscleGroup: exercise.exercise?.muscleGroup,
            category: exercise.exercise?.category,
            equipmentRequired: exercise.exercise?.equipmentRequired,
            imageUrl: exercise.exercise?.imageUrl,
            youtubeVideoId: exercise.exercise?.youtubeVideoId,
          }}
          onClose={() => setShowDetail(false)}
        />
      </SafeAreaView>
    );
  }

  // ── ACTIVE phase ─────────────────────────────────────────────────────────────
  const current  = sets[cursor];
  const doneSets = sets.filter(s => s.done).length;
  const progress = doneSets / sets.length;

  const updateField = (field: keyof SetRow, value: string) =>
    setSets(prev => prev.map((r, i) => i === cursor ? { ...r, [field]: value } : r));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={handleFinishEarly}>
          <MaterialCommunityIcons name="close" size={22} color="#888" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{exercise.exercise?.name ?? 'Ejercicio'}</Text>
        <Text style={s.timerTxt}>{fmt(elapsedMs)}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
      </View>
      <Text style={s.progressTxt}>{doneSets} / {sets.length} series</Text>

      <ScrollView contentContainerStyle={s.activeContent}>
        <Text style={{ color: '#888', fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginBottom: 10, paddingHorizontal: 16, marginTop: 16 }}>
          {logType === 'WEIGHT_REPS' ? 'Registra repeticiones y peso por serie.'
           : logType === 'REPS_ONLY' ? 'Registra las repeticiones completadas.'
           : logType === 'TIME_DISTANCE' ? 'Registra el tiempo y la velocidad.'
           : 'Registra el tiempo de cada serie.'}
        </Text>
        {/* Set card */}
        <View style={s.setCard}>
          <Text style={s.setCardTitle}>Serie {current.setNumber} de {current.totalSets}</Text>

          {logType === 'WEIGHT_REPS' ? (
            <View style={s.setRow}>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Repeticiones</Text>
                <Text style={s.setFieldHint}>Rec: {current.repsRecommended}</Text>
                <TextInput style={s.setInput} value={sets[cursor].repsInput} onChangeText={v => updateField('repsInput', v)} keyboardType="numeric" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Peso (kg)</Text>
                <Text style={s.setFieldHint}>Rec: {current.weightRecommended} kg</Text>
                <TextInput style={s.setInput} value={sets[cursor].weightInput} onChangeText={v => updateField('weightInput', v)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
            </View>
          ) : logType === 'REPS_ONLY' ? (
            <View style={s.setRow}>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Repeticiones</Text>
                <Text style={s.setFieldHint}>Rec: {current.repsRecommended}</Text>
                <TextInput style={s.setInput} value={sets[cursor].repsInput} onChangeText={v => updateField('repsInput', v)} keyboardType="numeric" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
            </View>
          ) : logType === 'TIME_DISTANCE' ? (
            <View style={s.setRow}>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Tiempo (min)</Text>
                <Text style={s.setFieldHint}> </Text>
                <TextInput style={s.setInput} value={sets[cursor].durationInput} onChangeText={v => updateField('durationInput', v)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Velocidad (km/h)</Text>
                <Text style={s.setFieldHint}> </Text>
                <TextInput style={s.setInput} value={sets[cursor].speedInput} onChangeText={v => updateField('speedInput', v)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
            </View>
          ) : (
            <View style={s.setRow}>
              <View style={s.setField}>
                <Text style={s.setFieldLabel}>Tiempo (min)</Text>
                <Text style={s.setFieldHint}> </Text>
                <TextInput style={s.setInput} value={sets[cursor].durationInput} onChangeText={v => updateField('durationInput', v)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#333" />
              </View>
            </View>
          )}

          {isResting ? (
            <View style={s.restBlock}>
              <Text style={s.restLabel}>DESCANSO</Text>
              <Text style={s.restTimer}>{restTimeLeft}s</Text>
              <TouchableOpacity style={s.restSkipBtn} activeOpacity={0.8} onPress={handleSkipRest}>
                <Text style={s.restSkipTxt}>Omitir Descanso</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={s.doneBtn} onPress={handleCompleteSet} activeOpacity={0.85}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                <Text style={s.doneTxt}>Serie Completada</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.skipBtn} onPress={handleSkipSet} activeOpacity={0.7}>
                <Text style={s.skipTxt}>
                  {cursor === sets.length - 1 ? 'Finalizar sin esta serie' : 'Omitir serie →'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Controles de descanso */}
          <View style={s.restControl}>
            <Text style={s.restControlLabel}>Descanso entre series</Text>
            <View style={s.restControlRow}>
              <TouchableOpacity style={s.restAdjBtn} onPress={() => adjustRest(-15)} activeOpacity={0.7}>
                <Text style={s.restAdjTxt}>-15s</Text>
              </TouchableOpacity>
              <Text style={s.restDurationTxt}>{restDuration}s</Text>
              <TouchableOpacity style={s.restAdjBtn} onPress={() => adjustRest(+15)} activeOpacity={0.7}>
                <Text style={s.restAdjTxt}>+15s</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Dots overview */}
        <View style={s.setsOverview}>
          {sets.map((st, i) => (
            <View key={i} style={[
              s.setDot,
              st.done           && s.setDotDone,
              i === cursor && !st.done && s.setDotCurrent,
            ]} />
          ))}
        </View>

        <TouchableOpacity style={s.earlyFinishBtn} onPress={handleFinishEarly} activeOpacity={0.75}>
          <Text style={s.earlyFinishTxt}>Finalizar ejercicio</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#000' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  infoTxt: { color: '#555', fontSize: 14 },

  cdLabel: { color: '#555', fontSize: 13, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  cdNum:   { color: '#f05b22', fontSize: 120, fontWeight: '900', lineHeight: 120 },
  cdSub:   { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 28, textAlign: 'center', paddingHorizontal: 40 },

  topBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  backBtn:  { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  timerTxt: { color: '#FF5E00', fontWeight: '700', fontSize: 20, minWidth: 90, textAlign: 'right' },

  progressBar:  { height: 3, backgroundColor: '#1a1a1a' },
  progressFill: { height: 3, backgroundColor: '#f05b22' },
  progressTxt:  { color: '#444', fontSize: 11, textAlign: 'right', paddingRight: 16, paddingTop: 4 },

  // READY
  readyContent: { padding: 16, paddingBottom: 100 },
  gymBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  gymTxt:       { fontSize: 13, fontWeight: '600' },
  readyTitle:   { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 16 },


  previewCard:    { backgroundColor: '#0e0e0e', borderRadius: 14, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#1a1a1a' },
  previewRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  previewExName:  { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  typeBadge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTxt:        { fontSize: 11, fontWeight: '700' },
  previewStats:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewStat:    { alignItems: 'center' },
  previewStatVal: { color: '#f05b22', fontSize: 18, fontWeight: '800' },
  previewStatLbl: { color: '#444', fontSize: 11 },
  previewStatDiv: { width: 1, height: 24, backgroundColor: '#1a1a1a' },
  previewNotes:   { color: '#444', fontSize: 12, marginTop: 10, fontStyle: 'italic' },

  startBtn: { backgroundColor: '#f05b22', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  startTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ACTIVE
  activeContent: { padding: 20, paddingBottom: 120 },
  setCard:      { backgroundColor: '#0e0e0e', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 20 },
  setCardTitle: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, textAlign: 'center' },
  setRow:       { flexDirection: 'row', gap: 16, marginBottom: 20 },
  setField:     { flex: 1, alignItems: 'center' },
  setFieldLabel:{ color: '#888', fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  setFieldHint: { color: '#333', fontSize: 10, marginBottom: 8, height: 14 },
  setInput:     { backgroundColor: '#151515', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', paddingVertical: 12, width: '100%' },

  doneBtn: { backgroundColor: '#f05b22', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 12 },
  doneTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 6 },
  skipTxt: { color: '#444', fontSize: 13 },

  setsOverview:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 24 },
  setDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1a1a1a' },
  setDotDone:    { backgroundColor: '#22c55e' },
  setDotCurrent: { backgroundColor: '#f05b22' },

  earlyFinishBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  earlyFinishTxt: { color: '#555', fontSize: 13, fontWeight: '600' },

  // ── Rest / Descanso ──
  restBlock:       { alignItems: 'center', paddingVertical: 24, gap: 8 },
  restLabel:       { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  restTimer:       { color: '#fff', fontSize: 56, fontWeight: '900' },
  restSkipBtn:     { backgroundColor: '#1C1C1E', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, marginTop: 8 },
  restSkipTxt:     { color: '#FF5E00', fontSize: 13, fontWeight: '700' },
  restControl:     { alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  restControlLabel:{ color: '#555', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  restControlRow:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  restAdjBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  restAdjTxt:      { color: '#FF5E00', fontSize: 13, fontWeight: '800' },
  restDurationTxt: { color: '#fff', fontSize: 20, fontWeight: '900', minWidth: 50, textAlign: 'center' },
});
