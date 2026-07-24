import React, { useEffect, useRef, useState, useMemo } from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OSMConfig } from '../../../app/Providers/geolocation/config/osm.config';
import authAxios from '../../../app/Providers/auth/authAxios';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';
import {
  LeafletMapView,
  LeafletMapHandle,
  LeafletSede,
} from '../../../app/Providers/geolocation/components/LeafletMap/LeafletMapView';

const DELTA_ZOOM = 16;

export const VisitedGymMapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { gymId, name, latitude: paramLat, longitude: paramLng } = route.params;

  const mapRef              = useRef<LeafletMapHandle>(null);
  const [lat, setLat]       = useState<number | null>(paramLat ?? null);
  const [lng, setLng]       = useState<number | null>(paramLng ?? null);
  const [loading, setLoad]  = useState(!paramLat || !paramLng);
  const [error, setError]   = useState<string | null>(null);

  // Fetch coords if not passed as params
  useEffect(() => {
    if (paramLat && paramLng) return;
    (async () => {
      try {
        const res = await authAxios.get(`/api/gyms/${gymId}`, { timeout: 8000 });
        const g = res.data?.data ?? res.data;
        const fetchedLat = g?.location?.latitude  ?? g?.coordenadas?.latitude;
        const fetchedLng = g?.location?.longitude ?? g?.coordenadas?.longitude;
        if (fetchedLat && fetchedLng) {
          setLat(fetchedLat);
          setLng(fetchedLng);
        } else {
          setError('No se encontraron coordenadas para esta marca.');
        }
      } catch {
        setError('No se pudo obtener la ubicación de la marca.');
      } finally {
        setLoad(false);
      }
    })();
  }, [gymId, paramLat, paramLng]);

  // Fly to gym once coords ready
  useEffect(() => {
    if (!lat || !lng) return;
    const timer = setTimeout(() => {
      mapRef.current?.flyTo(lat, lng, DELTA_ZOOM);
    }, 400);
    return () => clearTimeout(timer);
  }, [lat, lng]);

  const leafletSedes: LeafletSede[] = useMemo(() =>
    lat && lng
      ? [{ id: gymId, nombre: name, lat, lng }]
      : [],
    [gymId, name, lat, lng],
  );

  const initialCenter = useMemo(() => ({
    lat: lat ?? OSMConfig.defaults.initialRegion.latitude,
    lng: lng ?? OSMConfig.defaults.initialRegion.longitude,
  }), [lat, lng]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.headerTitle} numberOfLines={1}>{name}</Text>
          <Text style={s.headerSub}>Marca visitada</Text>
        </View>
        <View style={s.headerRight} />
      </View>

      {loading && (
        <View style={s.overlay}>
          <DumbbellSpinner size="large" color="#f05b22" />
          <Text style={s.overlayTxt}>Cargando ubicación…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={s.overlay}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={52} color="#444" />
          <Text style={s.overlayTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.retryTxt}>Volver</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <View style={s.mapWrap}>
          <LeafletMapView
            ref={mapRef}
            mode="visited"
            sedes={leafletSedes}
            initialCenter={initialCenter}
            initialZoom={DELTA_ZOOM}
            interactive
            style={StyleSheet.absoluteFillObject}
          />

          {/* Attribution */}
          <View style={s.attribution}>
            <Text style={s.attributionTxt}>{OSMConfig.attribution}</Text>
          </View>

          {/* Legend */}
          <View style={s.legend}>
            <View style={s.legendDot} />
            <Text style={s.legendTxt}>{name}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center' },
  headerMid:    { flex: 1 },
  headerTitle:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub:    { color: '#f05b22', fontSize: 11, fontWeight: '600', marginTop: 1 },
  headerRight:  { width: 40 },
  overlay:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 40 },
  overlayTxt:   { color: '#555', fontSize: 14, textAlign: 'center' },
  retryBtn:     { backgroundColor: '#f05b22', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryTxt:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  mapWrap:      { flex: 1, position: 'relative' },
  attribution:  { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  attributionTxt: { color: '#aaa', fontSize: 9 },
  legend:       { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A0A0A', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#f05b22' },
  legendDot:    { width: 12, height: 12, borderRadius: 6, backgroundColor: '#f05b22' },
  legendTxt:    { color: '#fff', fontSize: 13, fontWeight: '700' },
});
