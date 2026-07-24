import React, { useState, useEffect } from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable, Alert, Image} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PerfilStackParamList } from '../../../routes/PerfilStack';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import authAxios from '../../../app/Providers/auth/authAxios';

type NavigationProp = NativeStackNavigationProp<PerfilStackParamList, 'Menu'>;

type MenuItem = {
  icon: string;
  label: string;
  description?: string;
  action: () => void;
  premium?: boolean;
  personalized?: boolean;
};

const formatRoleName = (role?: string) => {
  if (!role) return 'Usuario';
  if (role.toUpperCase() === 'CLIENTE' || role.toUpperCase() === 'USER') return 'Cliente';
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const AVATARS = [
  { id: '1', icon: 'face-man-profile',   image: require('../../../assets/avatarman.png')        },
  { id: '2', icon: 'face-woman-profile',  image: require('../../../assets/avatarwoman.png')     },
  { id: '3', icon: 'robot-outline',       image: require('../../../assets/avatarrobot.png')     },
  { id: '4', icon: 'incognito',           image: require('../../../assets/avatarincognito.png') },
  { id: '5', icon: 'alien-outline',       image: require('../../../assets/avataralien.png')     },
  { id: '6', icon: 'cat',                image: require('../../../assets/avatarcat.png')        },
  { id: '7', icon: 'fire',               image: require('../../../assets/avatarfire.png')       },
  { id: '8', icon: 'crown',              image: require('../../../assets/avatarcrown.png')      },
  { id: '9', icon: 'star',               image: require('../../../assets/avatarstar.png')       },
];

export const PerfilMenuScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, updateProfile } = useAuth();

  const userLevel        = (user as any)?.level ?? 0;
  const isGerente        = userLevel >= 4;
  const isStaffOperativo = !isGerente && userLevel >= 2;
  const isCliente        = !isGerente && !isStaffOperativo;
  const p           = (user as any)?.profile;
  const displayName = p?.username || (user as any)?.email?.split('@')[0] || 'Sin usuario';

  const [localAvatar,   setLocalAvatar]   = useState<string>(p?.avatarUrl || p?.avatarIcon || 'face-man-profile');
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    const synced = p?.avatarUrl || p?.avatarIcon || 'face-man-profile';
    setLocalAvatar(synced);
  }, [p?.avatarUrl, p?.avatarIcon]);

  const handleAvatarSelect = async (icon: string) => {
    const prev = localAvatar;
    setLocalAvatar(icon);
    setPickerVisible(false);
    try {
      await authAxios.patch('/api/users/me/profile', { avatarUrl: icon });
      updateProfile({ avatarUrl: icon });
    } catch {
      setLocalAvatar(prev);
      Alert.alert('Error', 'No se pudo guardar el avatar.');
    }
  };

  const userMenuItems: MenuItem[] = [
    {
      icon: 'account', label: 'Mis datos personales',
      description: 'Actualiza tu información personal, contacto y avatar',
      action: () => navigation.navigate('DatosPersonales'),
    },
    ...(isCliente ? [
      {
        icon: 'chart-line', label: 'Mi historial físico',
        description: 'Consulta tu evolución física, métricas y progreso registrado',
        action: () => navigation.navigate('CuadroDeMando' as any),
      },
      {
        icon: 'trophy', label: 'Mis objetivos',
        description: 'Define y monitorea tus metas de entrenamiento y salud',
        action: () => navigation.navigate('MisObjetivos' as any),
      },
      {
        icon: 'dumbbell', label: 'Mi Rutina',
        description: 'Tu programa de ejercicios diseñado por tu entrenador',
        action: () => navigation.navigate('MiRutina' as any), personalized: true,
      },
      {
        icon: 'food-apple-outline', label: 'Mi Plan Nutricional',
        description: 'Tu plan de alimentación personalizado por tu asesor',
        action: () => navigation.navigate('MiPlan' as any), personalized: true,
      },
      {
        icon: 'card-account-details-outline', label: 'Mi Membresía',
        description: 'Tu plan vigente, fecha de inscripción y vencimiento',
        action: () => navigation.navigate('MiMembresia' as any),
      },
    ] : []),
    {
      icon: 'bell-ring', label: 'Alertas de salud',
      description: 'Configura recordatorios y notificaciones de bienestar',
      action: () => navigation.navigate('AlertasConfig'),
    },
    ...(isStaffOperativo ? [{
      icon: 'card-account-details-outline', label: 'Mi Carnet Digital',
      description: 'Tu credencial digital para acceder al gimnasio',
      action: () => navigation.navigate('CarnetDigital' as any), premium: true,
    }] : []),
    {
      icon: 'cog-outline', label: 'Ajustes',
      description: 'Preferencias de la app, privacidad y notificaciones',
      action: () => navigation.navigate('Ajustes' as any),
    },
  ];

  const gerenteMenuItems: MenuItem[] = [
    {
      icon: 'account', label: 'Mis datos personales',
      description: 'Actualiza tu información personal y datos de acceso',
      action: () => navigation.navigate('DatosPersonales'),
    },
    {
      icon: 'shield-check-outline', label: 'Auditoría de Sucursal',
      description: 'Revisa registros de acceso y actividad operativa de tu sucursal',
      action: () => navigation.navigate('AuditoriaSucursal' as any), premium: true,
    },
    {
      icon: 'bell-ring', label: 'Alertas de salud',
      description: 'Configura recordatorios y notificaciones de bienestar',
      action: () => navigation.navigate('AlertasConfig'),
    },
    {
      icon: 'cog-outline', label: 'Ajustes',
      description: 'Preferencias de la app, privacidad y notificaciones',
      action: () => navigation.navigate('Ajustes' as any),
    },
  ];

  const menuItems = isGerente ? gerenteMenuItems : userMenuItems;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Header ── */}
        <View style={styles.header}>

          {/* Avatar — toca para abrir picker */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Image
              source={AVATARS.find(av => av.icon === localAvatar)?.image ?? AVATARS[0].image}
              style={{ width: 60, height: 60, resizeMode: 'contain' }}
            />
            <View style={styles.avatarEditBadge}>
              <MaterialCommunityIcons name="pencil" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.username}>{displayName}</Text>
            <Text style={styles.roleText}>{formatRoleName(user?.role)}</Text>
          </View>

          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('DatosPersonales')}>
            <Text style={styles.editBtnText}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>

        {/* ── Menú ── */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => {
            const isFirstPersonalized = item.personalized && !menuItems[index - 1]?.personalized;
            const iconColor = item.personalized ? '#60a5fa' : '#f05b22';
            const chevronColor = item.premium ? '#f05b22' : item.personalized ? '#60a5fa55' : '#666';

            return (
              <React.Fragment key={index}>
                {isFirstPersonalized && (
                  <View style={styles.personalizedSectionHeader}>
                    <View style={styles.personalizedTag}>
                      <MaterialCommunityIcons name="account-star-outline" size={13} color="#60a5fa" />
                      <Text style={styles.personalizedTagTxt}>Servicios Personalizados</Text>
                    </View>
                    <Text style={styles.personalizedDesc}>
                      Disponibles con tu plan de asesoramiento
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[
                    styles.menuItem,
                    item.premium      && styles.menuItemPremium,
                    item.personalized && styles.menuItemPersonalized,
                  ]}
                  onPress={item.action}
                >
                  <View style={styles.menuItemLeft}>
                    <MaterialCommunityIcons name={item.icon as any} size={24} color={iconColor} style={styles.menuIcon} />
                    <View style={styles.menuLabelCol}>
                      <Text style={[
                        styles.menuLabel,
                        item.premium      && styles.menuLabelPremium,
                        item.personalized && styles.menuLabelPersonalized,
                      ]}>
                        {item.label}
                      </Text>
                      {item.description && (
                        <Text
                          style={[
                            styles.menuDesc,
                            item.personalized && styles.menuDescPersonalized,
                            item.premium      && styles.menuDescPremium,
                          ]}
                          numberOfLines={2}
                        >
                          {item.description}
                        </Text>
                      )}
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={chevronColor} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>

      </ScrollView>

      {/* Pre-carga PNG avatares para evitar flash al abrir el modal */}
      <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {AVATARS.map(av => (
          <Image key={av.id} source={av.image} style={{ width: 1, height: 1 }} />
        ))}
      </View>

      {/* ── Modal picker de avatares ── */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Elige tu Avatar</Text>

            <View style={styles.avatarGrid}>
              {AVATARS.map((av) => (
                <TouchableOpacity
                  key={av.id}
                  style={[styles.avatarOption, localAvatar === av.icon && styles.avatarOptionSelected]}
                  onPress={() => handleAvatarSelect(av.icon)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={av.image}
                    style={{ width: 42, height: 42, resizeMode: 'contain', opacity: localAvatar === av.icon ? 1 : 0.5 }}
                  />
                  {localAvatar === av.icon && (
                    <View style={styles.avatarCheckBadge}>
                      <MaterialCommunityIcons name="check-circle" size={16} color="#f05b22" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#000000' },
  scrollContent:        { paddingBottom: 120 },

  // ── Header ──
  header:               { alignItems: 'center', paddingVertical: 40, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#111' },
  avatarContainer:      { width: 110, height: 110, borderRadius: 55, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#333', shadowColor: '#f05b22', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  avatarEditBadge:      { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#f05b22', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#000' },
  headerInfo:           { alignItems: 'center', marginBottom: 20 },
  username:             { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  roleText:             { color: '#888', fontSize: 14, marginTop: 4 },
  editBtn:              { backgroundColor: '#f05b22', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25, shadowColor: '#f05b22', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8 },
  editBtnText:          { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  // ── Menú ──
  menuContainer:        { paddingHorizontal: 20, marginTop: 10 },
  menuItem:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#161618' },
  menuItemPremium:      { backgroundColor: '#1C1C1E', marginHorizontal: -20, paddingHorizontal: 20, borderRadius: 12, borderBottomColor: 'transparent', borderWidth: 1, borderColor: '#FF5E00', marginVertical: 6 },
  menuItemPersonalized: { borderBottomColor: '#60a5fa18', borderLeftWidth: 3, borderLeftColor: '#60a5fa', marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#05111f' },
  menuItemLeft:          { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  menuIcon:              { marginRight: 20, marginTop: 1 },
  menuLabelCol:          { flex: 1 },
  menuLabel:             { color: '#ffffff', fontSize: 16, fontWeight: '500' },
  menuLabelPremium:      { color: '#f05b22', fontWeight: '700' },
  menuLabelPersonalized: { color: '#e0f2fe' },
  menuDesc:              { color: '#D1D5DB', fontSize: 13, marginTop: 3, lineHeight: 18 },
  menuDescPersonalized:  { color: '#93c5fd' },
  menuDescPremium:       { color: '#D1D5DB' },

  // ── Sección Servicios Personalizados ──
  personalizedSectionHeader: { marginTop: 14, marginBottom: 2 },
  personalizedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: '#60a5fa14', borderWidth: 1, borderColor: '#60a5fa40',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 5,
  },
  personalizedTagTxt: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  personalizedDesc:   { color: '#3a5a75', fontSize: 11, marginBottom: 4, marginLeft: 2 },

  // ── Modal ──
  modalBackdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet:           { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#3A3A3C', padding: 24, paddingBottom: 40 },
  modalHandle:          { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:           { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  modalLoading:         { alignItems: 'center', paddingVertical: 40, gap: 12 },
  modalLoadingText:     { color: '#888', fontSize: 14 },
  avatarGrid:           { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  avatarOption:         { width: '23%', aspectRatio: 1, backgroundColor: '#1a1a1a', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  avatarOptionSelected: { borderColor: '#f05b22', backgroundColor: '#2a1a15' },
  avatarCheckBadge:     { position: 'absolute', top: 4, right: 4 },
});
