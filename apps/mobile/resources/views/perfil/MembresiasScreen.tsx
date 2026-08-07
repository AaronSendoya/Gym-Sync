import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, Modal, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  subscriptionsApi,
  SubscriptionPlanDto,
  SubscriptionListItemDto,
  FreezeLogDto,
  MembershipStatus,
} from '../../../app/Providers/subscriptions/api/subscriptions.api';
import { DumbbellSpinner } from '../../../app/Shared/components/ui/DumbbellSpinner';

const ORANGE = '#FF5E00';

// ─── Solo lectura a propósito ─────────────────────────────────────────────
// Esta pantalla replica (en modo consulta) 3 de las 4 pestañas de la web
// Membresías: Gestión de Planes, Inscripciones e Historial de Congelamientos.
// "Inscribir Cliente" NO existe aquí porque inscribir es una acción de
// escritura (POST) — se mantiene exclusiva de la plataforma web.

type Tab = 'planes' | 'inscripciones' | 'historial';

const STATUS_META: Record<MembershipStatus, { label: string; color: string }> = {
  ACTIVA:    { label: 'Activa',    color: '#22C55E' },
  VENCIDA:   { label: 'Vencida',   color: '#EF4444' },
  CONGELADA: { label: 'Congelada', color: '#38BDF8' },
  CANCELADA: { label: 'Cancelada', color: '#8E8E93' },
};

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = String(iso).split('T')[0];
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return fmtDate(iso);
  }
};

const fullName = (p?: { firstName?: string; lastName?: string } | null, fallback = '—'): string => {
  const n = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  return n || fallback;
};

type MembresiasRouteParams = {
  initialTab?: Tab;
  initialStatus?: MembershipStatus;
} | undefined;

