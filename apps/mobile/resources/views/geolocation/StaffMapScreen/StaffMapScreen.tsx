import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../../app/Shared/hooks/useAuth';
import authAxios from '../../../../app/Providers/auth/authAxios';
import { OSMConfig } from '../../../../app/Providers/geolocation/config/osm.config';
import { DumbbellSpinner } from '../../../../app/Shared/components/ui/DumbbellSpinner';
import {
  LeafletMapView,
  LeafletMapHandle,
  LeafletSede,
} from '../../../../app/Providers/geolocation/components/LeafletMap/LeafletMapView';

interface StaffGym {
  id:           number;
  name:         string;
  parentId?:    number | null;
  parentName?:  string | null;
  aforoActual?: number;
  maxCapacity?: number;
  isOpen?:      boolean;
  location?: {
    latitude:  number;
    longitude: number;
    address?:  string;
  };
}

const INITIAL_CENTER = {
  lat: OSMConfig.defaults.initialRegion.latitude,
  lng: OSMConfig.defaults.initialRegion.longitude,
};

function unwrap(res: any): any {
  const d = res?.data;
  if (d && typeof d === 'object' && 'success' in d && 'data' in d) return d.data;
  return d;
}

export const StaffMapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user }   = useAuth();
  const mapRef     = useRef<LeafletMapHandle>(null);

  const [gyms,      setGyms]      = useState<StaffGym[]>([]);
  const [brandName, setBrandName] = useState<string>('Tu Marca');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const loadBrandGyms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const gymId = user?.gymId ? Number(user.gymId) : null;
      if (!gymId) {
        setError('Tu cuenta no tiene una sucursal asignada.\nContacta al administrador.');
        return;
      }

      const ownRes  = await authAxios.get(`/api/gyms/${gymId}`, { timeout: 10000 });
      const ownGym  = unwrap(ownRes) as StaffGym & { parent?: { name?: string } };
      const brandId = ownGym?.parentId ?? null;
      const brand   = ownGym?.parentName ?? (ownGym as any)?.parent?.name ?? 'Mi Marca';
      setBrandName(brand);

      if (!brandId) {
        setGyms(ownGym?.location ? [ownGym] : []);
        return;
      }

      const allRes  = await authAxios.get('/api/gyms', { timeout: 10000 });
      const allList = unwrap(allRes);
      const all: StaffGym[] = Array.isArray(allList) ? allList : [];

      const brandGyms = all.filter(
        g => g.parentId != null && Number(g.parentId) === Number(brandId),
      );
      setGyms(brandGyms.length > 0 ? brandGyms : (ownGym?.location ? [ownGym] : []));
    } catch (e: any) {
      setError('No se pudieron cargar las sucursales.\nVerifica tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [user?.gymId]);

  useEffect(() => { loadBrandGyms(); }, [loadBrandGyms]);

  // Fly to first valid gym once loaded
  useEffect(() => {
    if (gyms.length === 0) return;
    const first = gyms.find(g => g.location?.latitude && g.location?.longitude);
    if (!first?.location) return;
    const timer = setTimeout(() => {
      mapRef.current?.flyTo(first.location!.latitude, first.location!.longitude, 14);
    }, 800);
    return () => clearTimeout(timer);
  }, [gyms]);

  const leafletSedes: LeafletSede[] = useMemo(() =>
    gyms
      .filter(g => g.location?.latitude && g.location?.longitude)
      .map(gym => {
        const isUserGym = Number(gym.id) === Number(user?.gymId);
        const isClosed  = gym.isOpen === false;
        const aforo     = gym.aforoActual ?? 0;
        const maxCap    = gym.maxCapacity ?? 100;
        const pct       = maxCap > 0 ? Math.round((aforo / maxCap) * 100) : 0;
        return {
          id:          gym.id,
          nombre:      gym.name,
          lat:         gym.location!.latitude,
          lng:         gym.location!.longitude,
          address:     gym.location?.address,
          aforoActual: aforo,
          aforoMaximo: maxCap,
          isClosed,
          isAvailable: !isClosed && pct <= 70,
          isUserGym,
          pct,
        };
      }),
    [gyms, user?.gymId],
  );

  const Header = (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
      </TouchableOpacity>
      <View style={s.headerMid}>
        <Text style={s.headerBrand} numberOfLines={1}>{brandName}</Text>
        <Text style={s.headerSub}>
          {loading ? 'Cargando...' : `${gyms.length} sucursal${gyms.length !== 1 ? 'es' : ''}`}
        </Text>
      </View>
      <TouchableOpacity style={s.reloadBtn} onPress={loadBrandGyms} disabled={loading}>
        <MaterialCommunityIcons
          name={loading ? 'loading' : 'refresh'}
          size={18}
          color={loading ? '#444' : '#f05b22'}
        />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        {Header}
        <View style={s.center}>
          <DumbbellSpinner size="large" color="#f05b22" />
          <Text style={s.centerTxt}>Cargando sucursales de tu marca...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        {Header}
        <View style={s.center}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={52} color="#444" />
          <Text style={s.centerTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadBrandGyms}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {Header}

      <View style={s.infoPill}>
        <MaterialCommunityIcons name="office-building-marker" size={14} color="#f05b22" />
        <Text style={s.infoPillTxt}>
          {gyms.length} sucursal{gyms.length !== 1 ? 'es' : ''} de{' '}
          <Text style={{ color: '#f05b22', fontWeight: '800' }}>{brandName}</Text>
        </Text>
      </View>

      <View style={s.mapWrap}>
        <LeafletMapView
          ref={mapRef}
          mode="staff"
          sedes={leafletSedes}
          initialCenter={INITIAL_CENTER}
          initialZoom={13}
          interactive
          style={StyleSheet.absoluteFillObject}
        />

        {/* Attribution */}
        <View style={s.attribution}>
          <Text style={s.attributionTxt}>{OSMConfig.attribution}</Text>
        </View>

        {/* Legend */}
        <View style={s.legend}>
          {[
            { color: '#f05b22', label: 'Tu sucursal' },
            { color: '#2ecc71', label: 'Disponible' },
            { color: '#e74c3c', label: 'Lleno' },
            { color: '#8e8e93', label: 'Cerrada' },
          ].map(item => (
            <View key={item.label} style={s.legendRow}>
              <View style={[s.legendDot, { backgroundColor: item.color }]} />
              <Text style={s.legendTxt}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0a0a0a' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center' },
  reloadBtn:  { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center' },
  headerMid:  { flex: 1 },
  headerBrand:{ color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub:  { color: '#f05b22', fontSize: 11, fontWeight: '600', marginTop: 1 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 36 },
  centerTxt:  { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn:   { backgroundColor: '#f05b22', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryTxt:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginVertical: 8, backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#222', alignSelf: 'flex-start' },
  infoPillTxt:{ color: '#aaa', fontSize: 12 },
  mapWrap:    { flex: 1, position: 'relative' },
  attribution:{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  attributionTxt: { color: '#aaa', fontSize: 9 },
  legend:     { position: 'absolute', top: 12, right: 12, backgroundColor: '#0A0A0A', borderRadius: 12, padding: 10, gap: 6, borderWidth: 1, borderColor: '#222' },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendTxt:  { color: '#ccc', fontSize: 11, fontWeight: '600' },
});
