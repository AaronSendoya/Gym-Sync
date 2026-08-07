import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {View, Text, TouchableOpacity} from 'react-native';

const backBtnStyle = { width: 40, height: 40, marginLeft: 4, justifyContent: 'center' as const, alignItems: 'center' as const };
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../app/Shared/hooks/useAuth';

// ── Auth ─────────────────────────────────────────────────────────────────────
import { LoginScreen }          from '../resources/views/auth/LoginScreen';
import { RegisterScreen }       from '../resources/views/auth/RegisterScreen';
import { ForgotPasswordScreen } from '../resources/views/auth/ForgotPasswordScreen';
import { ResetPasswordScreen }  from '../resources/views/auth/ResetPasswordScreen';

// ── Pantallas comunes ─────────────────────────────────────────────────────────
import { InicioScreen, StaffInicioScreen } from '../resources/views/inicio/InicioScreen';
import { BuscarStack }          from './BuscarStack';

// ── Pantallas exclusivas por rol ──────────────────────────────────────────────
import { MisReservasScreen }      from '../app/Providers/reservations/screens/MisReservasScreen';
import { AuditoriaSucursalScreen } from '../resources/views/perfil/AuditoriaSucursalScreen';
import { EscanerScreen }          from '../resources/views/audit/EscanerScreen';

// ── Dashboards de inicio por rol ──────────────────────────────────────────────
import { ManagerDashboard }       from '../resources/views/inicio/ManagerDashboard';
import { ClaseDetalleScreen }      from '../resources/views/inicio/ClaseDetalleScreen';
import { AsignarRutinaScreen }     from '../resources/views/inicio/AsignarRutinaScreen';

// ── Cuadro de Mando (solo CLIENTE) ───────────────────────────────────────────
import { CuadroDeMandoClienteScreen } from '../resources/views/inicio/CuadroDeMandoClienteScreen';

// ── Workout (solo CLIENTE) ────────────────────────────────────────────────────
import { WorkoutModeScreen }    from '../resources/views/workout/WorkoutModeScreen';
import { WorkoutReadyScreen }   from '../resources/views/workout/WorkoutReadyScreen';
import { WorkoutActiveScreen }  from '../resources/views/workout/WorkoutActiveScreen';
import { WorkoutSummaryScreen } from '../resources/views/workout/WorkoutSummaryScreen';
import { WorkoutHistoryScreen } from '../resources/views/workout/WorkoutHistoryScreen';

// ── Historial de Gimnasios (acceso desde Inicio, fuera del tab Buscar) ────────
import { HistorialScreen }     from '../resources/views/buscar/HistorialScreen';
import { VisitedGymMapScreen } from '../resources/views/buscar/VisitedGymMapScreen';
import { StaffCatalogScreen }  from '../resources/views/perfil/StaffCatalogScreen';
import { PerfilAlumnoScreen }  from '../resources/views/inicio/PerfilAlumnoScreen';
import { TrainerPlanScreen }   from '../resources/views/inicio/TrainerPlanScreen';

// ── Stacks de Perfil segregados ───────────────────────────────────────────────
import { ClientePerfilStack, GerentePerfilStack } from './PerfilStack';

// ── Rutina Ejecución (CLIENTE) ────────────────────────────────────────────────
import { EjecutarRutinaScreen }   from '../resources/views/perfil/EjecutarRutinaScreen';
import { ResumenEjercicioScreen } from '../resources/views/perfil/ResumenEjercicioScreen';

// ── Mensajería (CLIENTE + STAFF) ──────────────────────────────────────────────
import { InboxScreen }        from '../resources/views/mensajes/InboxScreen';
import { ChatScreen }         from '../resources/views/mensajes/ChatScreen';
import { ChatProfileScreen }  from '../resources/views/mensajes/ChatProfileScreen';

// ── Mapa interno de staff ─────────────────────────────────────────────────────
import { StaffMapScreen } from '../resources/views/geolocation/StaffMapScreen/StaffMapScreen';

// ── Seguimiento (ENTRENADOR / INSTRUCTOR) ─────────────────────────────────────
import { SeguimientoScreen }        from '../resources/views/seguimiento/SeguimientoScreen';
import { HistorialRutinaScreen }    from '../resources/views/seguimiento/HistorialRutinaScreen';
import { RegistroEjercicioScreen }  from '../resources/views/seguimiento/RegistroEjercicioScreen';
import { TrainerReportScreen }      from '../resources/views/seguimiento/TrainerReportScreen';
import { InstructorReportScreen }   from '../resources/views/seguimiento/InstructorReportScreen';
import { ReportPreviewScreen }      from '../resources/views/seguimiento/ReportPreviewScreen';
import { MisAlumnosScreen }         from '../resources/views/inicio/MisAlumnosScreen';
import { DumbbellSpinner } from '../app/Shared/components/ui/DumbbellSpinner';

// ── Membresías (GERENTE / RECEPCIONISTA) ──────────────────────────────────────
import { MembresiasScreen } from '../resources/views/perfil/MembresiasScreen';