export const MembresiasScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, MembresiasRouteParams>, string>>();
  const params = route.params;

  const [tab, setTab] = useState<Tab>(params?.initialTab ?? 'planes');
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | 'ALL'>(params?.initialStatus ?? 'ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Selección activa para el modal de detalle — un solo estado para las 3
  // pestañas, discriminado por `tab` al renderizar (evita 3 modales duplicados).
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanDto | null>(null);
  const [selectedSub,  setSelectedSub]  = useState<SubscriptionListItemDto | null>(null);
  const [selectedLog,  setSelectedLog]  = useState<FreezeLogDto | null>(null);

  // Si la pantalla se abre desde el push de vencidas, saltar directo a
  // Inscripciones filtrado en Vencidas, incluso si ya estaba montada.
  useEffect(() => {
    if (params?.initialTab) setTab(params.initialTab);
    if (params?.initialStatus) setStatusFilter(params.initialStatus);
  }, [params?.initialTab, params?.initialStatus]);

  // Búsqueda debounced (400ms) — mismo patrón que la web.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const plansQuery = useQuery<SubscriptionPlanDto[]>({
    queryKey: ['membresias-plans', search],
    queryFn: () => subscriptionsApi.getPlans(search || undefined),
    enabled: tab === 'planes',
    staleTime: 60_000,
  });

  const subsQuery = useQuery({
    queryKey: ['membresias-subs', search, statusFilter],
    queryFn: () => subscriptionsApi.getSubscriptions({
      search: search || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      limit: 100,
    }),
    enabled: tab === 'inscripciones',
    staleTime: 30_000,
  });

  const freezeLogsQuery = useQuery({
    queryKey: ['membresias-freeze-logs', search],
    queryFn: () => subscriptionsApi.getFreezeLogs({ search: search || undefined, limit: 100 }),
    enabled: tab === 'historial',
    staleTime: 30_000,
  });

  const activeQuery = tab === 'planes' ? plansQuery : tab === 'inscripciones' ? subsQuery : freezeLogsQuery;
  const isLoading = activeQuery.isLoading;
  const isRefetching = activeQuery.isFetching && !activeQuery.isLoading;
  const isError = activeQuery.isError;

  const plans = plansQuery.data ?? [];
  const subs = subsQuery.data?.data ?? [];
  const logs = freezeLogsQuery.data?.data ?? [];

  const tabs: { key: Tab; label: string; icon: string }[] = useMemo(() => [
    { key: 'planes',        label: 'Planes',        icon: 'credit-card-outline' },
    { key: 'inscripciones', label: 'Inscripciones',  icon: 'account-group-outline' },
    { key: 'historial',     label: 'Historial',      icon: 'snowflake' },
  ], []);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top bar */}
      <View style={s.topBar}>
        {navigation.canGoBack() && (
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={s.topTitle}>Membresías</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => activeQuery.refetch()}>
          <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Segmented tabs */}
      <View style={s.tabsRow}>
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tabBtn, active && s.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={t.icon as any} size={14} color={active ? '#fff' : '#888'} />
              <Text style={[s.tabTxt, active && s.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Búsqueda */}
      <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
        <MaterialCommunityIcons name="magnify" size={18} color={searchFocused ? ORANGE : '#666'} />
        <TextInput
          style={s.searchInput}
          placeholder={tab === 'planes' ? 'Buscar plan por nombre...' : 'Buscar por nombre o email...'}
          placeholderTextColor="#555"
          value={searchInput}
          onChangeText={setSearchInput}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      </View>

      {/* Chips de estado — solo en Inscripciones */}
      {tab === 'inscripciones' && (
        <View style={s.chipsRow}>
          {([
            { key: 'ALL', label: 'Todas' },
            { key: 'ACTIVA', label: 'Activas' },
            { key: 'VENCIDA', label: 'Vencidas' },
            { key: 'CONGELADA', label: 'Congeladas' },
            { key: 'CANCELADA', label: 'Canceladas' },
          ] as { key: MembershipStatus | 'ALL'; label: string }[]).map(chip => {
            const active = statusFilter === chip.key;
            const color = chip.key === 'ALL' ? ORANGE : STATUS_META[chip.key as MembershipStatus].color;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[s.chip, active && { backgroundColor: color, borderColor: color }]}
                onPress={() => setStatusFilter(chip.key)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipTxt, active && s.chipTxtActive]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Contenido */}
      {isLoading ? (
        <View style={s.center}>
          <DumbbellSpinner size="large" color={ORANGE} />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="wifi-off" size={40} color="#444" />
          <Text style={s.errTxt}>No se pudo cargar la información.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => activeQuery.refetch()}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : tab === 'planes' ? (
        <FlatList
          data={plans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => plansQuery.refetch()} tintColor={ORANGE} />}
          ListEmptyComponent={<EmptyState icon="credit-card-off-outline" text="No hay planes registrados." />}
          renderItem={({ item }) => <PlanCard item={item} onPress={() => setSelectedPlan(item)} />}
        />
      ) : tab === 'inscripciones' ? (
        <FlatList
          data={subs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => subsQuery.refetch()} tintColor={ORANGE} />}
          ListEmptyComponent={<EmptyState icon="account-off-outline" text="Sin inscripciones para este filtro." />}
          renderItem={({ item }) => <SubscriptionCard item={item} onPress={() => setSelectedSub(item)} />}
        />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => freezeLogsQuery.refetch()} tintColor={ORANGE} />}
          ListEmptyComponent={<EmptyState icon="snowflake-off" text="Sin eventos de congelamiento registrados." />}
          renderItem={({ item }) => <FreezeLogCard item={item} onPress={() => setSelectedLog(item)} />}
        />
      )}

      <PlanDetailModal item={selectedPlan} onClose={() => setSelectedPlan(null)} />
      <SubscriptionDetailModal item={selectedSub} onClose={() => setSelectedSub(null)} />
      <FreezeLogDetailModal item={selectedLog} onClose={() => setSelectedLog(null)} />
    </SafeAreaView>
  );
};

// ─── Sub-componentes ──────────────────────────────────────────────────────

const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
  <View style={[s.center, { marginTop: 60 }]}>
    <MaterialCommunityIcons name={icon as any} size={48} color="#222" />
    <Text style={s.emptyTxt}>{text}</Text>
  </View>
);

const CardChevron = () => (
  <MaterialCommunityIcons name="chevron-right" size={18} color="#3A3A3C" style={{ marginLeft: 4 }} />
);

