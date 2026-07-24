import { useState, useMemo } from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, TextInput} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  staffApi,
  StaffCatalogEntry,
  AdvisorRequestStatus,
} from '../../../app/Providers/staff/api/staff.api';
import { messagesApi } from '../../../app/Providers/messages/messages.api';
import { ClientePerfilParamList } from '../../../routes/PerfilStack';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

type Nav = NativeStackNavigationProp<ClientePerfilParamList, 'StaffCatalog'>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ENTRENADOR:    'Entrenador',
  NUTRICIONISTA: 'Nutricionista',
  INSTRUCTOR:    'Instructor',
};

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:   { label: 'Pendiente',  color: '#FF5E00', icon: 'clock-outline' },
  ACTIVE:    { label: 'Activa',     color: '#22C55E', icon: 'check-circle-outline' },
  REJECTED:  { label: 'Rechazada',  color: '#EF4444', icon: 'close-circle-outline' },
  CANCELLED: { label: 'Cancelada',  color: '#6B7280', icon: 'cancel' },
};

const resolveDisplayName = (entry: StaffCatalogEntry): string => {
  if (entry.fullName) return entry.fullName;
  if (entry.name)     return entry.name;
  const first = entry.profile?.firstName ?? entry.firstName ?? '';
  const last  = entry.profile?.lastName  ?? entry.lastName  ?? '';
  return [first, last].filter(Boolean).join(' ') || '—';
};

const resolveBranchName = (e: StaffCatalogEntry) =>
  e.branchName ?? e.gymName ?? e.gym?.name ?? '—';
const resolveBrandName = (e: StaffCatalogEntry) =>
  e.brandName ?? e.gym?.parent?.name ?? '—';
const resolveRole = (e: StaffCatalogEntry) =>
  ROLE_LABELS[(e.role ?? '').toUpperCase()] ?? e.role ?? '—';

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return '—'; }
};

