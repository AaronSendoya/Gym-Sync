import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Alert, RefreshControl, Modal, useWindowDimensions, Image} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '../theme/colors';
import { useMyReservationsQuery } from '../hooks/useMyReservationsQuery';
import { useCancelReservationMutation } from '../hooks/useCancelReservationMutation';
import { reservationApi } from '../api/reservation.api';
import { UserReservation } from '../api/reservation.types';
import { authEvents } from '../../auth/authEvents';
import { DumbbellSpinner } from '../../../Shared/components/ui/DumbbellSpinner';

const STATUS_LABEL: Record<string, string> = {
  CONFIRMADA: 'Generada',
  CONFIRMED:  'Generada',
  COMPLETADA: 'Completada',
  CANCELADA:  'Cancelada',
  CANCELLED:  'Cancelada',
  USADA:      'Completada',
  USED:       'Completada',
  PENDING:    'Pendiente',
  PENDIENTE:  'Pendiente',
  CADUCADA:   'Caducada',
};

const STATUS_COLOR: Record<string, string> = {
  CONFIRMADA: Colors.accent,
  CONFIRMED:  Colors.accent,
  COMPLETADA: '#2dce89',
  CANCELADA:  '#6B7280',
  CANCELLED:  '#6B7280',
  USADA:      '#2dce89',
  USED:       '#2dce89',
  PENDING:    '#FFB300',
  PENDIENTE:  '#FFB300',
  CADUCADA:   '#F59E0B',
};

// Grupos para filtrado
const COMPLETED_STATUSES = new Set(['COMPLETADA', 'USADA', 'USED']);
const CANCELLED_STATUSES = new Set(['CANCELADA', 'CANCELLED']);
const RECEIVED_STATUSES  = new Set(['CONFIRMADA', 'CONFIRMED', 'PENDING', 'PENDIENTE']);

const UNCANCELABLE = new Set(['CANCELADA', 'CANCELLED', 'COMPLETADA', 'USADA', 'USED', 'CADUCADA']);
const isCancelable = (r?: UserReservation | null) =>
  !!r?.canCancel && !UNCANCELABLE.has(r?.status ?? '');

const isPaid = (r?: UserReservation | null): boolean =>
  (r as any)?.paymentStatus === 'PAID' ||
  (r as any)?.isPaid === true ||
  COMPLETED_STATUSES.has(r?.status ?? '');

const payLabel = (r?: UserReservation | null) => isPaid(r) ? 'PAGADO' : 'Por pagar';
const payColor = (r?: UserReservation | null) => isPaid(r) ? Colors.accent : '#A0AEC0';

const fmt5 = (t?: string | null) => t?.substring(0, 5) ?? '—';

const CONFIRMED = new Set(['CONFIRMADA', 'CONFIRMED']);

// ─── QR dinámico con auto-refresh ────────────────────────────────────────────
const DynamicQRCode = ({
  reservationId,
  fallbackToken,
  onRef,
}: {
  reservationId: number;
  fallbackToken?: string;
  onRef?: (ref: any) => void;
}) => {
  const { width } = useWindowDimensions();
  const qrSize = Math.min(width * 0.55, 260);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qr-token', reservationId],
    queryFn:  () => reservationApi.getDynamicQRToken(reservationId),
    refetchInterval: 150_000,
    refetchIntervalInBackground: false,
    staleTime: 120_000,
    retry: 2,
  });

  const token = data?.token ?? fallbackToken ?? 'TOKEN_PENDIENTE';

  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      <QRCode
        value={token}
        size={qrSize}
        backgroundColor="#FFFFFF"
        color={isFetching ? '#AAAAAA' : '#0A0A0A'}
        getRef={onRef}
      />
      {(isLoading || isFetching) && (
        <View style={{
          position: 'absolute',
          backgroundColor: '#1C1C1E',
          width: qrSize,
          height: qrSize,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <DumbbellSpinner color="#f05b22" size="large" />
        </View>
      )}
    </View>
  );
};

