import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Ref global de navegación — necesario para navegar desde fuera del árbol de
 * componentes (ej. el listener de respuesta a una push notification en
 * usePushNotifications.ts, que corre a nivel de App.tsx, por encima de
 * cualquier Screen). Patrón oficial de React Navigation para este caso.
 */
export const navigationRef = createNavigationContainerRef();

/** Abre Membresías (Gerente/Recepcionista) desde el push de resumen de vencidas. */
export function navigateToMembresiasVencidas(): void {
  if (!navigationRef.isReady()) return;
  try {
    // "Membresía" es un tab de primer nivel de GerenteTabs (ya no vive anidado
    // bajo 'Perfil') — se navega directo por nombre de tab.
    (navigationRef.navigate as any)('Membresía', {
      initialTab: 'inscripciones', initialStatus: 'VENCIDA',
    });
  } catch (e) {
    console.warn('[navigationRef] No se pudo navegar a Membresías:', e);
  }
}
