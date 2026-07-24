import React, { useRef, useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFilterStore } from '../../../../app/Providers/geolocation/stores/FilterStore';
import { SedeInfoModalView } from '../SedeInfoModal/SedeInfoModal.view';
import { SedesCatalog } from '../SedesCatalog/SedesCatalog.view';
import { LoadingOverlay } from '../UI/LoadingOverlay/LoadingOverlay.component';
import { ErrorMessage } from '../UI/ErrorMessage/ErrorMessage.component';
import { FilterBottomSheet } from '../UI/FilterBottomSheet/FilterBottomSheet.component';
import { GPSReCenterButton } from '../UI/GPSReCenterButton/GPSReCenterButton.component';
import { Toast } from '../UI/Toast/Toast.component';
import { Coordenadas } from '@gymsync/core';
import { SedeConDistancia } from '@gymsync/core';
import { Sede } from '@gymsync/core';
import { OSMConfig } from '../../../../app/Providers/geolocation/config/osm.config';
import { styles } from './MapScreen.styles';
import { useAuth } from '../../../../app/Shared/hooks/useAuth';
import {
  LeafletMapView,
  LeafletMapHandle,
  LeafletSede,
} from '../../../../app/Providers/geolocation/components/LeafletMap/LeafletMapView';

type MapScreenViewProps = {
  userLocation:    Coordenadas | null;
  sedes:           SedeConDistancia[];
  selectedSede:    Sede | null;
  loading:         boolean;
  error:           string | null;
  isListView:      boolean;
  focusSedeId?:    string | number | null;
  onToggleListView: () => void;
  onMarkerPress:   (sede: Sede) => void;
  onModalClose:    () => void;
  onNavigate:      (sede: Sede) => void;
  onReserve:       (sede: Sede) => void;
  onRetry:         () => void;
  onBack:          () => void;
};

