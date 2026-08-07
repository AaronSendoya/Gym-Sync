import { useState, useEffect, useCallback, useMemo } from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Dimensions, Platform, Linking, RefreshControl, Alert, Image} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AlertaBanner } from '../alertas/AlertaBanner';
import { useNavigation } from '@react-navigation/native';
import { SedeConDistancia } from '@gymsync/core';
import { GeolocationModule } from '../../../app/Providers/GeolocationModule.container';
import { useMapScreenStore } from '../../../app/Http/Controllers/geolocation/MapScreen.Controller';
import { useFilterStore } from '../../../app/Providers/geolocation/stores/FilterStore';
import { useAuth } from '../../../app/Shared/hooks/useAuth';
import { useMyReservationsQuery } from '../../../app/Providers/reservations/hooks/useMyReservationsQuery';
import { UserReservation } from '../../../app/Providers/reservations/api/reservation.types';
import { ManagerDashboard }    from './ManagerDashboard';
import { TrainerDashboard }    from './TrainerDashboard';
import { InstructorDashboard } from './InstructorDashboard';
import { NutritionistDashboard } from './NutritionistDashboard';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.36;

const GALLERY_ICONS: Array<{ icon: string; color: string; label: string }> = [
  { icon: 'run', color: '#f05b22', label: 'Running' },
  { icon: 'bike', color: '#f05b22', label: 'Ciclismo' },
  { icon: 'yoga', color: '#f05b22', label: 'Yoga' },
  { icon: 'rowing', color: '#f05b22', label: 'Remo' },
  { icon: 'weight-lifter', color: '#f05b22', label: 'Pesas' },
  { icon: 'swim', color: '#f05b22', label: 'Natación' },
  { icon: 'basketball', color: '#f05b22', label: 'Basket' },
  { icon: 'kabaddi', color: '#f05b22', label: 'MMA' },
];


const ph = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  title:  { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub:    { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});


const ACTIVE_STATUS = new Set(['CONFIRMADA', 'CONFIRMED', 'PENDIENTE']);

function findUpcomingReservation(reservations: UserReservation[]): UserReservation | undefined {
  const now        = new Date();
  const today      = now.toISOString().split('T')[0];
  const in3h       = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  return reservations.find(r => {
    if (!ACTIVE_STATUS.has(r.status ?? '')) return false;
    if (r.reservationDate !== today)         return false;
    if (!r.startTime)                        return false;

    const [h, m] = r.startTime.split(':').map(Number);
    const start  = new Date();
    start.setHours(h, m, 0, 0);

    return start >= now && start <= in3h;
  });
}

