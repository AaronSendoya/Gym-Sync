import React, { useState } from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Alert, Platform} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { userApi } from '../../../app/Providers/users/api/user.api';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

export const AjustesScreen = () => {
  const navigation = useNavigation();
  const { logout, user } = useAuth();
  const [pushLoading, setPushLoading] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que deseas salir de GymSync?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, salir',
          style: 'destructive',
          onPress: async () => { await logout(); },
        },
      ],
    );
  };

  const handlePushNotifications = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('No disponible', 'Las notificaciones solo están disponibles en la app móvil.');
      return;
    }

    try {
      setPushLoading(true);

      // 1. Verificar / solicitar permisos
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert(
          'Permisos denegados',
          'Activa las notificaciones desde Ajustes del sistema > GymSync.',
        );
        return;
      }

      const projectId =
        (Constants.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any).easConfig?.projectId;

      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      const expoPushToken = tokenResult.data;

      await userApi.updatePushToken(expoPushToken);

      Alert.alert('Notificaciones activadas', 'Recibirás alertas cuando se confirmen tus reservas.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudieron activar las notificaciones.');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Ajustes</Text>
      </View>
      <View style={styles.content}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>Usuario: {user?.userId}</Text>
            <Text style={styles.infoText}>Rol: {user?.role}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opciones del Sistema</Text>

          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBordered]}
              onPress={handlePushNotifications}
              disabled={pushLoading}
              activeOpacity={0.7}
            >
              {pushLoading
                ? <DumbbellSpinner size={24} color="#f05b22" style={styles.icon} />
                : <MaterialCommunityIcons name="bell-badge-outline" size={24} color="#f05b22" style={styles.icon} />
              }
              <Text style={styles.menuText}>
                {pushLoading ? 'Activando notificaciones…' : 'Notificaciones Push'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons name="theme-light-dark" size={24} color="#ccc" style={styles.icon} />
              <Text style={styles.menuText}>Apariencia (Dark Mode)</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={24} color="#ff4444" style={styles.icon} />
            <Text style={styles.logoutText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

      </View>
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
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#999999',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  infoCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoText: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 8,
  },
  menuCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuItemBordered: {
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  menuText: {
    color: '#ffffff',
    fontSize: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF453A',
    marginTop: 20,
  },
  icon: {
    marginRight: 12,
  },
  logoutText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
