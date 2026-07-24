import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PerfilMenuScreen }          from '../resources/views/perfil/PerfilMenuScreen';
import { PerfilManagerScreen }       from '../resources/views/perfil/PerfilManagerScreen';
import { AlertasConfigScreen }       from '../resources/views/alertas/AlertasConfigScreen';
import { AjustesScreen }             from '../resources/views/perfil/AjustesScreen';
import { MisDatosPersonalesScreen }  from '../resources/views/perfil/MisDatosPersonalesScreen';
import { AuditoriaSucursalScreen }   from '../resources/views/perfil/AuditoriaSucursalScreen';
import { MisObjetivosScreen }        from '../resources/views/perfil/MisObjetivosScreen';
import { CarnetVirtualScreen }       from '../resources/views/perfil/CarnetVirtualScreen';
import { StaffCatalogScreen }        from '../resources/views/perfil/StaffCatalogScreen';
import { MiPlanScreen }             from '../resources/views/perfil/MiPlanScreen';
import { MiRutinaScreen }           from '../resources/views/perfil/MiRutinaScreen';
import { MiMembresiaScreen }        from '../resources/views/perfil/MiMembresiaScreen';

// ── Param lists ──────────────────────────────────────────────────────────────
export type ClientePerfilParamList = {
  Menu: undefined;
  DatosPersonales: undefined;
  Manager: undefined;
  AlertasConfig: undefined;
  Ajustes: undefined;
  MisObjetivos: undefined;
  CarnetDigital: undefined;
  StaffCatalog: undefined;
  MiPlan: undefined;
  MiRutina: undefined;
  MiMembresia: undefined;
};

export type GerentePerfilParamList = {
  Menu: undefined;
  DatosPersonales: undefined;
  Manager: undefined;
  AlertasConfig: undefined;
  Ajustes: undefined;
  AuditoriaSucursal: undefined;
};

const ClienteStack  = createNativeStackNavigator<ClientePerfilParamList>();
const GerenteStack  = createNativeStackNavigator<GerentePerfilParamList>();

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: '#000000' },
} as const;

// ── Stack para rol CLIENTE / USER ────────────────────────────────────────────
// NO contiene AuditoriaSucursalScreen — ruta físicamente inexistente para clientes
export const ClientePerfilStack = () => (
  <ClienteStack.Navigator screenOptions={screenOptions}>
    <ClienteStack.Screen name="Menu"             component={PerfilMenuScreen} />
    <ClienteStack.Screen name="DatosPersonales"  component={MisDatosPersonalesScreen}  options={{ headerShown: false }} />
    <ClienteStack.Screen name="Manager"          component={PerfilManagerScreen}        options={{ headerShown: false }} />
    <ClienteStack.Screen name="AlertasConfig"    component={AlertasConfigScreen}        options={{ headerShown: false }} />
    <ClienteStack.Screen name="Ajustes"          component={AjustesScreen}              options={{ headerShown: false }} />
    <ClienteStack.Screen name="MisObjetivos"      component={MisObjetivosScreen}         options={{ headerShown: false }} />
    <ClienteStack.Screen name="CarnetDigital"     component={CarnetVirtualScreen}        options={{ headerShown: false }} />
    <ClienteStack.Screen name="StaffCatalog"      component={StaffCatalogScreen}         options={{ headerShown: false }} />
    <ClienteStack.Screen name="MiPlan"            component={MiPlanScreen}               options={{ headerShown: false }} />
    <ClienteStack.Screen name="MiRutina"          component={MiRutinaScreen}             options={{ headerShown: false }} />
    <ClienteStack.Screen name="MiMembresia"       component={MiMembresiaScreen}          options={{ headerShown: false }} />
  </ClienteStack.Navigator>
);

// ── Stack para rol GERENTE / COORDINADOR ─────────────────────────────────────
// NO contiene HistorialMetricasScreen — ruta físicamente inexistente para gerentes
export const GerentePerfilStack = () => (
  <GerenteStack.Navigator screenOptions={screenOptions}>
    <GerenteStack.Screen name="Menu"             component={PerfilMenuScreen} />
    <GerenteStack.Screen name="DatosPersonales"  component={MisDatosPersonalesScreen}  options={{ headerShown: false }} />
    <GerenteStack.Screen name="Manager"          component={PerfilManagerScreen}        options={{ headerShown: false }} />
    <GerenteStack.Screen name="AlertasConfig"    component={AlertasConfigScreen}        options={{ headerShown: false }} />
    <GerenteStack.Screen name="Ajustes"          component={AjustesScreen}              options={{ headerShown: false }} />
    <GerenteStack.Screen name="AuditoriaSucursal" component={AuditoriaSucursalScreen}   options={{ headerShown: false }} />
  </GerenteStack.Navigator>
);

// Alias legacy — evita romper imports existentes
export const PerfilStack = ClientePerfilStack;
export type  PerfilStackParamList = ClientePerfilParamList;