const NextReservationBanner = ({ onBuscar }: { onBuscar: () => void }) => {
  const { data: reservationsData } = useMyReservationsQuery();
  const reservations = useMemo(
    () => reservationsData?.pages.flatMap(p => p.data) ?? [],
    [reservationsData],
  );

  const next = useMemo(() => findUpcomingReservation(reservations), [reservations]);

  const handleGetDirections = () => {
    const q   = encodeURIComponent(next?.gymName ?? 'GymSync');
    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?q=${q}`
      : `https://maps.google.com/?q=${q}`;
    Linking.openURL(url).catch(() => {});
  };

  const timeLabel = useMemo(() => {
    if (!next?.startTime) return '';
    const [h, m] = next.startTime.split(':').map(Number);
    const start  = new Date();
    start.setHours(h, m, 0, 0);
    const diffMin = Math.round((start.getTime() - Date.now()) / 60000);
    if (diffMin <= 0)  return 'Ahora';
    if (diffMin < 60)  return `En ${diffMin} min`;
    return `En ${Math.floor(diffMin / 60)}h ${diffMin % 60}min`;
  }, [next]);

  if (!next) {
    // Sin reserva próxima → botón original
    return (
      <TouchableOpacity style={styles.actionBtn} onPress={onBuscar}>
        <Text style={styles.actionBtnText}>Buscar Clases Disponibles</Text>
        <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={nb.card}>
      {/* Badge superior */}
      <View style={nb.topRow}>
        <View style={nb.badge}>
          <MaterialCommunityIcons name="clock-fast" size={12} color="#f05b22" />
          <Text style={nb.badgeText}>Próxima clase · {timeLabel}</Text>
        </View>
        <View style={nb.statusBadge}>
          <Text style={nb.statusText}>{next.status}</Text>
        </View>
      </View>

      {/* Nombre actividad */}
      <Text style={nb.activityName} numberOfLines={1}>
        {next.activityName ?? 'Clase programada'}
      </Text>

      {/* Horario */}
      <View style={nb.infoRow}>
        <MaterialCommunityIcons name="clock-outline" size={14} color="#f05b22" />
        <Text style={nb.infoText}>
          {next.startTime ?? '—'}{next.endTime ? ` – ${next.endTime}` : ''}
        </Text>
      </View>

      {/* Instructor */}
      {!!next.instructorName && (
        <View style={nb.infoRow}>
          <MaterialCommunityIcons name="account-tie-outline" size={14} color="#f05b22" />
          <Text style={nb.infoText}>{next.instructorName}</Text>
        </View>
      )}

      {/* Sucursal */}
      {!!next.gymName && (
        <View style={nb.infoRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color="#f05b22" />
          <Text style={nb.infoText} numberOfLines={1}>{next.gymName}</Text>
        </View>
      )}

      {/* Fecha */}
      <View style={nb.infoRow}>
        <MaterialCommunityIcons name="calendar-outline" size={14} color="#555" />
        <Text style={[nb.infoText, { color: '#555' }]}>{next.reservationDate}</Text>
      </View>

      {/* Divider */}
      <View style={nb.divider} />

      {/* Botón cómo llegar */}
      <TouchableOpacity style={nb.directionsBtn} onPress={handleGetDirections} activeOpacity={0.8}>
        <MaterialCommunityIcons name="navigation-outline" size={16} color="#fff" />
        <Text style={nb.directionsBtnText}>Cómo llegar</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Dashboard del cliente

const ClientDashboard = () => {
  const navigation = useNavigation<any>();
  const { user }   = useAuth();
  const p          = (user as any)?.profile;
  const firstName  = p?.firstName ?? '';
  const lastName   = p?.lastName  ?? '';
  const fullName   = firstName || lastName
    ? `${firstName}${lastName ? ' ' + lastName : ''}`.trim()
    : (user as any)?.email?.split('@')[0] ?? 'GymSync';

  const [sedes, setSedes] = useState<SedeConDistancia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorType, setErrorType] = useState<'permission' | 'network' | null>(null);

  const fetchSedes = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setErrorType(null);
    try {
      const { obtenerSedesCercanasUseCase } = GeolocationModule.provideUseCases();
      const result = await obtenerSedesCercanasUseCase.execute({ maxResultados: 10, radioKm: 10 });
      if (result.isRight()) {
        setSedes(result.value.sedes);
      } else {
        const code = (result.value as any)?.code ?? '';
        if (code === 'PERMISO_DENEGADO' || code === 'GPS_DESACTIVADO') {
          setErrorType('permission');
        } else {
          setErrorType('network');
        }
      }
    } catch (e) {
      console.warn('[InicioScreen] Error fetching sedes:', (e as Error)?.message);
      setErrorType('network');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSedes();
  }, [fetchSedes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSedes(true);
  };

  const getRandomColor = (index: number) => {
    const colors = ['#1a1a2e', '#162447', '#1b1b2f', '#0f3460', '#1c1c1e'];
    return colors[index % colors.length];
  };

  const getIconForGym = (servicios: string[]) => {
    if (!servicios || servicios.length === 0) return 'dumbbell';
    const s = servicios[0].toLowerCase();
    if (s.includes('crossfit')) return 'arm-flex';
    if (s.includes('yoga')) return 'yoga';
    if (s.includes('natación') || s.includes('pileta')) return 'swim';
    if (s.includes('boxeo')) return 'boxing-glove';
    return 'dumbbell';
  };

  const handleSedePress = (sede: any) => {
    navigation.navigate('Buscar', {
      screen: 'Mapa',
      params: { focusSedeId: `${sede.id.value}-${Date.now()}` },
    });
  };

  const handleDisciplinaPress = (disciplina: string) => {
    // Mapa de sinónimos para conectar los botones de la UI con los datos reales del backend
    const keywordMap: Record<string, string[]> = {
      'Running': ['running', 'cardio', 'caminadora', 'trotadora'],
      'Ciclismo': ['ciclismo', 'spinning', 'bicicleta', 'cardio'],
      'Yoga': ['yoga', 'pilates', 'estiramiento'],
      'Remo': ['remo', 'cardio', 'crossfit'],
      'Pesas': ['pesas', 'musculación', 'crossfit', 'funcional', 'halterofilia', 'fuerza'],
      'Natación': ['natación', 'piscina', 'pileta', 'acuático'],
      'Basket': ['basket', 'baloncesto', 'cancha', 'deportes'],
      'MMA': ['mma', 'artes marciales', 'boxeo', 'karate', 'taekwondo', 'judo', 'combate'],
      'Gimnasia': ['gimnasia', 'zumba', 'baile', 'aeróbicos', 'cardio'],
    };

    const searchTerms = keywordMap[disciplina] || [disciplina.toLowerCase()];

    const sedeEncontrada = sedes.find(item => {
      if (!item.sede.servicios) return false;
      return item.sede.servicios.some(servicio =>
        searchTerms.some(term => servicio.toLowerCase().includes(term))
      );
    });

    if (sedeEncontrada) {
      useMapScreenStore.setState({ isListView: true });
      const matchedService = sedeEncontrada.sede.servicios?.find(s => searchTerms.some(term => s.toLowerCase().includes(term)));

      if (matchedService) {
         useFilterStore.getState().setFiltros({ servicios: [matchedService as any] });
      } else {
         useFilterStore.getState().resetFiltros();
      }

      navigation.navigate('Buscar');
    } else {
      Alert.alert(
        'Disciplina no disponible',
        `Lo sentimos, por el momento no hay marcas cercanas que ofrezcan ${disciplina}. ¡Prueba con otra opción!`,
        [{ text: 'Entendido', style: 'default' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f05b22"
            colors={['#f05b22']}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Bienvenido,</Text>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{fullName}</Text>
          </View>
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => {
              useMapScreenStore.setState({ isListView: true });
              navigation.navigate('Buscar');
            }}
          >
            <MaterialCommunityIcons name="magnify" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Alerta de salud (banner automático) ── */}
        <AlertaBanner />

        {/* ── Tu próxima actividad — lo más urgente y personal, primero ──
            Antes vivía al fondo de la pantalla, dentro de la tarjeta de info;
            se promueve aquí porque es el dato más time-sensitive para un
            usuario que vuelve a abrir la app (su próxima clase en curso). */}
        <View style={styles.nextActivityWrap}>
          <NextReservationBanner onBuscar={() => navigation.navigate('Buscar')} />
        </View>

        {/* ── Gimnasios cerca de ti ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconRow}>
            <Image source={require('../../../assets/pesa_icon.png')} style={{ width: 45, height: 28 }} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.sectionTitle}>Sucursales cercanas</Text>
              <Text style={styles.sectionSubtitle}>Basado en tu ubicación actual</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => {
            useMapScreenStore.setState({ isListView: true });
            navigation.navigate('Buscar');
          }}>
            <Text style={styles.seeAllText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <DumbbellSpinner size="small" color="#f05b22" />
            <Text style={styles.loadingText}>Buscando marcas...</Text>
          </View>
        ) : errorType === 'permission' ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>Permiso de ubicación requerido</Text>
            <Text style={styles.emptySubText}>
              Activa los permisos de ubicación en la configuración del dispositivo para ver sucursales cercanas.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.retryBtnText}>Abrir configuración</Text>
            </TouchableOpacity>
          </View>
        ) : errorType === 'network' ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="wifi-off" size={48} color="#444" />
            <Text style={styles.emptyText}>Sin conexión</Text>
            <Text style={styles.emptySubText}>
              No se pudo conectar al servidor. Verifica tu conexión a internet e intenta de nuevo.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => onRefresh()}>
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : sedes.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No hay sucursales en un radio de 10 km.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => onRefresh()}>
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={sedes}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.sede.id.value.toString()}
            contentContainerStyle={styles.carouselContainer}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={styles.gymCard}
                activeOpacity={0.8}
                onPress={() => handleSedePress(item.sede)}
              >
                <View style={[styles.gymCardImage, { backgroundColor: getRandomColor(index) }]}>
                  <MaterialCommunityIcons name={getIconForGym(item.sede.servicios) as any} size={48} color="#fff" />
                  <View style={styles.distanceBadge}>
                    <Text style={styles.distanceText}>
                      {item.distancia?.kmCorta ?? 'N/A'}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardInfo}>
                  {item.sede.parentName ? (
                    <Text style={styles.gymBrand} numberOfLines={1}>{item.sede.parentName}</Text>
                  ) : null}
                  <Text style={styles.gymName} numberOfLines={1}>{item.sede.nombre}</Text>
                  <View style={styles.ratingRow}>
                    <MaterialCommunityIcons name="star" size={14} color="#f05b22" />
                    {/* TODO: Requerir rating al backend */}
                    <Text style={styles.ratingText}>{item.sede.rating != null ? item.sede.rating : '-'}</Text>
                    <Text style={styles.capacityText}>•</Text>
                    <MaterialCommunityIcons name="account" size={11} color="#666" />
                    <Text style={styles.capacityText}>
                      {(item.sede as any).aforoActual ?? 0}/{(item.sede as any).aforoMax ?? 0}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* ══ GRUPO 1: Actividad Física (naranja) ══ */}
        <View style={styles.groupLabel}>
          <View style={styles.groupIconWrap}>
            <Image source={require('../../../assets/sneakers_icon.png')} style={styles.groupIconImg} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupLabelTitle, { color: '#ffffff' }]}>Actividad Física</Text>
            <Text style={styles.groupLabelSub}>Entrena y revisa lo que has hecho</Text>
          </View>
        </View>

        {/* Iniciar Entrenamiento — ancho completo */}
        <TouchableOpacity
          style={[styles.historialBtn, { borderColor: '#f05b2228', marginTop: 6 }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('WorkoutMode')}
        >
          <View style={styles.historialBtnLeft}>
            <View style={[styles.historialBtnIcon, { backgroundColor: '#f05b221a' }]}>
              <MaterialCommunityIcons name="play-circle-outline" size={20} color="#f05b22" />
            </View>
            <View>
              <Text style={styles.historialBtnTitle}>Iniciar Entrenamiento</Text>
              <Text style={styles.historialBtnSub}>Registra tu sesión activa ahora</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#f05b2266" />
        </TouchableOpacity>

        {/* Historial — dos cuadrados lado a lado */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, marginTop: 12, gap: 12 }}>
          <TouchableOpacity
            style={[styles.squareBtn, { borderColor: '#f05b2228' }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('WorkoutHistory')}
          >
            <View style={[styles.historialBtnIcon, { backgroundColor: '#f05b221a' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={22} color="#f05b22" />
            </View>
            <Text style={styles.squareBtnTitle}>Historial de{'\n'}Entrenamientos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.squareBtn, { borderColor: '#f05b2228' }]}
            activeOpacity={0.8}
            onPress={() => (navigation as any).navigate('GymHistorial')}
          >
            <View style={[styles.historialBtnIcon, { backgroundColor: '#f05b221a' }]}>
              <MaterialCommunityIcons name="history" size={22} color="#f05b22" />
            </View>
            <Text style={styles.squareBtnTitle}>Historial de{'\n'}Gimnasios</Text>
          </TouchableOpacity>
        </View>

        {/* ══ GRUPO 2: Tu Progreso (verde) ══ */}
        <View style={[styles.groupLabel, { marginTop: 28 }]}>
          <View style={styles.groupIconWrap}>
            <Image source={require('../../../assets/progreso_icon.png')} style={styles.groupIconImg} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupLabelTitle, { color: '#ffffff' }]}>Tu Progreso</Text>
            <Text style={styles.groupLabelSub}>Visualiza cómo estás mejorando con el tiempo</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.historialBtn, { borderColor: '#f05b2228', marginTop: 6 }]}
          activeOpacity={0.8}
          onPress={() => (navigation as any).navigate('CuadroDeMando')}
        >
          <View style={styles.historialBtnLeft}>
            <View style={[styles.historialBtnIcon, { backgroundColor: '#f05b221a' }]}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="#f05b22" />
            </View>
            <View>
              <Text style={styles.historialBtnTitle}>Mi Evolución Física</Text>
              <Text style={styles.historialBtnSub}>Línea de tiempo de tu progreso</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#f05b2266" />
        </TouchableOpacity>

        {/* ══ GRUPO 3: ¿Necesitas orientación? (celeste) ══ */}
        <View style={[styles.groupLabel, { marginTop: 28 }]}>
          <View style={styles.groupIconWrap}>
            <Image source={require('../../../assets/experto_icon.png')} style={styles.groupIconImg} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupLabelTitle, { color: '#ffffff' }]}>¿Necesitas orientación?</Text>
            <Text style={styles.groupLabelSub}>Un asesor puede guiarte y diseñar tu plan</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.historialBtn, { borderColor: '#f05b2228', marginTop: 6 }]}
          activeOpacity={0.8}
          onPress={() => (navigation as any).navigate('StaffCatalog')}
        >
          <View style={styles.historialBtnLeft}>
            <View style={[styles.historialBtnIcon, { backgroundColor: '#f05b221a' }]}>
              <MaterialCommunityIcons name="account-search-outline" size={20} color="#f05b22" />
            </View>
            <View>
              <Text style={styles.historialBtnTitle}>Catálogo de Asesores</Text>
              <Text style={styles.historialBtnSub}>Encuentra tu entrenador personalizado</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#f05b2266" />
        </TouchableOpacity>

        {/* ── Explora Disciplinas ── */}
        <View style={styles.onboardSection}>
          <View style={styles.sectionIconRow}>
            <Text style={[styles.sectionTitle, { marginLeft: 10 }]}>
              Explora Disciplinas
            </Text>
          </View>

          {/* Gallery grid */}
          <View style={styles.galleryGrid}>
            {GALLERY_ICONS.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.galleryItem}
                activeOpacity={0.7}
                onPress={() => handleDisciplinaPress(item.label)}
              >
                <MaterialCommunityIcons name={item.icon as any} size={28} color={item.color} />
                <Text style={styles.galleryLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Info card */}
          <View style={styles.infoCard}>
            <View style={styles.infoContent}>
              <MaterialCommunityIcons name="information-outline" size={20} color="#f05b22" />
              <Text style={styles.infoText}>
                Agenda clases en cualquiera de las marcas afiliadas, observa tu progreso y
                no pierdas de vista tu bienestar.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Enrutador exclusivo Staff (ENTRENADOR / INSTRUCTOR / NUTRICIONISTA) ─────

