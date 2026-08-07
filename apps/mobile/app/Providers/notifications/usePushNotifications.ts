import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { userApi } from '../users/api/user.api';
import { navigateToMembresiasVencidas } from './navigationRef';

// getExpoPushTokenAsync hangs in Expo Go (SDK 53+) — skip all remote push logic there.
const IS_EXPO_GO =
  (Constants as any).executionEnvironment === 'storeClient' ||
  (Constants as any).appOwnership === 'expo' ||
  (Constants as any).expoVersion != null; 

const PROJECT_ID = '05dedde2-39f5-4da2-9bbb-a805f06fa281';

const MANAGER_PUSH_TYPES = new Set(['NEW_RESERVATION', 'CANCEL_RESERVATION']);

// Tipos de notificaciones de asesoría que llegan al entrenador
const ADVISOR_INCOMING_TYPES = new Set(['ADVISORY_REQUEST']);
// Tipos de notificaciones de asesoría que llegan al cliente
const ADVISORY_RESPONSE_TYPES = new Set(['ADVISORY_ACCEPTED', 'ADVISORY_REJECTED', 'ADVISORY_CANCELLED']);
// Resumen diario de membresías vencidas (Recepcionista/Gerente, nivel 4/5)
const MEMBERSHIP_EXPIRED_TYPES = new Set(['MEMBERSHIP_EXPIRED_DIGEST']);

export function usePushNotifications() {
  const registerToken = async (): Promise<void> => {
    try {
      if (IS_EXPO_GO) return; // push tokens not supported in Expo Go SDK 53+
      if (!Device.isDevice) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      if (status !== 'granted') return;

      const { data: token } = await Promise.race([
        Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getExpoPushTokenAsync timeout')), 5000),
        ),
      ]);

      const result = await userApi.updatePushToken(token);
      if (!result?.registered) {
        console.warn('[PushNotifications] Backend no confirmó registro:', result);
        return;
      }
      // token registered
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[PushNotifications] registerToken error:', message, e);
    }
  };

  const clearToken = async (): Promise<void> => {
    try {
      await userApi.clearPushToken();
      // token cleared
    } catch (e) {
      console.warn('[PushNotifications] clearToken error:', e);
    }
  };

  return { registerToken, clearToken };
}

export function usePushNotificationListeners(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (IS_EXPO_GO) return; // listeners not supported in Expo Go SDK 53+

    const received = Notifications.addNotificationReceivedListener(async (notification) => {
      const content = notification.request.content;
      const data = content.data as Record<string, unknown>;
      const appState = AppState.currentState;
      const type = String(data?.type ?? '');

      console.warn(
        '[Push Recibida]',
        content.title,
        type,
        'Reserva:',
        data?.reservationId,
        'appState:',
        appState,
      );

      if (MANAGER_PUSH_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['gym-audit-reservations'] });
        queryClient.invalidateQueries({ queryKey: ['manager-dashboard-stats'] });
      }

      if (ADVISOR_INCOMING_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['trainer-pending-requests'] });
        queryClient.invalidateQueries({ queryKey: ['nutritionist-pending-requests'] });
      }

      if (ADVISORY_RESPONSE_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['my-advisor-requests'] });
        queryClient.invalidateQueries({ queryKey: ['my-plan'] });
        queryClient.invalidateQueries({ queryKey: ['my-routines'] });
      }

      if (MEMBERSHIP_EXPIRED_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['membresias-subs'] });
      }

      if (appState === 'active') {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: content.title ?? 'GymSync',
              body: content.body ?? '',
              data: data ?? {},
              sound: 'default',
              ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
            },
            trigger: null,
          });
        } catch (e) {
          console.warn('[PushNotifications] foreground present error:', e);
        }
      }
    });

    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data as Record<string, unknown>;
      const type = String(data?.type ?? '');
      if (MANAGER_PUSH_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['gym-audit-reservations'] });
        queryClient.invalidateQueries({ queryKey: ['manager-dashboard-stats'] });
      }
      if (ADVISOR_INCOMING_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['trainer-pending-requests'] });
        queryClient.invalidateQueries({ queryKey: ['nutritionist-pending-requests'] });
      }
      if (ADVISORY_RESPONSE_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['my-advisor-requests'] });
        queryClient.invalidateQueries({ queryKey: ['my-plan'] });
        queryClient.invalidateQueries({ queryKey: ['my-routines'] });
      }
      if (MEMBERSHIP_EXPIRED_TYPES.has(type)) {
        queryClient.invalidateQueries({ queryKey: ['membresias-subs'] });
        navigateToMembresiasVencidas();
      }
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, [queryClient]);
}