type FilterStatus = '' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' | 'CADUCADA';

export const MisReservasScreen = () => {
  // Esta pantalla se registra dos veces en la navegación: como tab de Cliente
  // (sin header nativo) y como screen empujado dentro de BuscarStack para
  // Staff/Gerente (que no tienen tab propio de reservas). canGoBack() decide
  // si mostrar el botón de regreso, igual que en AuditoriaSucursalScreen.
  const navigation = useNavigation<any>();
  const [qrReservation, setQrReservation] = useState<UserReservation | null>(null);
  const qrSvgRef = useRef<any>(null);

  const exportQR = useCallback(() => {
    if (!qrSvgRef.current) {
      Alert.alert('Error', 'No se pudo acceder al código QR.');
      return;
    }
    try {
      qrSvgRef.current.toDataURL(async (data: string) => {
        try {
          // toDataURL puede devolver base64 puro o con prefijo "data:image/png;base64,"
          const base64 = data.startsWith('data:') ? data.split(',')[1] : data;
          const fileUri = `${FileSystem.cacheDirectory}qr_reserva_${qrReservation?.id ?? 'tmp'}.png`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (!canShare) {
            Alert.alert('No disponible', 'La función de compartir no está disponible en este dispositivo.');
            return;
          }
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: 'Compartir QR de reserva',
            UTI: 'public.png',
          });
        } catch {
          Alert.alert('Error', 'No se pudo guardar el QR.');
        }
      });
    } catch {
      Alert.alert('Error', 'No se pudo exportar el QR.');
    }
  }, [qrReservation]);
  
  // Polling cada 3s solo si el modal del QR está abierto
  const { data: reservationsData, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useMyReservationsQuery(qrReservation ? 3000 : undefined);
  const reservations = useMemo(() => {
    return reservationsData?.pages.flatMap(page => page.data) ?? [];
  }, [reservationsData]);
  const cancelMutation = useCancelReservationMutation();
  const queryClient    = useQueryClient();
  const [cancelingAll, setCancelingAll] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('');
  const { width: screenW } = useWindowDimensions();
  const isTablet = screenW >= 600;
  const hPad = isTablet ? Math.max(20, (screenW - 700) / 2) : 16;

  // Auto-cerrar el modal si la reserva cambia a COMPLETADA/USADA en backend
  useEffect(() => {
    if (qrReservation) {
      const updated = reservations.find(r => r.id === qrReservation.id);
      if (updated && (updated.status === 'COMPLETADA' || updated.status === 'USADA' || updated.status === 'USED')) {
        setQrReservation(null);
        Alert.alert('Ingreso Confirmado', 'Tu código ha sido escaneado exitosamente. ¡Buen entrenamiento!');
      }
    }
  }, [reservations, qrReservation]);

  const handleCancelOne = (id?: number) => {
    if (!id) return;
    Alert.alert('Cancelar reserva', '¿Confirmas la cancelación?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelMutation.mutate(id) },
    ]);
  };

  const handleCancelAll = () => {
    const targets = reservations.filter(isCancelable);
    if (targets.length === 0) {
      Alert.alert('Sin reservas activas', 'No hay nada que cancelar.');
      return;
    }
    Alert.alert('Cancelar todo', `Se cancelarán ${targets.length} reserva(s). ¿Continuar?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar todo',
        style: 'destructive',
        onPress: async () => {
          setCancelingAll(true);
          const results = await Promise.allSettled(
            targets.map((r) =>
              r?.id ? reservationApi.cancelReservation(r.id) : Promise.reject(new Error('Sin id')),
            ),
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          await queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
          setCancelingAll(false);
          if (failed > 0) {
            Alert.alert(
              'Cancelación parcial',
              `${failed} de ${targets.length} reserva(s) no se pudieron cancelar.`,
            );
          } else {
            Alert.alert('Listo', 'Reservas canceladas.');
          }
        },
      },
    ]);
  };

  if (isLoading) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <DumbbellSpinner size="large" color={Colors.primary} />
        <Text style={s.soft}>Cargando reservas…</Text>
      </View>
    </SafeAreaView>
  );

  if (error) {
    const isForbidden = (error as any)?.isForbidden === true;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <MaterialCommunityIcons name={isForbidden ? 'lock-outline' : 'wifi-off'} size={48} color={Colors.textSoft} />
          <Text style={s.soft}>
            {isForbidden
              ? 'Tu cuenta no tiene permisos para ver reservas.'
              : 'No se pudieron cargar las reservas.'}
          </Text>
          {isForbidden ? (
            <TouchableOpacity style={[s.retryBtn, { borderColor: Colors.danger }]} onPress={() => authEvents.emitForceLogout()}>
              <Text style={[s.retryTxt, { color: Colors.danger }]}>Cerrar sesión</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
              <Text style={s.retryTxt}>Reintentar</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const visible = reservations.filter(r => {
    const st = r?.status ?? '';
    if (filterStatus === 'CONFIRMADA' && !RECEIVED_STATUSES.has(st))  return false;
    if (filterStatus === 'COMPLETADA' && !COMPLETED_STATUSES.has(st)) return false;
    if (filterStatus === 'CANCELADA'  && !CANCELLED_STATUSES.has(st)) return false;
    if (filterStatus === 'CADUCADA'   && (st as string) !== 'CADUCADA') return false;
    if (!filterStatus && (CANCELLED_STATUSES.has(st) || COMPLETED_STATUSES.has(st))) return false;
    return true;
  });
  const hasActive = visible.some(isCancelable);

  const STATUS_CHIPS: { status: FilterStatus; label: string }[] = [
    { status: '',           label: 'Todas' },
    { status: 'CONFIRMADA', label: 'Generadas' },
    { status: 'COMPLETADA', label: 'Completadas' },
    { status: 'CANCELADA',  label: 'Canceladas' },
    { status: 'CADUCADA',   label: 'Caducadas' },
  ];

  const FilterChips = () => {
    const items = STATUS_CHIPS.map(f => (
      <TouchableOpacity
        key={f.status || 'all'}
        onPress={() => setFilterStatus(f.status)}
        style={[s.chip, filterStatus === f.status && s.chipActive]}
        activeOpacity={0.7}
      >
        <Text style={[s.chipTxt, filterStatus === f.status && s.chipTxtActive]}>{f.label}</Text>
      </TouchableOpacity>
    ));
    if (isTablet) {
      return (
        <View style={[s.chipsRowTablet, { paddingHorizontal: hPad }]}>
          {items}
        </View>
      );
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        style={s.chipsScroll}
      >
        {items}
      </ScrollView>
    );
  };

  const EmptyState = () => (
    <View style={s.center}>
      <Image source={require('../../../../assets/reserve_icon.png')} style={{ width: 100, height: 100, resizeMode: 'contain' }} />
      <Text style={s.emptyTitle}>
        {filterStatus ? 'Sin resultados para este filtro' : 'Aún no tienes reservas activas'}
      </Text>
      <Text style={s.soft}>
        {filterStatus ? 'Prueba cambiando los filtros.' : 'Ve al mapa y reserva tu primer cupo.'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Modal QR ── */}
      <Modal
        visible={!!qrReservation}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setQrReservation(null)}
      >
        <View style={s.qrBackdrop}>
          <View style={s.qrSheet}>
            {/* Cabecera */}
            <View style={s.qrHeader}>
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={22} color={Colors.primary} />
              <Text style={s.qrTitle}>Pase de Acceso</Text>
              <TouchableOpacity onPress={() => setQrReservation(null)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={Colors.textSoft} />
              </TouchableOpacity>
            </View>

            {/* Nombre actividad */}
            <Text style={s.qrActName} numberOfLines={1}>
              {qrReservation?.activityName ?? '—'}
            </Text>
            <Text style={s.qrDate}>
              {qrReservation?.reservationDate ?? '—'}
              {'  Â·  '}
              {fmt5(qrReservation?.startTime)} – {fmt5(qrReservation?.endTime)}
            </Text>

            {/* QR dinámico — se renueva cada 2.5 min */}
            <View style={s.qrBox}>
              {qrReservation?.id != null && (
                <DynamicQRCode
                  reservationId={qrReservation.id}
                  fallbackToken={qrReservation.qrToken}
                  onRef={(ref) => { qrSvgRef.current = ref; }}
                />
              )}
            </View>

            <Text style={s.qrHint}>Muestra este código al ingreso de la marca.</Text>

            <TouchableOpacity style={s.exportBtn} onPress={exportQR} activeOpacity={0.8}>
              <MaterialCommunityIcons name="download" size={16} color={Colors.text} />
              <Text style={s.exportTxt}>Exportar imagen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.qrCloseBtn} onPress={() => setQrReservation(null)} activeOpacity={0.8}>
              <Text style={s.qrCloseTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cabecera: título + acción destructiva secundaria en la misma fila ──
          Antes la pantalla no tenía título propio (dependía solo del label del
          tab) y "Cancelar todo" aparecía solo, en su propia barra, como si
          fuera la primera acción de la pantalla. */}
      <View style={[s.headerRow, { paddingHorizontal: hPad }]}>
        <View style={s.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={Colors.text} />
            </TouchableOpacity>
          )}
          <Text style={s.pageTitle}>Mis Reservas</Text>
        </View>
        {hasActive && (
          <TouchableOpacity
            style={[s.cancelAllBtn, cancelingAll && s.disabledOpacity]}
            onPress={handleCancelAll}
            disabled={cancelingAll}
            activeOpacity={0.8}
          >
            {cancelingAll ? (
              <DumbbellSpinner size="small" color={Colors.danger} />
            ) : (
              <>
                <MaterialCommunityIcons name="calendar-remove" size={16} color={Colors.danger} />
                <Text style={s.cancelAllTxt}>Cancelar todo</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* ── Chips de filtro ── */}
      <FilterChips />

      <FlatList
        data={visible}
        keyExtractor={(item, index) => String(item?.id ?? index)}
        contentContainerStyle={[s.scroll, { paddingHorizontal: hPad }, visible.length === 0 && { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        renderItem={({ item: r }) => (
          <ReservationCard
            r={r}
            onCancel={isCancelable(r) ? () => handleCancelOne(r?.id) : undefined}
            onShowQr={CONFIRMED.has(r?.status ?? '') ? () => setQrReservation(r) : undefined}
          />
        )}
        ListEmptyComponent={<EmptyState />}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? <DumbbellSpinner size="small" color="#FF6B00" style={{ marginVertical: 15 }} /> : <View style={{ height: 40 }} />
        }
      />
    </SafeAreaView>
  );
};

const ReservationCard = ({
  r,
  onCancel,
  onShowQr,
}: {
  r?: UserReservation | null;
  onCancel?: () => void;
  onShowQr?: () => void;
}) => {
  const status      = r?.status ?? '';
  const statusColor = STATUS_COLOR[status] ?? Colors.textSoft;
  const pColor      = payColor(r);
  const isFree      = r?.isFreeAccess === true;

  // Formatear createdAt amigable
  const createdLabel = r?.createdAt
    ? (() => {
        try {
          const d = new Date(r.createdAt);
          return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        } catch { return r.createdAt; }
      })()
    : null;

  return (
    <View style={s.card}>

      {/* ── Cabecera: nombre + badges ── */}
      <View style={s.cardTop}>
        <View style={s.cardMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={s.actName} numberOfLines={1}>{r?.activityName ?? '—'}</Text>
            <View style={[isFree ? s.tagFree : s.tagSched, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <MaterialCommunityIcons
                name={isFree ? 'lock-open-variant-outline' : 'calendar-check-outline'}
                size={11}
                color={isFree ? '#00E5A3' : '#38BDF8'}
              />
              <Text style={isFree ? s.tagFreeTxt : s.tagSchedTxt}>
                {isFree ? 'Libre' : 'Clase'}
              </Text>
            </View>
          </View>
          {!!r?.activityDescription && (
            <Text style={s.actDesc} numberOfLines={2}>{r.activityDescription}</Text>
          )}
        </View>
        <View style={s.badges}>
          <View style={[s.badge, { borderColor: pColor, backgroundColor: '#1C1C1E' }]}>
            <Text style={[s.badgeTxt, { color: pColor }]}>{payLabel(r)}</Text>
          </View>
          <View style={[s.badge, { borderColor: statusColor, backgroundColor: '#1C1C1E' }]}>
            <Text style={[s.badgeTxt, { color: statusColor }]}>
              {STATUS_LABEL[status] ?? status ?? '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Meta: fecha ── */}
      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <MaterialCommunityIcons name="calendar" size={13} color={Colors.textSoft} />
          <Text style={s.metaTxt}>{r?.reservationDate ?? '—'}</Text>
        </View>
      </View>

      {/* ── Detalle condicional ── */}
      <View style={s.detailBox}>
        {isFree ? (
          /* LIBRE: hora de referencia elegida por el usuario */
          <View style={s.detailRow}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={14} color={Colors.secondary} />
            <Text style={s.detailTxt}>
              <Text style={s.detailLabel}>Horario de referencia: </Text>
              {fmt5(r?.startTime)} – {fmt5(r?.endTime)}
            </Text>
          </View>
        ) : (
          /* PROGRAMADA: horario del schedule + instructor */
          <>
            <View style={s.detailRow}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.secondary} />
              <Text style={s.detailTxt}>
                <Text style={s.detailLabel}>Horario: </Text>
                {fmt5(r?.startTime)} – {fmt5(r?.endTime)}
                {!!r?.dayOfWeek && <Text style={{ color: Colors.textSoft }}> Â· {r.dayOfWeek}</Text>}
              </Text>
            </View>
            {!!r?.instructorName && (
              <View style={s.detailRow}>
                <MaterialCommunityIcons name="account-tie-outline" size={14} color={Colors.secondary} />
                <Text style={s.detailTxt}>
                  <Text style={s.detailLabel}>Instructor: </Text>
                  {r.instructorName}
                </Text>
              </View>
            )}
          </>
        )}

        {/* AMBOS: sucursal */}
        <View style={s.detailRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={Colors.secondary} />
          <Text style={s.detailTxt}>
            <Text style={s.detailLabel}>Sucursal: </Text>
            {r?.gymName || 'No especificada'}
          </Text>
        </View>

        {/* AMBOS: fecha de creación */}
        {!!createdLabel && (
          <View style={s.detailRow}>
            <MaterialCommunityIcons name="clock-check-outline" size={14} color={Colors.textSoft} />
            <Text style={[s.detailTxt, { color: Colors.textSoft }]}>
              <Text style={s.detailLabel}>Creada el: </Text>
              {createdLabel}
            </Text>
          </View>
        )}

        {/* AMBOS: número del gerente de la marca */}
        <View style={s.detailRow}>
          <MaterialCommunityIcons name="phone-outline" size={14} color={Colors.secondary} />
          <Text style={s.detailTxt}>
            <Text style={s.detailLabel}>Gerente: </Text>
            {r?.gerentePhone ?? 'Número de teléfono no disponible'}
          </Text>
        </View>

        {/* SOLO programadas: número del instructor */}
        {!isFree && (
          <View style={s.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={14} color={Colors.secondary} />
            <Text style={s.detailTxt}>
              <Text style={s.detailLabel}>Instructor: </Text>
              {r?.instructorPhone ?? 'Número de teléfono no disponible'}
            </Text>
          </View>
        )}
      </View>

      {/* Botón Pase de Acceso — solo CONFIRMADA */}
      {onShowQr && (
        <TouchableOpacity style={s.qrBtn} onPress={onShowQr} activeOpacity={0.8}>
          <MaterialCommunityIcons name="qrcode" size={18} color="#0A0A0A" />
          <Text style={s.qrBtnTxt}>Pase de Acceso</Text>
        </TouchableOpacity>
      )}

      {onCancel && (
        <TouchableOpacity style={[s.cancelBtn, onShowQr && { marginTop: 8 }]} onPress={onCancel} activeOpacity={0.8}>
          <MaterialCommunityIcons name="close-circle-outline" size={16} color={Colors.danger} />
          <Text style={s.cancelTxt}>Cancelar reserva</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  list:   { flex: 1 },
  scroll: { paddingVertical: 16 },
  soft:   { color: Colors.textSoft, fontSize: 14, textAlign: 'center' },

  emptyTitle:   { color: Colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  retryBtn:     { marginTop: 4, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary },
  retryTxt:     { color: Colors.primary, fontWeight: '600' },

  chipsScroll:    { paddingVertical: 10, flexGrow: 0, flexShrink: 0 },
  chipsRowTablet: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', paddingVertical: 10, gap: 8 },
  chips:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  chip:           { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: 'transparent' },
  chipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt:      { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  chipTxtActive:{ color: '#fff' },

  headerRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 4, gap: 10 },
  headerLeft:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:         { width: 34, height: 34, borderRadius: 10, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  pageTitle:       { color: Colors.text, fontSize: 22, fontWeight: '800' },
  cancelAllBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.danger, backgroundColor: '#1C1C1E' },
  disabledOpacity: {},
  cancelAllTxt:    { color: Colors.danger, fontWeight: '700', fontSize: 13 },

  card:    { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  cardMain:{ flex: 1 },
  actName: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  actDesc: { color: Colors.textSoft, fontSize: 12, lineHeight: 17 },

  badges:   { gap: 6, alignItems: 'flex-end' },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt:  { color: Colors.textSoft, fontSize: 12 },

  // ── Tags tipo actividad ──────────────────────────────────────────────────────
  tagFree:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#FF5E00' },
  tagFreeTxt:  { fontSize: 10, fontWeight: '700', color: '#FF5E00' },
  tagSched:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#38BDF8' },
  tagSchedTxt: { fontSize: 10, fontWeight: '700', color: '#38BDF8' },

  // ── Bloque de detalle condicional ────────────────────────────────────────────
  detailBox:   { backgroundColor: '#1C1C1E', borderRadius: 10, padding: 10, gap: 6, marginBottom: 12 },
  detailRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  detailTxt:   { fontSize: 12, color: Colors.text, flex: 1, lineHeight: 18 },
  detailLabel: { fontWeight: '700', color: Colors.textSoft },

  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FF453A', backgroundColor: '#1C1C1E' },
  cancelTxt: { color: Colors.danger, fontWeight: '600', fontSize: 13 },

  // ── Botón Pase de Acceso (en la card) ───────────────────────────────────────
  qrBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.primary },
  qrBtnTxt: { color: '#0A0A0A', fontWeight: '700', fontSize: 14 },

  // ── Modal QR ────────────────────────────────────────────────────────────────
  qrBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  qrSheet:    { width: '100%', maxWidth: 360, backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  qrHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 14 },
  qrTitle:    { color: Colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  qrActName:  { color: Colors.text, fontSize: 15, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  qrDate:     { color: Colors.textSoft, fontSize: 12, marginBottom: 20, textAlign: 'center' },
  qrBox:      { padding: 14, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 18 },
  qrHint:     { color: Colors.textSoft, fontSize: 12, textAlign: 'center', marginBottom: 20, lineHeight: 17 },
  exportBtn:  { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginBottom: 8 },
  exportTxt:  { color: Colors.text, fontWeight: '600', fontSize: 14 },
  qrCloseBtn: { width: '100%', paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3C', alignItems: 'center' },
  qrCloseTxt: { color: Colors.text, fontWeight: '600', fontSize: 14 },
});