export const StaffInicioScreen = () => {
  const { user } = useAuth();
  const level = (user as any)?.level ?? 0;

  if (level === 2) return <InstructorDashboard />;
  if (level >= 3) return <TrainerDashboard />;
  return (
    <SafeAreaView style={ph.safe} edges={['top']}>
      <View style={ph.center}>
        <MaterialCommunityIcons name="shield-off-outline" size={48} color="#444" />
        <Text style={ph.title}>Dashboard no disponible</Text>
      </View>
    </SafeAreaView>
  );
};

// ─── Enrutador general (Gerente + Cliente) ────────────────────────────────────

export const InicioScreen = () => {
  const { user } = useAuth();
  const level = (user as any)?.level ?? 0;

  if (level >= 5) return <ManagerDashboard />;

  if (level >= 1) return <ClientDashboard />;

  return <ClientDashboard />;
};

// ─── Estilos del ClientDashboard ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  nextActivityWrap: {
    paddingHorizontal: 20,
  },
  welcomeText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '500',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: -4,
  },
  searchBtn: {
    backgroundColor: '#1c1c1e',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 2,
  },
  seeAllText: {
    color: '#f05b22',
    fontSize: 14,
    fontWeight: 'bold',
  },
  carouselContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 15,
  },
  gymCard: {
    width: CARD_WIDTH,
  },
  gymCardImage: {
    width: '100%',
    height: CARD_WIDTH * 0.8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  distanceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  distanceText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardInfo: {
    paddingHorizontal: 4,
  },
  gymBrand: {
    fontSize: 10,
    color: '#f05b22aa',
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  gymName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  gymAddress: {
    fontSize: 10,
    color: '#666',
    marginTop: 3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  capacityText: {
    fontSize: 10,
    color: '#666',
  },
  loadingState: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    marginTop: 10,
    fontSize: 14,
  },
  emptyState: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#444',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
  emptySubText: {
    color: '#333',
    textAlign: 'center',
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  retryBtn: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 15,
  },
  retryBtnText: {
    color: '#f05b22',
    fontWeight: 'bold',
  },
  historialBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  historialBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historialBtnIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historialBtnTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  historialBtnSub: {
    color: '#555',
    fontSize:14,
    marginTop: 2,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 6,
  },
  // Contenedor de tamaño fijo para los íconos PNG de cada grupo — antes cada
  // Image tenía sus propias dimensiones (30x15, 27x27, 30x30), lo que rompía
  // la alineación vertical entre secciones. Todos ahora ocupan el mismo footprint.
  groupIconWrap: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupIconImg: {
    width: 32,
    height: 32,
  },
  groupLabelTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  groupLabelSub: {
    color: '#5d5d5d',
    fontSize: 15,
    marginTop: 1,
  },
  squareBtn: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  squareBtnTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  onboardSection: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    gap: 10,
  },
  galleryItem: {
    width: (width - 40 - 30) / 4,
    height: 80,
    backgroundColor: '#1C1C1E',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  galleryLabel: {
    color: '#666',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  infoContent: {
    flexDirection: 'row',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#999',
    lineHeight: 22,
  },
  actionBtn: {
    backgroundColor: '#f05b22',
    borderRadius: 15,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

// ─── Estilos del NextReservationBanner ───────────────────────────────────────
const nb = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: '#0d0d0d',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    borderLeftWidth: 3,
    borderLeftColor: '#f05b22',
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#f05b22',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#00E5A3',
  },
  statusText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activityName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e1e1e',
    marginVertical: 4,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f05b22',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  directionsBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
