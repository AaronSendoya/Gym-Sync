import React from 'react';
import { TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const backBtnStyle = { width: 40, height: 40, marginLeft: 4, justifyContent: 'center' as const, alignItems: 'center' as const };
import { BuscarScreen } from '../resources/views/buscar/BuscarScreen';
import { MapScreenContainer } from '../resources/views/geolocation/MapScreen/MapScreen.container';
import { StaffMapScreen }    from '../resources/views/geolocation/StaffMapScreen/StaffMapScreen';
import { HistorialScreen }      from '../resources/views/buscar/HistorialScreen';
import { VisitedGymMapScreen }  from '../resources/views/buscar/VisitedGymMapScreen';
import { ScheduleSelectionScreen } from '../app/Providers/reservations/screens/ScheduleSelectionScreen';
import { MisReservasScreen } from '../app/Providers/reservations/screens/MisReservasScreen';

export type BuscarStackParamList = {
  BuscarHome: undefined;
  Mapa: { focusSedeId?: string | number } | undefined;
  StaffMapa: undefined;
  Historial: undefined;
  VisitedGymMap: { gymId: number; name: string; latitude?: number; longitude?: number };
  ScheduleSelection: { gymId: number; gymName: string };
  MisReservas: undefined;
};

const Stack = createNativeStackNavigator<BuscarStackParamList>();

export const BuscarStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="BuscarHome" component={BuscarScreen} />
      <Stack.Screen
        name="Mapa"
        component={MapScreenContainer}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StaffMapa"
        component={StaffMapScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Historial"
        component={HistorialScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ScheduleSelection"
        component={ScheduleSelectionScreen}
        options={({ navigation }) => ({
          headerShown:       true,
          title:             'Reservar Horario',
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
      <Stack.Screen
        name="MisReservas"
        component={MisReservasScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VisitedGymMap"
        component={VisitedGymMapScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};
