import { useState, useEffect } from 'react';
import {View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Platform, Keyboard, KeyboardAvoidingView, Modal, ActivityIndicator} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { NumericInput } from '../../../app/Shared/components/ui/NumericInput';
import authAxios from '../../../app/Providers/auth/authAxios';
import { calculateIMC, getIMCCategory, calculateAge } from '../../../app/Shared/utils/healthMetrics';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_ICON, getAvatarColor } from '../../../app/Shared/constants/avatars';

type ExperienceLevel = 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO';
type SavingSection   = 'basic' | 'metrics' | 'advanced' | 'medical' | null;

export const MisDatosPersonalesScreen = () => {
  const navigation                              = useNavigation();
  const { user, updateProfile, logout }          = useAuth();
  const isGerente                               = ((user as any)?.level ?? 0) === 5;
  const p                                       = (user as any)?.profile;

  const [isEditing,          setIsEditing]          = useState(false);
  const [username,           setUsername]           = useState<string>(p?.username || (user as any)?.email?.split('@')[0] || '');
  const [gender,             setGender]             = useState<string>(p?.gender   || 'Masculino');
  const [favoriteSports,     setFavoriteSports]     = useState<string>(
    Array.isArray(p?.favoriteSports) ? p.favoriteSports.join(', ') : p?.favoriteSports || ''
  );
  const [selectedAvatar,     setSelectedAvatar]     = useState<string>(p?.avatarUrl || p?.avatarIcon || DEFAULT_AVATAR_ICON);
  const [medicalConditions,  setMedicalConditions]  = useState<string>(p?.medicalConditions || '');

  const pm = (p?.physicalMetrics ?? p) as any;
  const [weightKg,           setWeightKg]           = useState<string>(String(pm?.weightKg          ?? ''));
  const [heightCm,           setHeightCm]           = useState<string>(String(pm?.heightCm          ?? ''));
  const [bodyFatPercentage,  setBodyFatPercentage]  = useState<string>(String(pm?.bodyFatPercentage ?? ''));
  const [waistCm,            setWaistCm]            = useState<string>(String(pm?.waistCm           ?? ''));
  const [chestCm,     setChestCm]     = useState<string>(String(pm?.chestCm     ?? ''));
  const [hipCm,       setHipCm]       = useState<string>(String(pm?.hipCm       ?? ''));
  const [midArmCm,    setMidArmCm]    = useState<string>(String(pm?.midArmCm    ?? ''));
  const [thighCm,     setThighCm]     = useState<string>(String(pm?.thighCm     ?? ''));
  const [calfCm,      setCalfCm]      = useState<string>(String(pm?.calfCm      ?? ''));
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [experienceLevel,    setExperienceLevel]    = useState<ExperienceLevel>(
    (pm?.experienceLevel ?? 'PRINCIPIANTE') as ExperienceLevel
  );
  const [age,                setAge]                = useState<string>(
    p?.age != null ? String(p.age) : (p?.birthDate ? String(calculateAge(p.birthDate)) : '')
  );

  // IMC reactivo (solo lectura)
  const imcResult   = calculateIMC(Number(weightKg), Number(heightCm));
  const imcCategory = getIMCCategory(imcResult);
  const imcFloat    = parseFloat(imcResult);
  const imcColor    = imcFloat >= 18.5 && imcFloat <= 24.9 ? '#00E5A3' : '#FF5E00';

  const [isKeyboardVisible,  setKeyboardVisible]    = useState(false);
  const [isFetching,         setIsFetching]         = useState(!p);
  const [savingSection,      setSavingSection]      = useState<SavingSection>(null);
  const [errors,             setErrors]             = useState<Record<string, string>>({});


  // ── Teclado ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Hidratación desde contexto ───────────────────────────────────────────────
  useEffect(() => {
    const prof: any = (user as any)?.profile;
    if (!prof) return;
    const metrics: any = prof?.physicalMetrics ?? {};
    setUsername(prof.username || (user as any)?.email?.split('@')[0] || '');
    setGender(prof.gender || 'Masculino');
    setSelectedAvatar(prof.avatarUrl || prof.avatarIcon || DEFAULT_AVATAR_ICON);
    setFavoriteSports(
      Array.isArray(prof.favoriteSports) ? prof.favoriteSports.join(', ') : prof.favoriteSports || ''
    );
    setMedicalConditions(prof.medicalConditions || '');
    setWeightKg(String(metrics.weightKg          ?? ''));
    setHeightCm(String(metrics.heightCm          ?? ''));
    setBodyFatPercentage(String(metrics.bodyFatPercentage ?? ''));
    setWaistCm(String(metrics.waistCm            ?? ''));
    setChestCm(String(metrics.chestCm            ?? ''));
    setHipCm(String(metrics.hipCm                ?? ''));
    setMidArmCm(String(metrics.midArmCm          ?? ''));
    setThighCm(String(metrics.thighCm            ?? ''));
    setCalfCm(String(metrics.calfCm              ?? ''));
    setExperienceLevel((metrics.experienceLevel  ?? 'PRINCIPIANTE') as ExperienceLevel);
    const serverAge = prof.age ?? metrics.age;
    if (serverAge != null) setAge(String(serverAge));
  }, [user]);

  // ── Hidratación desde GET /api/auth/me ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const res = await authAxios.get('/api/auth/me');
        if (cancelled) return;
        const data: any    = res.data?.data ?? res.data;
        const prof: any    = data?.profile ?? {};
        const metrics: any = prof?.physicalMetrics ?? {};
        setUsername(prof.username || data?.email?.split('@')[0] || '');
        setGender(prof.gender || 'Masculino');
        setSelectedAvatar(prof.avatarUrl || prof.avatarIcon || DEFAULT_AVATAR_ICON);
        setFavoriteSports(
          Array.isArray(prof.favoriteSports) ? prof.favoriteSports.join(', ') : prof.favoriteSports || ''
        );
        setMedicalConditions(prof.medicalConditions || '');
        setWeightKg(String(metrics.weightKg          ?? ''));
        setHeightCm(String(metrics.heightCm          ?? ''));
        setBodyFatPercentage(String(metrics.bodyFatPercentage ?? ''));
        setWaistCm(String(metrics.waistCm            ?? ''));
        setChestCm(String(metrics.chestCm            ?? ''));
        setHipCm(String(metrics.hipCm                ?? ''));
        setMidArmCm(String(metrics.midArmCm          ?? ''));
        setThighCm(String(metrics.thighCm            ?? ''));
        setCalfCm(String(metrics.calfCm              ?? ''));
        setExperienceLevel((metrics.experienceLevel  ?? 'PRINCIPIANTE') as ExperienceLevel);
        const serverAge = prof.age ?? metrics.age;
    if (serverAge != null) setAge(String(serverAge));
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) return; // manejado por axios401Guard
        if (status === 404) {
          Alert.alert('Sesión expirada', 'Tu sesión ya no es válida. Inicia sesión de nuevo.', [
            { text: 'OK', onPress: () => logout() },
          ]);
        }
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch específico de métricas (endpoints dedicados) ───────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchMetrics = async () => {
      try {
        const [profileRes, metricsRes] = await Promise.allSettled([
          authAxios.get('/api/users/me'),
          authAxios.get('/api/users/me/metrics/latest'),
        ]);

        if (cancelled) return;

        // 1. Peso y circunferencias vienen de /metrics/latest
        if (metricsRes.status === 'fulfilled') {
          const m = metricsRes.value.data?.data ?? metricsRes.value.data;
          if (m?.weightKg  != null) setWeightKg(m.weightKg.toString());
          if (m?.waistCm   != null) setWaistCm(m.waistCm.toString());
          if (m?.chestCm   != null) setChestCm(m.chestCm.toString());
          if (m?.hipCm     != null) setHipCm(m.hipCm.toString());
          if (m?.midArmCm  != null) setMidArmCm(m.midArmCm.toString());
          if (m?.thighCm   != null) setThighCm(m.thighCm.toString());
          if (m?.calfCm    != null) setCalfCm(m.calfCm.toString());
        }

        // 2. Altura y edad vienen de /users/me
        if (profileRes.status === 'fulfilled') {
          const raw     = profileRes.value.data?.data ?? profileRes.value.data;
          const profile = raw?.profile ?? raw;
          if (profile?.heightCm != null) setHeightCm(profile.heightCm.toString());
          const serverAge = profile?.age ?? raw?.age;
          if (serverAge != null) setAge(String(serverAge));
        }
      } catch {
        // silencioso — los datos del auth/me ya hidrataron el estado
      }
    };
    fetchMetrics();
    return () => { cancelled = true; };
  }, []);

  // ── PATCH helper ─────────────────────────────────────────────────────────────
  const patchProfile = async (payload: Record<string, unknown>) => {
    const res = await authAxios.patch('/api/users/me/profile', payload);
    return res.data?.data ?? res.data;
  };

  const handleApiError = (err: any) => {
    const status = err?.response?.status;
    if (status === 401) return; // manejado por axios401Guard
    const msg = err?.response?.data?.message ?? 'No se pudo guardar.';
    Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
  };

  // ── Guardar info básica ───────────────────────────────────────────────────────
  const handleSaveBasicInfo = async () => {
    const sportsArray = favoriteSports.split(',').map(s => s.trim()).filter(Boolean);
    setSavingSection('basic');
    try {
      await patchProfile({ gender, username, favoriteSports: sportsArray, avatarUrl: selectedAvatar });
      updateProfile({ gender, username, favoriteSports: sportsArray as any, avatarUrl: selectedAvatar });
      setIsEditing(false);
      Alert.alert('Guardado', 'Información básica actualizada.');
    } catch (err: any) {
      handleApiError(err);
    } finally {
      setSavingSection(null);
    }
  };

  // ── Guardar métricas ─────────────────────────────────────────────────────────
  const handleSaveMetrics = async () => {
    const parsedWeight = parseFloat(weightKg);
    const parsedHeight = parseInt(heightCm, 10);
    const newErrors: Record<string, string> = {};

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      newErrors.weight = 'Solo números permitidos';
    }
    if (isNaN(parsedHeight) || parsedHeight <= 0) {
      newErrors.height = 'Solo números permitidos';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSavingSection('metrics');
    try {
      // POST al endpoint dedicado de métricas con números estrictos
      await authAxios.post('/api/users/me/metrics', {
        weightKg: parsedWeight,
        heightCm: parsedHeight,
      });

      const parsedAge = parseInt(age, 10);
      if (parsedAge > 0) {
        await patchProfile({ age: parsedAge }).catch(() => null);
      }

      updateProfile({
        age: parsedAge > 0 ? parsedAge : undefined,
        physicalMetrics: {
          weightKg: parsedWeight,
          heightCm: parsedHeight,
        }
      });

      // Solo apaga edición si el servidor respondió OK — sin limpiar valores
      setIsEditing(false);
      Alert.alert('Éxito', 'Métricas actualizadas correctamente.');
    } catch (err: any) {
      handleApiError(err);
      // isEditing permanece true — el usuario puede corregir y reintentar
    } finally {
      setSavingSection(null);
    }
  };

  // ── Guardar métricas avanzadas (circunferencias) ─────────────────────────────
  const handleSaveAdvancedMetrics = async () => {
    const toNum = (v: string) => { const n = parseFloat(v); return isNaN(n) || n <= 0 ? undefined : n; };
    setSavingSection('advanced');
    try {
      await authAxios.patch('/api/users/me/metrics/circumferences', {
        waistCm:  toNum(waistCm),
        hipCm:    toNum(hipCm),
        chestCm:  toNum(chestCm),
        midArmCm: toNum(midArmCm),
        thighCm:  toNum(thighCm),
        calfCm:   toNum(calfCm),
      });
      setIsEditing(false);
      Alert.alert('Éxito', 'Circunferencias actualizadas correctamente.');
    } catch (err: any) {
      handleApiError(err);
    } finally {
      setSavingSection(null);
    }
  };

  // ── Guardar condiciones médicas ───────────────────────────────────────────────
  const handleSaveMedical = async () => {
    setSavingSection('medical');
    try {
      await patchProfile({ medicalConditions });
      updateProfile({ medicalConditions });
      Alert.alert('Guardado', 'Condiciones médicas actualizadas.');
    } catch (err: any) {
      handleApiError(err);
    } finally {
      setSavingSection(null);
    }
  };

  // ── Loading inicial ───────────────────────────────────────────────────────────
  if (isFetching) {
    return (
      <SafeAreaView style={[s.container, s.centered]} edges={['top', 'bottom']}>
        <DumbbellSpinner size="large" color="#f05b22" />
        <Text style={s.loadingText}>Cargando perfil...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Mis Datos Personales</Text>
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => setIsEditing(prev => !prev)}
          disabled={savingSection !== null}
        >
          <MaterialCommunityIcons name={isEditing ? 'close' : 'pencil-outline'} size={22} color="#FF5E00" />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

          {/* ── Información Básica ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Información Básica</Text>
              {isEditing && Platform.OS === 'ios' && isKeyboardVisible && (
                <TouchableOpacity style={s.dismissBtn} onPress={() => Keyboard.dismiss()}>
                  <Text style={s.dismissBtnText}>LISTO</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Avatar */}
            {isEditing ? (
              <>
                <Text style={s.label}>Avatar</Text>
                <View style={s.avatarGrid}>
                  {AVATAR_OPTIONS.map((av) => (
                    <TouchableOpacity
                      key={av.id}
                      style={[s.avatarOption, selectedAvatar === av.icon && s.avatarSelected]}
                      onPress={() => setSelectedAvatar(av.icon)}
                    >
                      <MaterialCommunityIcons
                        name={av.icon as any}
                        size={28}
                        color={av.color}
                        style={{ opacity: selectedAvatar === av.icon ? 1 : 0.55 }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={s.avatarReadWrap}>
                <View style={s.avatarReadBadge}>
                  <MaterialCommunityIcons
                    name={(selectedAvatar || DEFAULT_AVATAR_ICON) as any}
                    size={48}
                    color={getAvatarColor(selectedAvatar)}
                  />
                </View>
              </View>
            )}

            {/* Nombre */}
            <View style={s.field}>
              <Text style={s.label}>Nombre de Usuario</Text>
              {isEditing
                ? <TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="Tu nombre de usuario" placeholderTextColor="#B0B0B0" />
                : <Text style={s.readValue}>{username || '—'}</Text>
              }
            </View>

            {/* Género */}
            <View style={s.field}>
              <Text style={s.label}>Género</Text>
              {isEditing ? (
                <View style={s.genderRow}>
                  {['Masculino', 'Femenino', 'Otro'].map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.genderBtn, gender === g && s.genderBtnActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[s.genderBtnText, gender === g && s.genderBtnTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={s.readValue}>{gender || '—'}</Text>
              )}
            </View>

            {/* Deportes */}
            <View style={s.field}>
              <Text style={s.label}>Deportes Favoritos</Text>
              {isEditing
                ? <TextInput
                    style={[s.input, s.textArea]}
                    value={favoriteSports}
                    onChangeText={setFavoriteSports}
                    placeholder="Ej: Calistenia, Natación, Yoga"
                    placeholderTextColor="#B0B0B0"
                    multiline
                    numberOfLines={3}
                  />
                : <Text style={s.readValue}>{favoriteSports || '—'}</Text>
              }
            </View>

            {isEditing && (
              <TouchableOpacity
                style={[s.saveBtn, savingSection === 'basic' && s.saveBtnOff]}
                onPress={handleSaveBasicInfo}
                disabled={savingSection !== null}
                activeOpacity={0.85}
              >
                {savingSection === 'basic'
                  ? <DumbbellSpinner color="#fff" size="small" />
                  : <Text style={s.saveBtnText}>Guardar Info Básica</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {/* ── Métricas Físicas — solo clientes ── */}
          {!isGerente && (
            <View style={s.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <MaterialCommunityIcons name="chart-bar" size={15} color="#B0B0B0" />
                <Text style={s.sectionTitle}>Métricas Físicas</Text>
              </View>

              {/* Fila 1: Peso + Altura */}
              <View style={s.metricsRow}>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>PESO (kg)</Text>
                  {isEditing
                    ? <>
                        <NumericInput 
                          style={[s.input, errors.weight && { borderColor: '#FF3B30' }]} 
                          value={weightKg} 
                          onChangeText={(v) => { setWeightKg(v); if(errors.weight) setErrors(e => ({...e, weight: ''})); }} 
                          placeholder="0.0" 
                          placeholderTextColor="#B0B0B0" 
                          keyboardType="decimal-pad" 
                        />
                        {!!errors.weight && <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4 }}>{errors.weight}</Text>}
                      </>
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{weightKg || '—'}</Text></View>
                  }
                </View>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>ALTURA (cm)</Text>
                  {isEditing
                    ? <>
                        <NumericInput 
                          style={[s.input, errors.height && { borderColor: '#FF3B30' }]} 
                          value={heightCm} 
                          onChangeText={(v) => { setHeightCm(v); if(errors.height) setErrors(e => ({...e, height: ''})); }} 
                          placeholder="0" 
                          placeholderTextColor="#B0B0B0" 
                          keyboardType="numeric" 
                        />
                        {!!errors.height && <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4 }}>{errors.height}</Text>}
                      </>
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{heightCm || '—'}</Text></View>
                  }
                </View>
              </View>

              {/* Fila 2: Edad + IMC */}
              <View style={s.metricsRow}>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>EDAD</Text>
                  {isEditing ? (
                    <TextInput
                      style={[s.input, { textAlign: 'center', fontSize: 18, fontWeight: '700' }]}
                      value={age}
                      onChangeText={v => setAge(v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                      maxLength={3}
                      placeholder="Ej: 25"
                      placeholderTextColor="#555"
                    />
                  ) : (
                    <View style={s.metricCard}>
                      <Text style={s.metricCardValue}>{age || '-'}</Text>
                    </View>
                  )}
                </View>

                {/* IMC — solo lectura */}
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>IMC</Text>
                  <View style={[s.metricCard, { opacity: 0.9 }]}>
                    <Text style={[s.metricCardValue, { color: imcColor }]}>{imcResult}</Text>
                    <Text style={[s.imcCategory, { color: imcColor }]}>{imcCategory}</Text>
                  </View>
                </View>
              </View>

              {isEditing && (
                <TouchableOpacity
                  style={[s.saveBtn, savingSection === 'metrics' && s.saveBtnOff]}
                  onPress={handleSaveMetrics}
                  disabled={savingSection !== null}
                  activeOpacity={0.85}
                >
                  {savingSection === 'metrics'
                    ? <DumbbellSpinner color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>Guardar Métricas</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Métricas Físicas Avanzadas — solo clientes ── */}
          {!isGerente && (
            <View style={s.section}>
              {/* Header: título + botón de info */}
              <View style={s.advHeader}>
                <View style={s.advTitleRow}>
                  <MaterialCommunityIcons name="tape-measure" size={15} color="#B0B0B0" />
                  <Text style={s.sectionTitle}>Métricas Físicas Avanzadas</Text>
                </View>
                <TouchableOpacity onPress={() => setShowInfoModal(true)} style={s.infoBtn}>
                  <MaterialCommunityIcons name="information-outline" size={20} color="#555" />
                </TouchableOpacity>
              </View>
              <Text style={s.advSubtitle}>Circunferencias corporales · en centímetros (cm)</Text>

              {/* Fila 1: Cintura + Cadera */}
              <View style={s.metricsRow}>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>CINTURA</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={waistCm} onChangeText={setWaistCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{waistCm || '—'}</Text>{!!waistCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>CADERA</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={hipCm} onChangeText={setHipCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{hipCm || '—'}</Text>{!!hipCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
              </View>

              {/* Fila 2: Pecho/Busto + Brazo Medio */}
              <View style={s.metricsRow}>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>PECHO / BUSTO</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={chestCm} onChangeText={setChestCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{chestCm || '—'}</Text>{!!chestCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>BRAZO MEDIO</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={midArmCm} onChangeText={setMidArmCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{midArmCm || '—'}</Text>{!!midArmCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
              </View>

              {/* Fila 3: Muslo/Pierna + Pantorrilla */}
              <View style={s.metricsRow}>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>MUSLO / PIERNA</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={thighCm} onChangeText={setThighCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{thighCm || '—'}</Text>{!!thighCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
                <View style={[s.field, s.metricHalf]}>
                  <Text style={s.label}>PANTORRILLA</Text>
                  {isEditing
                    ? <NumericInput style={s.input} value={calfCm} onChangeText={setCalfCm} placeholder="0.0" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
                    : <View style={s.metricCard}><Text style={s.metricCardValue}>{calfCm || '—'}</Text>{!!calfCm && <Text style={s.imcCategory}>cm</Text>}</View>
                  }
                </View>
              </View>

              {isEditing && (
                <TouchableOpacity
                  style={[s.saveBtn, savingSection === 'advanced' && s.saveBtnOff]}
                  onPress={handleSaveAdvancedMetrics}
                  disabled={savingSection !== null}
                  activeOpacity={0.85}
                >
                  {savingSection === 'advanced'
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>Guardar Métricas Avanzadas</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Modal de fecha eliminado — ahora se usa input directo de edad */}

          {/* ── Condiciones Médicas ── */}
          <View style={s.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <MaterialCommunityIcons name="medical-bag" size={15} color="#B0B0B0" />
              <Text style={s.sectionTitle}>Condiciones Médicas</Text>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Lesiones o condiciones de salud</Text>
              {isEditing
                ? <TextInput
                    style={[s.input, s.textArea]}
                    value={medicalConditions}
                    onChangeText={setMedicalConditions}
                    placeholder="Ej: Asma, lesión de rodilla, hipertensión..."
                    placeholderTextColor="#B0B0B0"
                    multiline
                    numberOfLines={4}
                  />
                : <Text style={s.readValue}>{medicalConditions || '—'}</Text>
              }
            </View>
            {isEditing && (
              <TouchableOpacity
                style={[s.saveBtn, savingSection === 'medical' && s.saveBtnOff]}
                onPress={handleSaveMedical}
                disabled={savingSection !== null}
                activeOpacity={0.85}
              >
                {savingSection === 'medical'
                  ? <DumbbellSpinner color="#fff" size="small" />
                  : <Text style={s.saveBtnText}>Guardar Info Médica</Text>
                }
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal: cómo medir circunferencias ── */}
      <Modal visible={showInfoModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={s.modalTitle}>Cómo medir tus circunferencias</Text>
              <TouchableOpacity onPress={() => setShowInfoModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#888" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={s.infoText}>
                Para obtener datos precisos, utiliza una cinta métrica flexible y sigue estas reglas generales:
              </Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Postura:</Text> Mantente de pie, relajado y con los músculos sin contraer.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Cinta:</Text> Colócala paralela al suelo, sin apretar la piel ni dejar que se hunda.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Respiración:</Text> Realiza la medición tras exhalar suavemente.</Text>

              <Text style={[s.infoBold, { color: '#FF5E00', marginTop: 12, marginBottom: 6 }]}>Puntos clave de medición</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Cintura:</Text> Mide en el punto medio entre la última costilla y la parte superior de la cadera (generalmente a la altura del ombligo).</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Cadera:</Text> Mide en la parte más ancha de los glúteos.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Pecho / Busto:</Text> Pasa la cinta por la parte más prominente del pecho, justo debajo de las axilas.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Brazo:</Text> Mide el punto medio entre el hombro y el codo, con el brazo relajado a un lado del cuerpo.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Muslo:</Text> Mide el punto medio entre la cadera y la rodilla, apoyando el peso en la otra pierna.</Text>
              <Text style={s.infoBullet}><Text style={s.infoBold}>Pantorrilla:</Text> Mide la circunferencia más ancha de la pantorrilla, con el pie apoyado en el suelo.</Text>
            </ScrollView>
            <TouchableOpacity style={[s.saveBtn, { alignSelf: 'stretch', marginTop: 12 }]} onPress={() => setShowInfoModal(false)}>
              <Text style={s.saveBtnText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0A0A0A' },
  centered:           { justifyContent: 'center', alignItems: 'center' },
  loadingText:        { color: '#B0B0B0', marginTop: 12, fontSize: 14 },
  topBar:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:            { width: 40, height: 40, backgroundColor: '#1C1C1E', borderRadius: 12, borderWidth: 1, borderColor: '#3A3A3C', justifyContent: 'center', alignItems: 'center' },
  topBarTitle:        { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  editBtn:            { padding: 8 },
  scrollContent:      { padding: 20, paddingBottom: 100 },

  // ── Secciones
  section:            { marginBottom: 28, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#3A3A3C' },
  sectionHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sectionTitle:       { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },

  // ── Read mode
  readValue:          { color: '#FFFFFF', fontSize: 16, paddingVertical: 4 },
  avatarReadWrap:     { alignItems: 'center', marginBottom: 20 },
  avatarReadBadge:    { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  metricsReadGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  metricCard:         { flex: 1, backgroundColor: '#0A0A0A', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  metricCardEditable: { borderColor: '#FF5E00' },
  metricCardLabel:    { color: '#B0B0B0', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  metricCardValue:    { color: '#FF5E00', fontSize: 22, fontWeight: '900' },
  imcCategory:        { fontSize: 11, fontWeight: '700', marginTop: 4 },

  // ── Modal fecha ──
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalBox:           { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: '#3A3A3C', gap: 12 },
  modalTitle:         { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalHint:          { color: '#555', fontSize: 12 },
  modalInput:         { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#3A3A3C' },
  modalActions:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel:        { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3C', alignItems: 'center' },
  modalCancelTxt:     { color: '#888', fontWeight: '600' },
  modalConfirm:       { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FF5E00', alignItems: 'center' },
  modalConfirmTxt:    { color: '#fff', fontWeight: '700' },

  // ── Edit mode — campos
  field:              { marginBottom: 16 },
  label:              { color: '#B0B0B0', fontSize: 13, marginBottom: 8, fontWeight: '600' },
  input:              { backgroundColor: '#0A0A0A', borderRadius: 12, padding: 15, color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: '#3A3A3C' },
  textArea:           { height: 90, textAlignVertical: 'top' },

  // ── Avatar grid
  avatarGrid:         { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  avatarOption:       { width: '30%', aspectRatio: 1, backgroundColor: '#0A0A0A', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#3A3A3C' },
  avatarSelected:     { borderColor: '#FF5E00', backgroundColor: '#1C1C1E' },

  // ── Género
  genderRow:          { flexDirection: 'row', justifyContent: 'space-between' },
  genderBtn:          { flex: 1, backgroundColor: '#0A0A0A', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#3A3A3C' },
  genderBtnActive:    { backgroundColor: '#FF5E00', borderColor: '#FF5E00' },
  genderBtnText:      { color: '#B0B0B0', fontWeight: '600', fontSize: 13 },
  genderBtnTextActive:{ color: '#FFFFFF' },

  // ── Métricas edit
  metricsRow:         { flexDirection: 'row', gap: 10 },
  metricHalf:         { flex: 1 },
  radioRow:           { flexDirection: 'row', gap: 8 },
  radioItem:          { flex: 1, backgroundColor: '#0A0A0A', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  radioItemActive:    { backgroundColor: '#FF5E00', borderColor: '#FF5E00' },
  radioText:          { color: '#B0B0B0', fontSize: 11, fontWeight: 'bold' },
  radioTextActive:    { color: '#FFFFFF' },

  // ── Botones de guardar
  saveBtn:            { alignSelf: 'flex-end', backgroundColor: '#FF5E00', paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10, marginTop: 10, minWidth: 44, alignItems: 'center' },
  saveBtnOff:         {},
  saveBtnText:        { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },

  // ── Keyboard dismiss (iOS)
  dismissBtn:         { backgroundColor: '#1C1C1E', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#3A3A3C' },
  dismissBtnText:     { color: '#FF5E00', fontSize: 12, fontWeight: 'bold' },

  // ── Métricas Avanzadas
  advHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  advTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  advSubtitle:  { color: '#555', fontSize: 11, marginBottom: 16, marginTop: 2 },
  infoBtn:      { padding: 4 },

  // ── Modal de información
  infoText:   { color: '#B0B0B0', fontSize: 13, lineHeight: 20, marginBottom: 10 },
  infoBullet: { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 6 },
  infoBold:   { color: '#fff', fontWeight: '700' },
});
