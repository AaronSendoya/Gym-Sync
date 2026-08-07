import React from 'react';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './app/Providers/auth/AuthContext';
import { NetworkProvider } from './app/Providers/offline/NetworkContext';
import { SocketProvider } from './app/Providers/notifications/SocketContext';
import { RootNavigator } from './routes/RootNavigator';
import { useGymVisitTracker } from './app/Providers/geolocation/services/useGymVisitTracker';
import { usePushNotificationListeners } from './app/Providers/notifications/usePushNotifications';
import { useGymEventsSocket } from './app/Providers/notifications/useGymEventsSocket';
import { navigationRef } from './app/Providers/notifications/navigationRef';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // expo-notifications not available in Expo Go SDK 53+
}

export const queryClient = new QueryClient();

function AppWithTracking() {
  usePushNotificationListeners();
  useGymEventsSocket();
  useGymVisitTracker();
  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <NavigationContainer ref={navigationRef}>
              <SocketProvider>
                <AppWithTracking />
              </SocketProvider>
            </NavigationContainer>
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