// ── Tarjeta catálogo ──────────────────────────────────────────────────────────
const StaffCard = ({
  entry,
  alreadyRequested,
  requestBlocked,
  onRequest,
}: {
  entry:            StaffCatalogEntry;
  alreadyRequested: boolean;
  requestBlocked:   boolean;
  onRequest:        (advisorName: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const displayName = resolveDisplayName(entry);

  const handlePress = async () => {
    if (alreadyRequested || requestBlocked || loading) return;
    setLoading(true);
    try {
      await staffApi.requestAdvisor(entry.id);
      onRequest(displayName);
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message
        ?? (err instanceof Error ? err.message : null)
        ?? 'No se pudo enviar la solicitud.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.avatar}>
        <MaterialCommunityIcons name="account-tie" size={32} color="#f05b22" />
      </View>

      <View style={s.info}>
        <Text style={s.name} numberOfLines={1}>{displayName}</Text>
        <View style={s.metaRow}>
          <MaterialCommunityIcons name="shield-star-outline" size={12} color="#38BDF8" />
          <Text style={s.metaText}>{resolveRole(entry)}</Text>
        </View>
        <View style={s.metaRow}>
          <MaterialCommunityIcons name="dumbbell" size={12} color="#888" />
          <Text style={s.metaText} numberOfLines={1}>{resolveBranchName(entry)}</Text>
        </View>
        <View style={s.metaRow}>
          <MaterialCommunityIcons name="office-building-outline" size={12} color="#888" />
          <Text style={s.metaText} numberOfLines={1}>{resolveBrandName(entry)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.btn, alreadyRequested && s.btnSent, requestBlocked && s.btnBlocked]}
        onPress={handlePress}
        disabled={alreadyRequested || requestBlocked || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <DumbbellSpinner size="small" color="#fff" />
        ) : alreadyRequested ? (
          <>
            <MaterialCommunityIcons name="check-circle-outline" size={14} color="#22C55E" />
            <Text style={[s.btnTxt, s.btnTxtSent]}>Enviada</Text>
          </>
        ) : requestBlocked ? (
          <Text style={s.btnTxtBlocked}>No{'\n'}disponible</Text>
        ) : (
          <Text style={s.btnTxt}>Solicitar{'\n'}Asesoría</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ── Tarjeta solicitud ─────────────────────────────────────────────────────────
const RequestCard = ({
  item,
  onCancel,
  onMessage,
}: {
  item:      AdvisorRequestStatus;
  onCancel:  (id: number) => void;
  onMessage: (advisorId: number, advisorName: string) => void;
}) => {
  const meta = STATUS_META[item.status] ?? { label: item.status, color: '#888', icon: 'help-circle-outline' };

  return (
    <View style={[s.reqCard, { borderLeftColor: meta.color }]}>
      <View style={s.reqTop}>
        <View style={s.reqAvatar}>
          <MaterialCommunityIcons name="account-tie" size={26} color={meta.color} />
        </View>
        <View style={s.reqInfo}>
          <Text style={s.reqName} numberOfLines={1}>{item.advisorName}</Text>
          <View style={s.metaRow}>
            <MaterialCommunityIcons name="shield-star-outline" size={12} color="#38BDF8" />
            <Text style={s.metaText}>
              {ROLE_LABELS[(item.advisorRole ?? '').toUpperCase()] ?? item.advisorRole}
            </Text>
          </View>
          <View style={s.metaRow}>
            <MaterialCommunityIcons name="dumbbell" size={12} color="#888" />
            <Text style={s.metaText} numberOfLines={1}>{item.branchName}</Text>
          </View>
        </View>

        {/* Badge de estado */}
        <View style={[s.statusBadge, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}66` }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={s.reqFooter}>
        <MaterialCommunityIcons name="calendar-outline" size={12} color="#444" />
        <Text style={s.reqDate}>Enviada el {fmtDate(item.createdAt)}</Text>

        {item.status === 'ACTIVE' && (
          <TouchableOpacity
            style={s.msgBtn}
            activeOpacity={0.8}
            onPress={() => onMessage(item.advisorId, item.advisorName)}
          >
            <MaterialCommunityIcons name="message-text-outline" size={12} color="#38BDF8" />
            <Text style={s.msgBtnTxt}>Mensaje</Text>
          </TouchableOpacity>
        )}

        {(item.status === 'ACTIVE' || item.status === 'PENDING') && (
          <TouchableOpacity
            style={s.cancelBtn}
            activeOpacity={0.8}
            onPress={() => onCancel(item.id)}
          >
            <MaterialCommunityIcons name="cancel" size={12} color="#EF4444" />
            <Text style={s.cancelBtnTxt}>
              {item.status === 'PENDING' ? 'Retirar solicitud' : 'Cancelar asesoría'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Pantalla principal ────────────────────────────────────────────────────────
export const StaffCatalogScreen = () => {
  const navigation  = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'catalog' | 'requests'>('catalog');
  const [search,    setSearch]    = useState('');

  const {
    data: catalogData,
    isLoading: loadingCatalog,
    isError: errorCatalog,
    refetch: refetchCatalog,
    fetchNextPage: fetchNextCatalog,
    hasNextPage: hasNextCatalog,
    isFetchingNextPage: fetchingNextCatalog,
  } = useInfiniteQuery({
    queryKey:  ['staff-catalog'],
    queryFn:   ({ pageParam = 0 }) => staffApi.getCatalog({ limit: 20, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.meta) return undefined;
      const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
      return nextOffset < lastPage.meta.total ? nextOffset : undefined;
    },
    staleTime: 2 * 60_000,
  });

  const catalog = useMemo(() => {
    return catalogData?.pages.flatMap(page => page.data ?? page) ?? [];
  }, [catalogData]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(e =>
      resolveDisplayName(e).toLowerCase().includes(q) ||
      resolveBranchName(e).toLowerCase().includes(q)  ||
      resolveBrandName(e).toLowerCase().includes(q)   ||
      resolveRole(e).toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const {
    data: myRequestsRaw,
    isLoading: loadingReqs,
    refetch: refetchReqs,
  } = useQuery({
    queryKey:  ['my-advisor-requests'],
    queryFn:   () => staffApi.getMyAdvisorRequests(),
    staleTime: 30_000,
  });
  const myRequests: AdvisorRequestStatus[] = Array.isArray(myRequestsRaw)
    ? myRequestsRaw
    : ((myRequestsRaw as any)?.data ?? []);

  const hasActiveOrPending = useMemo(
    () => myRequests.some(r => r.status === 'PENDING' || r.status === 'ACTIVE'),
    [myRequests],
  );

  const requestedAdvisorIds = useMemo(
    () => new Set(
      myRequests
        .filter(r => r.status !== 'REJECTED' && r.status !== 'CANCELLED')
        .map(r => r.advisorId),
    ),
    [myRequests],
  );

  const handleRequest = (advisorName: string) => {
    refetchReqs();
    queryClient.invalidateQueries({ queryKey: ['my-advisor-requests'] });
    Alert.alert(
      'Solicitud enviada',
      `Tu solicitud de asesoramiento fue enviada a ${advisorName}. Puedes ver el estado o retirarla desde "Mis Solicitudes".`,
      [
        { text: 'Ver solicitudes', onPress: () => setActiveTab('requests') },
        { text: 'OK' },
      ],
    );
  };

  const handleMessage = async (advisorId: number, advisorName: string) => {
    try {
      const conv = await messagesApi.startConversation(advisorId);
      (navigation as any).navigate('Chat', { conversationId: conv.id, otherUserName: advisorName });
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message
        ?? (err instanceof Error ? err.message : null)
        ?? 'No se pudo iniciar la conversación.';
      Alert.alert('Error', msg);
    }
  };

  const handleCancel = (id: number) => {
    const req = myRequests.find(r => r.id === id);
    const advisorName = req?.advisorName ?? 'este asesor';
    const isPending = req?.status === 'PENDING';

    const title = isPending ? 'Retirar solicitud' : 'Cancelar asesoría';
    const message = isPending
      ? `Mandaste una solicitud de asesoramiento al entrenador ${advisorName}. ¿Quieres cancelarla?`
      : `¿Estás seguro de cancelar la asesoría con ${advisorName}? Se eliminarán tu plan nutricional y rutina asignada.`;

    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      {
        text: isPending ? 'Sí, retirar' : 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await staffApi.cancelAdvisorship(id);
            await refetchReqs();
            queryClient.invalidateQueries({ queryKey: ['my-advisor-requests'] });
            queryClient.invalidateQueries({ queryKey: ['my-plan'] });
            queryClient.invalidateQueries({ queryKey: ['my-routines'] });
            queryClient.invalidateQueries({ queryKey: ['staff-catalog'] });
          } catch (err: unknown) {
            const msg = (err as any)?.response?.data?.message
              ?? (err instanceof Error ? err.message : null)
              ?? 'No se pudo completar la operación.';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const pendingCount = myRequests.filter(r => r.status === 'PENDING').length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Catálogo de Asesores</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'catalog' && s.tabActive]}
          onPress={() => setActiveTab('catalog')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-search-outline"
            size={15}
            color={activeTab === 'catalog' ? '#fff' : '#555'}
          />
          <Text style={[s.tabTxt, activeTab === 'catalog' && s.tabTxtActive]}>
            Catálogo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tab, activeTab === 'requests' && s.tabActive]}
          onPress={() => setActiveTab('requests')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="bell-ring-outline"
            size={15}
            color={activeTab === 'requests' ? '#fff' : '#555'}
          />
          <Text style={[s.tabTxt, activeTab === 'requests' && s.tabTxtActive]}>
            Mis Solicitudes
          </Text>
          {pendingCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Buscador (solo en tab catálogo) ── */}
      {activeTab === 'catalog' && (
        <View style={s.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color="#555" />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar por nombre o sucursal..."
            placeholderTextColor="#555"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Tab: Catálogo ── */}
      {activeTab === 'catalog' && (
        <>
          {loadingCatalog ? (
            <View style={s.center}>
              <DumbbellSpinner size="large" color="#f05b22" />
              <Text style={s.soft}>Cargando asesores...</Text>
            </View>
          ) : errorCatalog ? (
            <View style={s.center}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
              <Text style={[s.soft, { color: '#EF4444' }]}>No se pudo cargar el catálogo.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => refetchCatalog()} activeOpacity={0.8}>
                <Text style={s.retryTxt}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredCatalog}
              keyExtractor={(item, index) => `${item.id}-${item.branchId ?? item.gymId ?? index}`}
              contentContainerStyle={s.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.center}>
                  <MaterialCommunityIcons name="account-search-outline" size={56} color="#3A3A3C" />
                  <Text style={s.soft}>
                    {search.trim() ? 'Sin resultados para tu búsqueda.' : 'No hay asesores disponibles.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <StaffCard
                  entry={item}
                  alreadyRequested={requestedAdvisorIds.has(item.id)}
                  requestBlocked={hasActiveOrPending && !requestedAdvisorIds.has(item.id)}
                  onRequest={handleRequest}
                />
              )}
              onEndReached={() => {
                if (hasNextCatalog && !fetchingNextCatalog) {
                  fetchNextCatalog();
                }
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                fetchingNextCatalog ? <DumbbellSpinner size="small" color="#FF6B00" style={{ marginVertical: 15 }} /> : null
              }
            />
          )}
        </>
      )}

      {/* ── Tab: Mis Solicitudes ── */}
      {activeTab === 'requests' && (
        <>
          {loadingReqs ? (
            <View style={s.center}>
              <DumbbellSpinner size="large" color="#f05b22" />
              <Text style={s.soft}>Cargando solicitudes...</Text>
            </View>
          ) : myRequests.length === 0 ? (
            <View style={s.center}>
              <MaterialCommunityIcons name="bell-off-outline" size={56} color="#3A3A3C" />
              <Text style={s.soft}>No has enviado solicitudes aún.</Text>
              <TouchableOpacity
                style={[s.retryBtn, { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#f05b22' }]}
                onPress={() => setActiveTab('catalog')}
                activeOpacity={0.8}
              >
                <Text style={[s.retryTxt, { color: '#f05b22' }]}>Ver catálogo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.list}
            >
              {/* Resumen rápido */}
              <View style={s.summaryRow}>
                {(['PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED'] as const).map(st => {
                  const cnt  = myRequests.filter(r => r.status === st).length;
                  const meta = STATUS_META[st];
                  return (
                    <View key={st} style={[s.summaryChip, { borderColor: `${meta.color}44` }]}>
                      <Text style={[s.summaryNum, { color: meta.color }]}>{cnt}</Text>
                      <Text style={s.summaryLbl}>{meta.label}</Text>
                    </View>
                  );
                })}
              </View>

              {myRequests.map(item => (
                <RequestCard key={item.id} item={item} onCancel={handleCancel} onMessage={handleMessage} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
};

// ── Estilos ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  soft:   { color: '#666', fontSize: 14, textAlign: 'center' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  backBtn:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Tabs
  tabBar:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#111' },
  tab:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2A2A2D' },
  tabActive:    { backgroundColor: '#f05b22', borderColor: '#f05b22' },
  tabTxt:       { color: '#555', fontSize: 13, fontWeight: '700' },
  tabTxtActive: { color: '#fff' },
  badge:        { backgroundColor: '#fff', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeTxt:     { color: '#f05b22', fontSize: 10, fontWeight: '900' },

  // Lista
  list: { padding: 16, paddingBottom: 100, gap: 0 },

  // Tarjeta asesor
  card:    { flexDirection: 'row', backgroundColor: '#0e0e0e', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1C1C1E', alignItems: 'center', gap: 12 },
  avatar:  { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FF5E00', flexShrink: 0 },
  info:    { flex: 1, gap: 4 },
  name:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:{ color: '#888', fontSize: 12 },

  // Barra de búsqueda
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginHorizontal: 16, marginTop: 10, marginBottom: 2, borderWidth: 1, borderColor: '#2A2A2D' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },

  // Botón asesoría
  btn:           { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f05b22', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 72, gap: 3, flexShrink: 0 },
  btnSent:       { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#22C55E' },
  btnBlocked:    { backgroundColor: '#111', borderWidth: 1, borderColor: '#2A2A2D' },
  btnTxt:        { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  btnTxtSent:    { color: '#22C55E', fontSize: 11 },
  btnTxtBlocked: { color: '#444', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Tarjeta solicitud
  reqCard:    { backgroundColor: '#0e0e0e', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1C1C1E', borderLeftWidth: 3, gap: 10 },
  reqTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reqAvatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  reqInfo:    { flex: 1, gap: 4 },
  reqName:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  statusBadge:{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1 },
  statusTxt:  { fontSize: 11, fontWeight: '700' },
  reqFooter:     { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  reqDate:       { color: '#444', fontSize: 11, flex: 1 },
  cancelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1C1C1E', borderRadius: 8, borderWidth: 1, borderColor: '#EF444466', paddingVertical: 5, paddingHorizontal: 10 },
  cancelBtnTxt:  { color: '#EF4444', fontSize: 11, fontWeight: '700' },
  msgBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0a1929', borderRadius: 8, borderWidth: 1, borderColor: '#38BDF866', paddingVertical: 5, paddingHorizontal: 10 },
  msgBtnTxt:     { color: '#38BDF8', fontSize: 11, fontWeight: '700' },

  // Resumen chips
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryChip:{ flex: 1, backgroundColor: '#0e0e0e', borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 2 },
  summaryNum: { fontSize: 20, fontWeight: '900' },
  summaryLbl: { color: '#555', fontSize: 10 },

  // Retry
  retryBtn: { marginTop: 8, backgroundColor: '#f05b22', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
