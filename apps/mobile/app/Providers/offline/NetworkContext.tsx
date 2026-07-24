import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Alert, Platform, ToastAndroid } from 'react-native';
import { SyncManager } from './SyncManager';

interface NetworkContextValue {
  isOnline: boolean;
  pendingCount: number;
  refreshPendingCount: () => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  pendingCount: 0,
  refreshPendingCount: () => {},
});

export const useNetwork = () => useContext(NetworkContext);

let _isOnline = true;
export const getIsOnline = () => _isOnline;

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('', msg);
  }
}

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const prevOnline = useRef(true);

  const refreshPendingCount = async () => {
    try {
      // Incluye mutaciones encoladas + sesiones de entrenamiento offline
      const c = await SyncManager.pendingCount();
      setPendingCount(c);
    } catch {
      // best-effort: el contador nunca debe romper el provider
    }
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      _isOnline = connected;
      setIsOnline(connected);

      if (!connected && prevOnline.current) {
        showToast('Sin conexión a internet');
      }

      if (connected && !prevOnline.current) {
        showToast('Conexión restaurada');
        SyncManager.sync().then(() => refreshPendingCount()).catch(() => {});
      }

      prevOnline.current = connected;
    });

    refreshPendingCount();
    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, pendingCount, refreshPendingCount }}>
      {children}
    </NetworkContext.Provider>
  );
};