export const MapScreenView: React.FC<MapScreenViewProps> = ({
  userLocation,
  sedes,
  selectedSede,
  loading,
  error,
  isListView,
  focusSedeId,
  onToggleListView,
  onMarkerPress,
  onModalClose,
  onNavigate,
  onReserve,
  onRetry,
  onBack,
}) => {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();
  const isGerente = ((user as any)?.level ?? 0) >= 5;

  const mapRef = useRef<LeafletMapHandle>(null);

  const [filterVisible, setFilterVisible] = useState(false);
  const [toastConfig, setToastConfig]     = useState<{ message: string; type: 'error' | 'success'; key: number } | null>(null);

  useEffect(() => {
    if (selectedSede?.coordenadas && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.flyTo(selectedSede.coordenadas.latitude, selectedSede.coordenadas.longitude, 16);
      }, 400);
    }
  }, [selectedSede?.id?.value]);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToastConfig({ message, type, key: Date.now() });
    setTimeout(() => setToastConfig(null), 3500);
  };

  const { filtros, toggleServicio, toggleBeneficio, toggleMarca } = useFilterStore();

  const activeFiltersCount =
    (filtros.servicios?.length || 0) +
    (filtros.beneficios?.length || 0) +
    (filtros.marcas?.length    || 0);

  const marcasDisponibles = useMemo(() =>
    [...new Set(sedes.map(s => s.sede.parentName).filter((n): n is string => !!n))].sort(),
    [sedes],
  );

  // Map SedeConDistancia[] → LeafletSede[]
  const leafletSedes: LeafletSede[] = useMemo(() =>
    sedes
      .filter(({ sede }) => {
        const lat = sede.coordenadas?.latitude;
        const lng = sede.coordenadas?.longitude;
        return lat && lng && !(lat === 0 && lng === 0);
      })
      .map(({ sede, distancia }) => ({
        id:                sede.id.value,
        nombre:            sede.nombre,
        lat:               sede.coordenadas.latitude,
        lng:               sede.coordenadas.longitude,
        distancia:         distancia.kmCorta,
        aforoActual:       sede.aforo?.actual       ?? 0,
        aforoMaximo:       sede.aforo?.maximo        ?? 0,
        capacidadMaquinas: sede.capacidadMaquinas   ?? 0,
        isClosed:          !sede.estaAbierta,
        isAvailable:       sede.estaDisponible,
      })),
    [sedes],
  );

  const leafletUserLocation = useMemo(() =>
    userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null,
    [userLocation],
  );

  const center = userLocation
    ? { lat: userLocation.latitude,  lng: userLocation.longitude }
    : { lat: OSMConfig.defaults.initialRegion.latitude, lng: OSMConfig.defaults.initialRegion.longitude };

  const handleReCenter = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo(userLocation.latitude, userLocation.longitude, 15);
    } else {
      const msg = error?.toLowerCase().includes('red') || error?.toLowerCase().includes('internet')
        ? 'No hay conexión a internet para triangular tu área actual.'
        : 'No se puede acceder a tu ubicación. Verifica tus permisos de GPS.';
      showToast(msg, 'error');
    }
  };

  const handleSelectSedeFromCatalog = (sede: Sede) => {
    onMarkerPress(sede);
    onToggleListView();
    setTimeout(() => {
      if (mapRef.current && sede.coordenadas) {
        mapRef.current.flyTo(sede.coordenadas.latitude, sede.coordenadas.longitude, 15);
      }
    }, 300);
  };

  const handleWebViewMarkerPress = (sedeId: string | number) => {
    const found = sedes.find(s => String(s.sede.id.value) === String(sedeId));
    if (found) onMarkerPress(found.sede);
  };

  const selectedSedeDistancia = selectedSede
    ? sedes.find(s => s.sede.id.value === selectedSede.id.value)?.distancia
    : null;

  if (loading && sedes.length === 0) return <LoadingOverlay message="Buscando marcas cercanas..." />;
  if (error   && sedes.length === 0) return <ErrorMessage message={error} onRetry={onRetry} />;

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFillObject}>

        {/* Floating Header */}
        <View style={styles.headerContainer} pointerEvents="box-none">
          <View style={[styles.headerBlur, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
                <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerTextCol}>
                <Text style={styles.headerTitle}>Sucursales Cercanas</Text>
                <Text style={styles.headerSubtitle}>
                  {sedes.length} {sedes.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                </Text>
              </View>
              <TouchableOpacity style={styles.catalogBtn} onPress={onToggleListView} activeOpacity={0.8}>
                <MaterialCommunityIcons name="view-list" size={20} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {activeFiltersCount > 0 && (
              <View style={styles.activeFiltersRow}>
                {filtros.servicios?.map(s => (
                  <TouchableOpacity key={s} style={styles.activeFilterChip} onPress={() => toggleServicio(s)}>
                    <Text style={styles.activeFilterText}>{s}</Text>
                    <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                ))}
                {filtros.beneficios?.map(b => (
                  <TouchableOpacity key={b} style={styles.activeFilterChip} onPress={() => toggleBeneficio(b)}>
                    <Text style={styles.activeFilterText}>{b}</Text>
                    <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                ))}
                {filtros.marcas?.map(m => (
                  <TouchableOpacity key={m} style={styles.activeFilterChip} onPress={() => toggleMarca(m)}>
                    <Text style={styles.activeFilterText}>{m}</Text>
                    <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Leaflet Map */}
        <LeafletMapView
          ref={mapRef}
          mode="client"
          sedes={leafletSedes}
          userLocation={leafletUserLocation}
          initialCenter={center}
          initialZoom={14}
          interactive
          onMarkerPress={handleWebViewMarkerPress}
          style={styles.map}
        />

        {/* OSM Attribution */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>{OSMConfig.attribution}</Text>
        </View>

        {/* Filter FAB */}
        <TouchableOpacity style={styles.filterFab} onPress={() => setFilterVisible(true)}>
          <MaterialCommunityIcons name="filter-variant" size={24} color="#38BDF8" />
        </TouchableOpacity>

        {/* GPS Re-center FAB */}
        <GPSReCenterButton style={styles.gpsFab} onPress={handleReCenter} />

        {/* Sede Info Modal */}
        {selectedSede && selectedSedeDistancia && !isListView && (
          <SedeInfoModalView
            sede={selectedSede}
            distancia={selectedSedeDistancia}
            visible={!!selectedSede}
            onClose={() => {
              const sedeId = selectedSede.id.value;
              onModalClose();
              if (mapRef.current) mapRef.current.pulseMarker(sedeId, 4000);
            }}
            onNavigate={() => onNavigate(selectedSede)}
            onReserve={isGerente ? undefined : () => onReserve(selectedSede)}
            isAdmin={isGerente}
          />
        )}
      </View>

      {/* Catalog Overlay */}
      {isListView && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0A0A0A', zIndex: 100, elevation: 100 }]}>
          <SedesCatalog
            sedes={sedes}
            onSelectSede={handleSelectSedeFromCatalog}
            onCerrarCatalogo={onToggleListView}
          />
        </View>
      )}

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        marcasDisponibles={marcasDisponibles}
      />

      {/* Toast */}
      <Toast
        key={toastConfig?.key}
        visible={!!toastConfig}
        message={toastConfig?.message || ''}
        type={toastConfig?.type}
      />
    </View>
  );
};