// ── Iconos de tabs ────────────────────────────────────────────────────────────
const TAB_ICON: Record<string, string> = {
  'Inicio':       'home',
  'Buscar':       'magnify',
  'Mis Reservas': 'calendar',
  'Auditoría':    'clipboard-text-outline',
  'Membresía':    'credit-card-outline',
  'Seguimiento':  'chart-line',
  'Mensajes':     'message-text-outline',
  'Perfil':       'account',
};

const tabScreenOptions = ({ route }: { route: { name: string } }) => ({
  headerShown: false,
  tabBarActiveTintColor:   '#f05b22',
  tabBarInactiveTintColor: '#666',
  tabBarStyle: {
    backgroundColor: '#1c1c1e',
    borderTopWidth:  0,
    position:        'absolute' as const,
    bottom:          24,
    left:            20,
    right:           20,
    borderRadius:    30,
    height:          65,
    paddingBottom:   10,
    paddingTop:      10,
  },
  tabBarIcon: ({ color }: { color: string }) => (
    <MaterialCommunityIcons
      name={(TAB_ICON[route.name] ?? 'circle') as any}
      size={28}
      color={color}
    />
  ),
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AUTH STACK — sin acceso a pantallas autenticadas
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AuthNav = createNativeStackNavigator();
const AuthStack = () => (
  <AuthNav.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
    <AuthNav.Screen name="Login"          component={LoginScreen} />
    <AuthNav.Screen name="Register"       component={RegisterScreen} />
    <AuthNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <AuthNav.Screen name="ResetPassword"  component={ResetPasswordScreen} />
  </AuthNav.Navigator>
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CLIENTE STACK — solo rutas de cliente; Auditoría y Escaner NO existen aquí
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const ClienteTab = createBottomTabNavigator();
const ClienteTabs = () => (
  <ClienteTab.Navigator screenOptions={tabScreenOptions}>
    <ClienteTab.Screen name="Inicio"      component={InicioScreen} />
    <ClienteTab.Screen name="Buscar"      component={BuscarStack} />
    <ClienteTab.Screen name="Mis Reservas" component={MisReservasScreen} options={{ headerShown: false }} />
    <ClienteTab.Screen name="Mensajes"    component={InboxScreen} options={{ headerShown: false }} />
    <ClienteTab.Screen name="Perfil"      component={ClientePerfilStack} />
  </ClienteTab.Navigator>
);

// Mini-stack para Historial de Gimnasios accedido desde InicioScreen.
// Al hacer goBack() desde HistorialScreen vuelve al tab Inicio (no a BuscarStack).
const GymHistorialNav = createNativeStackNavigator();
const GymHistorialStack = () => (
  <GymHistorialNav.Navigator screenOptions={{ headerShown: false }}>
    <GymHistorialNav.Screen name="HistorialList"  component={HistorialScreen} />
    <GymHistorialNav.Screen name="VisitedGymMap"  component={VisitedGymMapScreen} />
  </GymHistorialNav.Navigator>
);

const ClienteNav = createNativeStackNavigator();
const ClienteStack = () => (
  <ClienteNav.Navigator screenOptions={{ headerShown: false }}>
    <ClienteNav.Screen name="MainTabs"      component={ClienteTabs} />
    <ClienteNav.Screen
      name="WorkoutHistory"
      component={WorkoutHistoryScreen}
      options={{ headerShown: false, gestureEnabled: true }}
    />
    <ClienteNav.Screen
      name="WorkoutMode"
      component={WorkoutModeScreen}
      options={{ headerShown: false }}
    />
    <ClienteNav.Screen
      name="WorkoutReady"
      component={WorkoutReadyScreen}
      options={{ headerShown: false }}
    />
    <ClienteNav.Screen
      name="WorkoutActive"
      component={WorkoutActiveScreen}
      options={{ headerShown: false, gestureEnabled: false }}
    />
    <ClienteNav.Screen
      name="WorkoutSummary"
      component={WorkoutSummaryScreen}
      options={{ headerShown: false, gestureEnabled: false }}
    />
    <ClienteNav.Screen
      name="GymHistorial"
      component={GymHistorialStack}
      options={{ headerShown: false }}
    />
    <ClienteNav.Screen
      name="CuadroDeMando"
      component={CuadroDeMandoClienteScreen}
      options={{ headerShown: false, gestureEnabled: true }}
    />
    <ClienteNav.Screen
      name="StaffCatalog"
      component={StaffCatalogScreen}
      options={{ headerShown: false }}
    />
    <ClienteNav.Screen
      name="EjecutarRutina"
      component={EjecutarRutinaScreen}
      options={{ headerShown: false, gestureEnabled: false }}
    />
    <ClienteNav.Screen
      name="ResumenEjercicio"
      component={ResumenEjercicioScreen}
      options={{ headerShown: false, gestureEnabled: false }}
    />
    <ClienteNav.Screen
      name="Chat"
      component={ChatScreen}
      options={{ headerShown: false }}
    />
    <ClienteNav.Screen
      name="ChatProfile"
      component={ChatProfileScreen}
      options={{ headerShown: false }}
    />
  </ClienteNav.Navigator>
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GERENTE STACK — solo rutas de gerente; MisReservas y HistorialMetricas NO existen aquí
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const GerenteTab = createBottomTabNavigator();
// "Buscar" (BuscarStack) queda deshabilitado para roles administrativos
// (nivel 4 Recepcionista y nivel 5 Gerente) — sin acceso desde el nav bar
// ni desde ningún otro punto de la app para estos niveles. El componente
// sigue existiendo y activo para Cliente/Staff (ClienteTabs/StaffTabs);
// esto NO es un borrado, solo se retira su registro de este navigator.
const GerenteTabs = () => (
  <GerenteTab.Navigator screenOptions={tabScreenOptions}>
    <GerenteTab.Screen name="Inicio"     component={ManagerDashboard} />
    <GerenteTab.Screen name="Auditoría"  component={AuditoriaSucursalScreen} />
    <GerenteTab.Screen name="Membresía"  component={MembresiasScreen} />
    <GerenteTab.Screen name="Perfil"     component={GerentePerfilStack} />
  </GerenteTab.Navigator>
);

const GerenteNav = createNativeStackNavigator();
const GerenteStack = () => (
  <GerenteNav.Navigator screenOptions={{ headerShown: false }}>
    <GerenteNav.Screen name="MainTabs" component={GerenteTabs} />
    <GerenteNav.Screen
      name="Escaner"
      component={EscanerScreen}
      options={{ headerShown: false }}
    />
  </GerenteNav.Navigator>
);

// STAFF STACK — ENTRENADOR / INSTRUCTOR / NUTRICIONISTA

// Tab Buscar para staff: mapa interno, no el mapa de clientes
const StaffBuscarNav = createNativeStackNavigator();
const StaffBuscarStack = () => (
  <StaffBuscarNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
    <StaffBuscarNav.Screen name="StaffBuscarHome" component={StaffMapScreen} />
  </StaffBuscarNav.Navigator>
);

const StaffTab = createBottomTabNavigator();
const StaffTabs = () => (
  <StaffTab.Navigator screenOptions={tabScreenOptions}>
    <StaffTab.Screen name="Inicio"       component={StaffInicioScreen} />
    <StaffTab.Screen name="Buscar"       component={StaffBuscarStack} />
    <StaffTab.Screen name="Seguimiento"  component={SeguimientoScreen} />
    <StaffTab.Screen name="Mensajes"     component={InboxScreen} options={{ headerShown: false }} />
    <StaffTab.Screen name="Perfil"       component={ClientePerfilStack} />
  </StaffTab.Navigator>
);

const StaffNav = createNativeStackNavigator();
const StaffStack = () => (
  <StaffNav.Navigator screenOptions={{ headerShown: false }}>
    <StaffNav.Screen name="MainTabs" component={StaffTabs} />
    <StaffNav.Screen
      name="ClaseDetalle"
      component={ClaseDetalleScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="AsignarRutina"
      component={AsignarRutinaScreen}
      options={({ navigation }) => ({
        headerShown:       true,
        title:             'Asignar Rutina',
        headerStyle:       { backgroundColor: '#1E1E1E' },
        headerTintColor:   '#fff',
        headerBackVisible: false,
        headerLeft: () => (
          <TouchableOpacity style={backBtnStyle} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
        ),
      })}
    />
    <StaffNav.Screen
      name="PerfilAlumno"
      component={PerfilAlumnoScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="TrainerPlan"
      component={TrainerPlanScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="HistorialRutina"
      component={HistorialRutinaScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="RegistroEjercicio"
      component={RegistroEjercicioScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="MisAlumnos"
      component={MisAlumnosScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="TrainerReport"
      component={TrainerReportScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="InstructorReport"
      component={InstructorReportScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="ReportPreview"
      component={ReportPreviewScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="ScannerQR"
      component={EscanerScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="Chat"
      component={ChatScreen}
      options={{ headerShown: false }}
    />
    <StaffNav.Screen
      name="ChatProfile"
      component={ChatProfileScreen}
      options={{ headerShown: false }}
    />
  </StaffNav.Navigator>
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROL DESCONOCIDO — nunca permite acceso a pantallas autenticadas
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const UnknownRoleScreen = () => {
  const { logout } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <MaterialCommunityIcons name="shield-off-outline" size={52} color="#666" />
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 }}>Rol no reconocido</Text>
      <Text style={{ color: '#555', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
        Contacta al administrador.
      </Text>
      <TouchableOpacity
        onPress={logout}
        style={{ marginTop: 32, backgroundColor: '#1C1C1E', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1, borderColor: '#3A3A3C' }}
        activeOpacity={0.8}
      >
        <Text style={{ color: '#f05b22', fontSize: 14, fontWeight: '700' }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROOT NAVIGATOR — switch exhaustivo por rol normalizado
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export const RootNavigator = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <DumbbellSpinner size="large" color="#f05b22" />
      </View>
    );
  }

  if (!isAuthenticated) return <AuthStack />;

  const level: number = (user as any)?.level ?? 0;
  if (level >= 4) return <GerenteStack />;
  if (level >= 2) return <StaffStack />;
  if (level >= 1) return <ClienteStack />;
  return <UnknownRoleScreen />;
};

export default RootNavigator;