const PlanCard = ({ item, onPress }: { item: SubscriptionPlanDto; onPress: () => void }) => {
  const bySessions = item.sessionsIncluded != null;
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{item.name}</Text>
          {!!item.description && <Text style={s.cardSub} numberOfLines={2}>{item.description}</Text>}
        </View>
        <Text style={s.priceTxt}>Bs. {Number(item.priceMonthly).toFixed(2)}</Text>
        <CardChevron />
      </View>
      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <MaterialCommunityIcons name="map-marker-outline" size={13} color="#8E8E93" />
          <Text style={s.metaTxt}>{item.gym?.name ?? 'Global (toda la red)'}</Text>
        </View>
      </View>
      <View style={[s.modalityPill, { borderColor: bySessions ? '#a78bfa' : '#38BDF8' }]}>
        <MaterialCommunityIcons name={bySessions ? 'repeat' : 'calendar-month-outline'} size={12} color={bySessions ? '#a78bfa' : '#38BDF8'} />
        <Text style={[s.modalityTxt, { color: bySessions ? '#a78bfa' : '#38BDF8' }]}>
          {bySessions ? `${item.sessionsIncluded} sesiones en ${item.windowDays} días` : `${item.durationDays} días calendario`}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const SubscriptionCard = ({ item, onPress }: { item: SubscriptionListItemDto; onPress: () => void }) => {
  const meta = STATUS_META[item.status] ?? STATUS_META.CANCELADA;
  const clientName = fullName(item.user?.profile, item.user?.email ?? 'Cliente');
  const brandName = item.homeGym?.parent?.name;

  return (
    <TouchableOpacity
      style={[s.card, { borderColor: item.status === 'VENCIDA' ? '#EF444466' : '#3A3A3C' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{clientName}</Text>
          <Text style={s.cardSub}>{item.plan.name}</Text>
        </View>
        <View style={[s.statusBadge, { borderColor: meta.color, backgroundColor: `${meta.color}1A` }]}>
          <Text style={[s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <CardChevron />
      </View>

      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <MaterialCommunityIcons name="map-marker-outline" size={13} color="#8E8E93" />
          <Text style={s.metaTxt}>
            {item.homeGym?.name ?? '—'}{brandName ? ` · ${brandName}` : ''}
          </Text>
        </View>
      </View>

      {item.status === 'VENCIDA' ? (
        <View style={[s.metaRow, { marginTop: 2 }]}>
          <MaterialCommunityIcons name="calendar-remove" size={13} color="#EF4444" />
          <Text style={[s.metaTxt, { color: '#EF4444', fontWeight: '700' }]}>
            Venció el {fmtDate(item.endDate)}
          </Text>
        </View>
      ) : (
        <View style={[s.metaRow, { marginTop: 2 }]}>
          <MaterialCommunityIcons name="calendar-range" size={13} color="#8E8E93" />
          <Text style={s.metaTxt}>{fmtDate(item.startDate)} – {fmtDate(item.endDate)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const FreezeLogCard = ({ item, onPress }: { item: FreezeLogDto; onPress: () => void }) => {
  const isFreeze = item.action === 'CONGELAR';
  const color = isFreeze ? '#38BDF8' : '#F59E0B';
  const clientName = fullName(item.user?.profile, item.user?.email ?? 'Cliente');
  const performedByName = item.performedBy ? fullName(item.performedBy.profile, item.performedBy.email) : '—';

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{clientName}</Text>
          <Text style={s.cardSub}>{item.homeGym?.name ?? '—'}</Text>
        </View>
        <View style={[s.statusBadge, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <MaterialCommunityIcons name={isFreeze ? 'snowflake' : 'sun-thermometer-outline'} size={11} color={color} />
          <Text style={[s.statusTxt, { color, marginLeft: 3 }]}>{isFreeze ? 'Congelada' : 'Descongelada'}</Text>
        </View>
        <CardChevron />
      </View>

      <View style={s.metaRow}>
        <MaterialCommunityIcons name="clock-outline" size={13} color="#8E8E93" />
        <Text style={s.metaTxt}>{fmtDateTime(item.occurredAt)} · por {performedByName}</Text>
      </View>

      {!isFreeze && item.daysFrozen != null && (
        <View style={[s.metaRow, { marginTop: 2 }]}>
          <MaterialCommunityIcons name="calendar-plus" size={13} color="#8E8E93" />
          <Text style={s.metaTxt}>
            {item.daysFrozen} día{item.daysFrozen === 1 ? '' : 's'} congelada — nuevo vencimiento {fmtDate(item.newEndDate)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Modales de detalle ────────────────────────────────────────────────────
// Un modal centrado por pestaña — mismo patrón visual que el detalle de
// reserva en AuditoriaSucursalScreen.tsx (overlay oscuro + card + filas
// etiqueta/valor), para que "toca para ver más" se sienta consistente en
// toda la app en vez de reinventar el patrón por pantalla.

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <View style={dm.row}>
    <Text style={dm.label}>{label}</Text>
    {typeof value === 'string' ? <Text style={dm.value}>{value}</Text> : value}
  </View>
);

const DetailModalShell = ({
  visible, icon, title, onClose, children,
}: {
  visible: boolean; icon: string; title: string; onClose: () => void; children: React.ReactNode;
}) => (
  <Modal visible={visible} transparent animationType="fade">
    <Pressable style={dm.overlay} onPress={onClose}>
      <Pressable style={dm.card} onPress={() => {}}>
        <View style={dm.header}>
          <MaterialCommunityIcons name={icon as any} size={20} color={ORANGE} />
          <Text style={dm.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
);

const PlanDetailModal = ({ item, onClose }: { item: SubscriptionPlanDto | null; onClose: () => void }) => {
  if (!item) return null;
  const bySessions = item.sessionsIncluded != null;
  const scopeLabel = item.scope === 'MARCA' ? 'Toda la marca (VIP)' : 'Sucursal única';
  return (
    <DetailModalShell visible={!!item} icon="credit-card-outline" title={item.name} onClose={onClose}>
      <Text style={dm.section}>PLAN</Text>
      <DetailRow label="Nombre" value={item.name} />
      <DetailRow label="Precio mensual" value={`Bs. ${Number(item.priceMonthly).toFixed(2)}`} />
      <DetailRow
        label="Modalidad"
        value={bySessions ? `${item.sessionsIncluded} sesiones en ${item.windowDays} días` : `${item.durationDays} días calendario`}
      />
      <DetailRow label="Alcance" value={scopeLabel} />
      <DetailRow label="Sucursal / Marca" value={item.gym?.name ?? 'Global (toda la red)'} />
      {!!item.description && (
        <>
          <Text style={dm.section}>DESCRIPCIÓN</Text>
          <Text style={dm.freeText}>{item.description}</Text>
        </>
      )}
    </DetailModalShell>
  );
};

const SubscriptionDetailModal = ({ item, onClose }: { item: SubscriptionListItemDto | null; onClose: () => void }) => {
  if (!item) return null;
  const meta = STATUS_META[item.status] ?? STATUS_META.CANCELADA;
  const clientName = fullName(item.user?.profile, item.user?.email ?? 'Cliente');
  const brandName = item.homeGym?.parent?.name;
  return (
    <DetailModalShell visible={!!item} icon="account-group-outline" title={clientName} onClose={onClose}>
      <Text style={dm.section}>CLIENTE</Text>
      <DetailRow label="Nombre" value={clientName} />
      <DetailRow label="Email" value={item.user?.email ?? '—'} />
      <DetailRow label="Carnet (CI)" value={item.user?.profile?.ci || 'Sin registrar'} />

      <Text style={dm.section}>MEMBRESÍA</Text>
      <DetailRow label="Plan" value={item.plan.name} />
      <DetailRow label="Precio mensual" value={`Bs. ${Number(item.plan.priceMonthly).toFixed(2)}`} />
      <DetailRow label="Alcance del plan" value={item.plan.scope === 'MARCA' ? 'Toda la marca (VIP)' : 'Sucursal única'} />
      <DetailRow label="Sucursal" value={`${item.homeGym?.name ?? '—'}${brandName ? ` · ${brandName}` : ''}`} />
      <DetailRow label="Vigencia" value={`${fmtDate(item.startDate)} – ${fmtDate(item.endDate)}`} />
      {!!item.frozenAt && <DetailRow label="Congelada desde" value={fmtDate(item.frozenAt)} />}

      <Text style={dm.section}>ESTADO</Text>
      <View style={dm.row}>
        <Text style={dm.label}>Membresía</Text>
        <View style={[dm.badge, { borderColor: meta.color, backgroundColor: `${meta.color}1A` }]}>
          <Text style={[dm.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
    </DetailModalShell>
  );
};

const FreezeLogDetailModal = ({ item, onClose }: { item: FreezeLogDto | null; onClose: () => void }) => {
  if (!item) return null;
  const isFreeze = item.action === 'CONGELAR';
  const color = isFreeze ? '#38BDF8' : '#F59E0B';
  const clientName = fullName(item.user?.profile, item.user?.email ?? 'Cliente');
  const performedByName = item.performedBy ? fullName(item.performedBy.profile, item.performedBy.email) : '—';
  return (
    <DetailModalShell visible={!!item} icon="snowflake" title={clientName} onClose={onClose}>
      <Text style={dm.section}>EVENTO</Text>
      <View style={dm.row}>
        <Text style={dm.label}>Acción</Text>
        <View style={[dm.badge, { borderColor: color, backgroundColor: `${color}1A` }]}>
          <MaterialCommunityIcons name={isFreeze ? 'snowflake' : 'sun-thermometer-outline'} size={11} color={color} />
          <Text style={[dm.badgeTxt, { color, marginLeft: 3 }]}>{isFreeze ? 'Congelada' : 'Descongelada'}</Text>
        </View>
      </View>
      <DetailRow label="Fecha y hora" value={fmtDateTime(item.occurredAt)} />
      <DetailRow label="Realizado por" value={performedByName} />
      <DetailRow label="Sucursal" value={item.homeGym?.name ?? '—'} />

      <Text style={dm.section}>CLIENTE</Text>
      <DetailRow label="Nombre" value={clientName} />
      <DetailRow label="Email" value={item.user?.email ?? '—'} />

      {!isFreeze && item.daysFrozen != null && (
        <>
          <Text style={dm.section}>DESCONGELAMIENTO</Text>
          <DetailRow label="Días congelada" value={`${item.daysFrozen} día${item.daysFrozen === 1 ? '' : 's'}`} />
          <DetailRow label="Vencimiento anterior" value={fmtDate(item.previousEndDate)} />
          <DetailRow label="Nuevo vencimiento" value={fmtDate(item.newEndDate)} />
        </>
      )}
    </DetailModalShell>
  );
};

const dm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:     { backgroundColor: '#161618', borderRadius: 20, padding: 20, width: '100%', maxHeight: '80%', borderWidth: 1, borderColor: '#3A3A3C' },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  title:    { flex: 1, color: '#fff', fontSize: 16, fontWeight: '800' },
  section:  { color: ORANGE, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  label:    { color: '#8E8E93', fontSize: 13 },
  value:    { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  freeText: { color: '#D1D5DB', fontSize: 13, lineHeight: 19 },
  badge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
});

// ─── Estilos ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#1C1C1E',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: 10, backgroundColor: '#1C1C1E',
    borderWidth: 1, borderColor: '#3A3A3C',
  },
  tabBtnActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  tabTxt: { color: '#888', fontSize: 12, fontWeight: '600' },
  tabTxtActive: { color: '#fff' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#3A3A3C',
  },
  // Foco visible — el fondo aclara un poco y el borde pasa a naranja, la
  // única señal de "esto es interactivo" posible sin sombra en dark mode.
  searchWrapFocused: { borderColor: ORANGE, backgroundColor: '#232325' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, padding: 0 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#3A3A3C',
  },
  chipTxt: { color: '#888', fontSize: 12, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  errTxt: { color: '#8E8E93', fontSize: 14 },
  retryBtn: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: ORANGE,
  },
  retryTxt: { color: ORANGE, fontSize: 14, fontWeight: '600' },
  emptyTxt: { color: '#444', fontSize: 13, textAlign: 'center' },

  list: { padding: 14, paddingBottom: 120, gap: 10 },

  card: {
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#3A3A3C',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardSub: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  priceTxt: { color: ORANGE, fontSize: 15, fontWeight: '800' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  metaTxt: { color: '#8E8E93', fontSize: 12, flexShrink: 1 },

  modalityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  modalityTxt: { fontSize: 11, fontWeight: '700' },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  statusTxt: { fontSize: 11, fontWeight: '700' },
});
