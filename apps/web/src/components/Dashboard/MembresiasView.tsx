import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../common/PaginationControls';
import { ModalOverlay, ConfirmModal } from './Shared/DashboardShared';
import { MembershipCardModal } from './MembershipCardModal';
import {
  CreditCard, Users, ClipboardList, Plus, Pencil, Trash2, Search, CalendarDays, Dumbbell, IdCard, Snowflake, Play, History,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PlanDto {
  id: number;
  name: string;
  description?: string | null;
  priceMonthly: number | string;
  durationDays?: number | null;
  sessionsIncluded?: number | null;
  windowDays?: number | null;
  scope?: 'SUCURSAL' | 'MARCA';
  /** Sucursal dueña del plan. null = plan global de la red. */
  gymId?: number | null;
  gym?: { id: number; name: string } | null;
}

interface SubscriptionDto {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  frozenAt?: string | null;
  user?: { id: number; email?: string; profile?: { firstName?: string; lastName?: string } };
  plan?: PlanDto;
  homeGym?: { id: number; name: string } | null;
}

interface GymOption {
  id: number;
  name: string;
  parentId: number | null;
}

/** Historial permanente de congelamientos/descongelamientos — independiente de la membresía. */
interface FreezeLogDto {
  id: number;
  action: 'CONGELAR' | 'DESCONGELAR';
  occurredAt: string;
  daysFrozen: number | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  user?: { id: number; email?: string; profile?: { firstName?: string; lastName?: string } };
  performedBy?: { id: number; email?: string; profile?: { firstName?: string; lastName?: string } } | null;
  homeGym?: { id: number; name: string } | null;
}

/** Resultado de GET /users/chat/clients — búsqueda GLOBAL de clientes nivel 1. */
interface ClientSearchResult {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  ci: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const unwrapArray = <T,>(raw: unknown): T[] => {
  if (Array.isArray(raw)) return raw as T[];
  const d = (raw as { data?: unknown })?.data;
  return Array.isArray(d) ? (d as T[]) : [];
};

const isSessionPlan = (p: PlanDto) => p.sessionsIncluded != null;

const planTypeLabel = (p: PlanDto) =>
  isSessionPlan(p)
    ? `${p.sessionsIncluded} sesiones en ${p.windowDays} días`
    : `${p.durationDays ?? '—'} días calendario`;

const fmtPrice = (v: number | string) => {
  const n = Number(v);
  return isNaN(n) ? String(v) : `Bs. ${n.toFixed(2)}`;
};

const toLocalISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayISO = () => toLocalISO(new Date());

const startOfMonthISO = () => {
  const d = new Date();
  d.setDate(1);
  return toLocalISO(d);
};

const addDaysISO = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
};

/** Fecha + hora exacta del evento (registro permanente de auditoría, no un día calendario). */
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = toLocalISO(d).split('-').reverse().join('/');
  const time = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};

const clientName = (c: { email?: string; profile?: { firstName?: string; lastName?: string } } | undefined) => {
  const full = `${c?.profile?.firstName ?? ''} ${c?.profile?.lastName ?? ''}`.trim();
  return full || c?.email || '—';
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVA:    'bg-green-500/15 text-green-500',
  ACTIVO:    'bg-green-500/15 text-green-500',
  VENCIDA:   'bg-gray-500/15 text-gray-400',
  CONGELADA: 'bg-sky-500/15 text-sky-400',
  CANCELADA: 'bg-red-500/15 text-red-400',
};

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-[#3A3A3C] bg-white dark:bg-[#0A0A0A] px-3 py-2 text-sm text-slate-900 dark:text-gray-100 outline-none focus:border-brand-orange';
const labelCls = 'block text-sm font-medium text-slate-700 dark:text-gray-300 mt-3 mb-1';
const btnPrimary =
  'px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-orange cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
  'px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 cursor-pointer border-0';

// ─── Modal de Plan (crear / editar) ──────────────────────────────────────────

const PlanModal = ({ plan, onClose, onSaved }: {
  plan: PlanDto | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { user } = useAuth();
  const callerLevel = user?.level ?? 0;
  const isSuperAdmin = callerLevel >= 10;
  const isGerente = callerLevel === 5;
  // Recepcionista (4): el backend fuerza su sucursal como dueña del plan.
  const needsGymPicker = isSuperAdmin || isGerente;

  const isEdit = !!plan;
  const [name, setName]         = useState(plan?.name ?? '');
  const [description, setDesc]  = useState(plan?.description ?? '');
  const [price, setPrice]       = useState(plan ? String(plan.priceMonthly) : '');
  const [planType, setPlanType] = useState<'FECHA' | 'SESIONES'>(
    plan && isSessionPlan(plan) ? 'SESIONES' : 'FECHA',
  );
  const [durationDays, setDurationDays]         = useState(String(plan?.durationDays ?? 30));
  const [sessionsIncluded, setSessionsIncluded] = useState(String(plan?.sessionsIncluded ?? 30));
  const [windowDays, setWindowDays]             = useState(String(plan?.windowDays ?? 60));
  // Recepcionista (4) no tiene autoridad sobre otras sucursales de su marca:
  // no puede otorgar acceso MARCA (VIP multi-sucursal), solo SUCURSAL.
  const [scope, setScope] = useState<'SUCURSAL' | 'MARCA'>(
    callerLevel === 4 ? 'SUCURSAL' : (plan?.scope ?? 'SUCURSAL'),
  );
  // 'GLOBAL' = plan de red (solo Super Admin, elección explícita). Número =
  // sucursal dueña. '' = sin elegir todavía — SIN default implícito, fuerza
  // una decisión consciente en vez de heredar "Global" por omisión.
  const [ownerGymId, setOwnerGymId] = useState<string>(
    plan?.gymId != null ? String(plan.gymId) : isEdit && plan?.gymId === null ? 'GLOBAL' : '',
  );
  const [ownerBrandId, setOwnerBrandId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  // Marcas + sucursales del territorio (mismo patrón que InscribirTab:
  // Super Admin elige marca → sucursal; Gerente ve directo las de su marca).
  const { data: gyms = [] } = useQuery({
    queryKey: ['gyms-options'],
    queryFn: async () => {
      const [branchesRes, brandsRes] = await Promise.all([
        apiClient.get<GymOption[]>('/gyms').catch(() => []),
        apiClient.get<GymOption[]>('/gyms/brands').catch(() => []),
      ]);
      type RawGym = { id: number; name: string; parentId?: number | null; parent_id?: number | null };
      const rawBranches: RawGym[] = Array.isArray(branchesRes) ? (branchesRes as RawGym[]) : ((branchesRes as { data?: RawGym[] })?.data ?? []);
      const rawBrands: RawGym[]   = Array.isArray(brandsRes)   ? (brandsRes as RawGym[])   : ((brandsRes as { data?: RawGym[] })?.data   ?? []);
      // Dedupe por id: para Gerente/Super Admin, /gyms puede incluir la marca
      // (gym raíz, parentId null) además de las sucursales — la misma marca
      // también viene de /gyms/brands, y sin dedupe se duplicaba en los
      // selectores (options con key repetida).
      const byId = new Map<number, GymOption>();
      rawBrands.forEach((g)   => byId.set(g.id, { id: g.id, name: g.name, parentId: null }));
      rawBranches.forEach((g) => {
        if (!byId.has(g.id)) byId.set(g.id, { id: g.id, name: g.name, parentId: (g.parentId ?? g.parent_id ?? null) });
      });
      return [...byId.values()] as GymOption[];
    },
    enabled: needsGymPicker,
  });
  const brands = gyms.filter(g => g.parentId == null);
  const branches = isGerente
    ? gyms.filter(g => g.parentId != null)
    : ownerBrandId
      ? gyms.filter(g => g.parentId === Number(ownerBrandId))
      : [];

  // Pre-poblar la Marca al editar un plan de sucursal (Super Admin): 'gyms'
  // llega async, así que esto NO puede ir en el useState inicial (correría
  // antes de que la query resuelva y se quedaría vacío para siempre). Reacciona
  // a 'gyms' igual que UsuariosView lo hace para la cascada Marca→Sucursal del
  // usuario — mismo patrón, mismo motivo.
  useEffect(() => {
    if (!isSuperAdmin || !isEdit || plan?.gymId == null || gyms.length === 0) return;
    const branch = gyms.find(g => g.id === plan.gymId);
    if (branch?.parentId != null) {
      setOwnerBrandId(String(branch.parentId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms, isSuperAdmin, isEdit, plan?.gymId]);

  const handleSave = async () => {
    const trimmed = name.trim();
    const priceNum = parseFloat(price);
    if (!trimmed) { toast.error('El nombre del plan es obligatorio.'); return; }
    if (isNaN(priceNum) || priceNum <= 0) { toast.error('El precio debe ser mayor a 0.'); return; }
    if (needsGymPicker && !ownerGymId) {
      toast.error(isSuperAdmin ? 'Selecciona la sucursal dueña o "Global".' : 'Selecciona la sucursal dueña del plan.');
      return;
    }

    const body: Record<string, unknown> = {
      name: trimmed,
      description: description.trim() || undefined,
      priceMonthly: priceNum,
      scope: callerLevel === 4 ? 'SUCURSAL' : scope,
    };
    if (needsGymPicker) {
      body.gymId = ownerGymId === 'GLOBAL' ? null : Number(ownerGymId);
    }
    if (planType === 'FECHA') {
      const d = parseInt(durationDays, 10);
      if (!d || d < 1) { toast.error('La duración en días debe ser al menos 1.'); return; }
      body.durationDays = d;
      body.sessionsIncluded = null;
      body.windowDays = null;
    } else {
      const s = parseInt(sessionsIncluded, 10);
      const w = parseInt(windowDays, 10);
      if (!s || s < 1) { toast.error('Las sesiones incluidas deben ser al menos 1.'); return; }
      if (!w || w < 1) { toast.error('La ventana en días debe ser al menos 1.'); return; }
      body.sessionsIncluded = s;
      body.windowDays = w;
      body.durationDays = null;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await apiClient.put(`/subscriptions/plans/${plan!.id}`, body, { _skipErrorToast: true } as never);
        toast.success('Plan actualizado.');
      } else {
        await apiClient.post('/subscriptions/plans', body, { _skipErrorToast: true } as never);
        toast.success('Plan creado.');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo guardar el plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} isDirty={dirty} onFormChange={() => setDirty(true)}>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
        {isEdit ? 'Editar Plan' : 'Nuevo Plan de Membresía'}
      </h2>

      <label className={labelCls}>Nombre *</label>
      <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mensualidad Regular" maxLength={100} />

      <label className={labelCls}>Descripción</label>
      <textarea className={inputCls} rows={2} value={description ?? ''} onChange={e => setDesc(e.target.value)} placeholder="Breve descripción del plan..." maxLength={300} />

      <label className={labelCls}>Precio (Bs.) *</label>
      <input className={inputCls} type="number" min="1" step="0.5" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ej: 350" />

      <label className={labelCls}>Tipo de plan *</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPlanType('FECHA')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
            planType === 'FECHA'
              ? 'border-brand-orange text-brand-orange bg-brand-orange/10'
              : 'border-slate-300 dark:border-[#3A3A3C] text-slate-600 dark:text-gray-400 bg-transparent'
          }`}
        >
          <CalendarDays size={15} /> Por fecha
        </button>
        <button
          type="button"
          onClick={() => setPlanType('SESIONES')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
            planType === 'SESIONES'
              ? 'border-brand-orange text-brand-orange bg-brand-orange/10'
              : 'border-slate-300 dark:border-[#3A3A3C] text-slate-600 dark:text-gray-400 bg-transparent'
          }`}
        >
          <Dumbbell size={15} /> Por sesiones
        </button>
      </div>

      {planType === 'FECHA' ? (
        <>
          <label className={labelCls}>Duración (días calendario) *</label>
          <input className={inputCls} type="number" min="1" value={durationDays} onChange={e => setDurationDays(e.target.value)} placeholder="Ej: 30" />
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
            La membresía vence al cumplirse los días, se use o no. Ej: mensualidad regular de 30 días.
          </p>
        </>
      ) : (
        <>
          <label className={labelCls}>Sesiones incluidas *</label>
          <input className={inputCls} type="number" min="1" value={sessionsIncluded} onChange={e => setSessionsIncluded(e.target.value)} placeholder="Ej: 30" />
          <label className={labelCls}>Ventana para consumirlas (días) *</label>
          <input className={inputCls} type="number" min="1" value={windowDays} onChange={e => setWindowDays(e.target.value)} placeholder="Ej: 60" />
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
            Solo cuentan los ingresos reales del cliente (check-ins). Vence al agotar las sesiones o la ventana, lo que ocurra primero.
          </p>
        </>
      )}

      {needsGymPicker && (
        <>
          {isSuperAdmin && (
            <>
              <label className={labelCls}>Marca</label>
              <select
                className={inputCls}
                value={ownerBrandId}
                onChange={e => {
                  setOwnerBrandId(e.target.value);
                  // "Global" no depende de una marca — solo se limpia la sucursal
                  if (ownerGymId !== 'GLOBAL') setOwnerGymId('');
                }}
              >
                <option value="">— Selecciona una marca (o "Global" abajo) —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </>
          )}

          <label className={labelCls}>Sucursal dueña del plan *</label>
          <select className={inputCls} value={ownerGymId} onChange={e => setOwnerGymId(e.target.value)}>
            <option value="" disabled>— Selecciona una opción —</option>
            {isSuperAdmin && <option value="GLOBAL">Global — disponible en toda la red</option>}
            {branches.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
            {ownerGymId === 'GLOBAL'
              ? 'Este plan estará disponible para inscribir en cualquier sucursal de la red.'
              : 'Solo esa sucursal podrá vender este plan.'}
          </p>
        </>
      )}

      {callerLevel !== 4 && (
        <>
          <label className={labelCls}>Alcance de acceso *</label>
          <select className={inputCls} value={scope} onChange={e => setScope(e.target.value as 'SUCURSAL' | 'MARCA')}>
            <option value="SUCURSAL">Sucursal única — solo la sucursal donde se inscribe</option>
            <option value="MARCA">Toda la marca (VIP) — cualquier sucursal de la red</option>
          </select>
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
            Define en qué sucursales el cliente puede hacer check-in con esta membresía.
          </p>
        </>
      )}

      <div className="flex gap-3 justify-end mt-6">
        <button className={btnGhost} onClick={onClose}>Cancelar</button>
        <button className={btnPrimary} onClick={() => setConfirmSave(true)} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Plan'}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={() => { setConfirmSave(false); handleSave(); }}
        title={isEdit ? 'Guardar cambios' : 'Crear Plan'}
        message={isEdit ? '¿Estás seguro de guardar los cambios en este plan?' : '¿Estás seguro de crear este nuevo plan de membresía?'}
        confirmLabel={isEdit ? 'Sí, guardar' : 'Sí, crear'}
      />
    </ModalOverlay>
  );
};

// ─── Tab: Gestión de Planes ──────────────────────────────────────────────────

const PlanesTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalPlan, setModalPlan] = useState<PlanDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanDto | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Cada sucursal gestiona sus planes (Recepcionista: los suyos; Gerente:
  // los de su marca; Super Admin: todos + globales). Los planes GLOBALES
  // solo los edita el Super Admin — gate por fila, no por vista.
  const callerLevel = user?.level ?? 0;
  const canManagePlan = (p: PlanDto) => p.gymId != null || callerLevel >= 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { page, setPage, limit, offset } = usePagination(20, [debouncedSearch]);

  // Paginado server-side (mismo patrón que Inscripciones/Usuarios) — evita
  // cargar todo el catálogo de planes de la red de una sola vez cuando crece
  // (una sucursal con muchos planes, o Super Admin viendo todo el territorio).
  const { data: queryData, isLoading } = useQuery({
    queryKey: ['membership-plans-paged', page, limit, debouncedSearch],
    queryFn: async () => {
      const res = await apiClient.get('/subscriptions/plans', {
        params: { limit, offset, search: debouncedSearch || undefined },
      });
      return res.data as { data: PlanDto[]; meta: { total: number; limit: number; offset: number } };
    },
  });
  const plans = queryData?.data ?? [];
  const meta = queryData?.meta ?? { total: 0, limit, offset };
  const hasActiveFilters = !!search;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['membership-plans-paged'] });
    // InscribirTab usa el catálogo completo (sin paginar) para su selector — mantenerlo fresco también.
    queryClient.invalidateQueries({ queryKey: ['membership-plans'] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/subscriptions/plans/${deleteTarget.id}`, { _skipErrorToast: true } as never);
      toast.success('Plan eliminado.');
      refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo eliminar el plan.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="relative flex-1" style={{ maxWidth: '360px' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plan por nombre..."
            className={`${inputCls} pl-9`}
          />
        </div>
        <button className={`${btnPrimary} flex items-center gap-2 shrink-0`} onClick={() => { setModalPlan(null); setModalOpen(true); }}>
          <Plus size={16} /> Nuevo Plan
        </button>
      </div>

      {!isLoading && (
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">
          {meta.total} plan{meta.total === 1 ? '' : 'es'} en tu territorio
          {hasActiveFilters ? ` que coinciden con "${debouncedSearch}"` : ''}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-gray-400 py-8 text-center">Cargando planes...</p>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-gray-500">
          <CreditCard size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">{hasActiveFilters ? 'Sin resultados para esa búsqueda.' : 'Sin planes de membresía'}</p>
          {hasActiveFilters ? (
            <button className={`${btnGhost} mt-3`} onClick={() => setSearch('')}>Limpiar búsqueda</button>
          ) : (
            <p className="text-sm">Crea el primero con el botón "Nuevo Plan".</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2C2C2E]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1C1C1E] text-left text-xs uppercase tracking-wide text-slate-500 dark:text-gray-500">
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Modalidad</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-[#2C2C2E]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-slate-500 dark:text-gray-500 max-w-md truncate">{p.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.gymId == null ? (
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-sky-500/15 text-sky-400">Global (red)</span>
                    ) : (
                      <span className="text-slate-700 dark:text-gray-300 text-xs">{p.gym?.name ?? `Sucursal #${p.gymId}`}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-gray-300">{fmtPrice(p.priceMonthly)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        isSessionPlan(p) ? 'bg-purple-500/15 text-purple-400' : 'bg-sky-500/15 text-sky-400'
                      }`}>
                        {isSessionPlan(p) ? <Dumbbell size={12} /> : <CalendarDays size={12} />}
                        {planTypeLabel(p)}
                      </span>
                      {p.scope === 'MARCA' && (
                        <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-400">
                          VIP toda la marca
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManagePlan(p) && (
                      <div className="flex justify-end gap-1">
                        <button
                          title="Editar plan"
                          className="p-2 rounded-lg text-sky-500 hover:bg-sky-500/10 cursor-pointer bg-transparent border-0"
                          onClick={() => { setModalPlan(p); setModalOpen(true); }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          title="Eliminar plan"
                          className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent border-0"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls page={page} limit={meta.limit} total={meta.total} onPageChange={setPage} />
        </div>
      )}

      {modalOpen && (
        <PlanModal plan={modalPlan} onClose={() => setModalOpen(false)} onSaved={refresh} />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar plan"
        message={`El plan "${deleteTarget?.name}" se eliminará permanentemente. Solo es posible si no tiene inscripciones asociadas. Esta acción no se puede deshacer.`}
      />
    </div>
  );
};

// ─── Tab: Inscribir Cliente ──────────────────────────────────────────────────

const InscribirTab = () => {
  const { user } = useAuth();
  const callerLevel = user?.level ?? 0;
  const isSuperAdmin = callerLevel >= 10;
  const isGerente = callerLevel === 5;
  // Recepcionista (level 4): el backend fuerza su propia sucursal, sin selector.
  const needsGymPicker = isSuperAdmin || isGerente;

  const queryClient = useQueryClient();
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedGymId, setSelectedGymId]     = useState('');
  const [startDate, setStartDate]           = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [confirmInscribir, setConfirmInscribir] = useState(false);

  // Debounce: sin esto, cada tecla dispara un request — con múltiples
  // requests de búsqueda superpuestos (uno por tecla) la última respuesta en
  // llegar no siempre es la de la última tecla escrita, así que la lista
  // podía "parpadear" a un resultado desactualizado.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: plans = [] } = useQuery({
    queryKey: ['membership-plans'],
    queryFn: async () => unwrapArray<PlanDto>((await apiClient.get('/subscriptions/plans')).data),
  });

  // Búsqueda GLOBAL de clientes (endpoint sin filtro territorial): los
  // clientes son transversales — se registran desde la app y pueden
  // inscribir su membresía en cualquier sucursal de la red. Paginada por
  // páginas de 30 (tope del backend, compartido con el buscador de chat) —
  // "Cargar más resultados" pide la siguiente página en vez de perder en
  // silencio los clientes que exceden el primer tope.
  const CLIENT_PAGE_SIZE = 30;
  const {
    data: clientPages,
    isFetching: searching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['membership-client-search', debouncedSearch],
    queryFn: async ({ pageParam }) =>
      unwrapArray<ClientSearchResult>(
        (await apiClient.get('/users/chat/clients', { params: { search: debouncedSearch, offset: pageParam } })).data,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CLIENT_PAGE_SIZE ? allPages.length * CLIENT_PAGE_SIZE : undefined,
    enabled: debouncedSearch.length >= 2,
  });
  const clients = useMemo(() => clientPages?.pages.flat() ?? [], [clientPages]);

  // Sucursales/marcas: mismo patrón que ActividadesView — /gyms ya viene
  // territorialmente filtrado por el backend (Gerente solo ve su marca).
  const { data: gyms = [] } = useQuery({
    queryKey: ['gyms-options'],
    queryFn: async () => {
      const [branchesRes, brandsRes] = await Promise.all([
        apiClient.get<GymOption[]>('/gyms').catch(() => []),
        apiClient.get<GymOption[]>('/gyms/brands').catch(() => []),
      ]);
      type RawGym = { id: number; name: string; parentId?: number | null; parent_id?: number | null };
      const rawBranches: RawGym[] = Array.isArray(branchesRes) ? (branchesRes as RawGym[]) : ((branchesRes as { data?: RawGym[] })?.data ?? []);
      const rawBrands: RawGym[]   = Array.isArray(brandsRes)   ? (brandsRes as RawGym[])   : ((brandsRes as { data?: RawGym[] })?.data   ?? []);
      // Dedupe por id: para Gerente/Super Admin, /gyms puede incluir la marca
      // (gym raíz, parentId null) además de las sucursales — la misma marca
      // también viene de /gyms/brands, y sin dedupe se duplicaba en los
      // selectores (options con key repetida).
      const byId = new Map<number, GymOption>();
      rawBrands.forEach((g)   => byId.set(g.id, { id: g.id, name: g.name, parentId: null }));
      rawBranches.forEach((g) => {
        if (!byId.has(g.id)) byId.set(g.id, { id: g.id, name: g.name, parentId: (g.parentId ?? g.parent_id ?? null) });
      });
      return [...byId.values()] as GymOption[];
    },
    enabled: needsGymPicker,
  });
  const brands = gyms.filter(g => g.parentId == null);
  const filteredBranches = isGerente
    ? gyms.filter(g => g.parentId != null)
    : selectedBrandId
      ? gyms.filter(g => g.parentId === Number(selectedBrandId))
      : [];

  // Solo planes vendibles en la sucursal elegida: globales (gymId null) o
  // propios de esa sucursal. Recepcionista: el backend ya devuelve los suyos.
  const sellablePlans = useMemo(() => {
    if (!needsGymPicker) return plans;
    if (!selectedGymId) return plans.filter(p => p.gymId == null);
    return plans.filter(p => p.gymId == null || Number(p.gymId) === Number(selectedGymId));
  }, [plans, needsGymPicker, selectedGymId]);

  const selectedPlan = useMemo(
    () => sellablePlans.find(p => String(p.id) === selectedPlanId) ?? null,
    [sellablePlans, selectedPlanId],
  );

  const endDate = useMemo(() => {
    if (!selectedPlan || !startDate) return null;
    const days = isSessionPlan(selectedPlan)
      ? Number(selectedPlan.windowDays ?? 0)
      : Number(selectedPlan.durationDays ?? 0);
    return days > 0 ? addDaysISO(startDate, days) : null;
  }, [selectedPlan, startDate]);

  const canSubmit =
    !!selectedClient && !!selectedPlan && !!startDate && !!endDate &&
    (!needsGymPicker || !!selectedGymId) && !saving;

  const handleInscribir = async () => {
    if (!canSubmit || !selectedClient || !selectedPlan || !endDate) return;
    setSaving(true);
    try {
      await apiClient.post(
        '/subscriptions',
        {
          userId: selectedClient.id,
          planId: selectedPlan.id,
          startDate,
          endDate,
          ...(needsGymPicker && selectedGymId ? { homeGymId: Number(selectedGymId) } : {}),
        },
        { _skipErrorToast: true } as never,
      );
      const fullName = `${selectedClient.firstName} ${selectedClient.lastName}`.trim() || selectedClient.email;
      toast.success(`Membresía "${selectedPlan.name}" inscrita para ${fullName}.`);
      setSelectedClient(null);
      setSearch('');
      setSelectedPlanId('');
      setSelectedBrandId('');
      setSelectedGymId('');
      setStartDate(todayISO());
      queryClient.invalidateQueries({ queryKey: ['memberships-territory'] });
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
      if (resp?.status === 409) {
        toast.error(resp?.data?.message || 'El cliente ya tiene una membresía activa.');
      } else {
        toast.error(resp?.data?.message || 'No se pudo inscribir la membresía.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Paso 1: cliente */}
      <label className={labelCls}>1. Buscar cliente</label>
      {selectedClient ? (
        <div className="flex items-center justify-between rounded-lg border border-brand-orange/50 bg-brand-orange/5 px-4 py-3">
          <div>
            <div className="font-medium text-slate-900 dark:text-white">
              {`${selectedClient.firstName} ${selectedClient.lastName}`.trim() || selectedClient.email}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-500">
              {selectedClient.email}{selectedClient.ci ? ` · CI ${selectedClient.ci}` : ''}
            </div>
          </div>
          <button className={btnGhost} onClick={() => { setSelectedClient(null); setSearch(''); }}>
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
            <input
              className={`${inputCls} pl-9`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nombre o apellido del cliente (mínimo 2 letras)..."
            />
          </div>
          {search.trim().length > 0 && search.trim().length < 2 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-500">Escribe al menos 2 letras para buscar.</p>
          )}
          {debouncedSearch.length >= 2 && (
            <div className="mt-2 rounded-lg border border-slate-200 dark:border-[#2C2C2E] overflow-hidden">
              {searching && clients.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500 dark:text-gray-500">Buscando...</p>
              ) : clients.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500 dark:text-gray-500">Sin clientes que coincidan con "{debouncedSearch}".</p>
              ) : (
                <>
                  <p className="px-4 py-2 text-xs text-slate-500 dark:text-gray-500 bg-slate-50 dark:bg-[#1C1C1E] border-b border-slate-200 dark:border-[#2C2C2E]">
                    {clients.length} resultado{clients.length === 1 ? '' : 's'}{hasNextPage ? ' (hay más — refina la búsqueda o carga más abajo)' : ''}
                  </p>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2C2C2E]">
                    {clients.map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-4 py-2.5 bg-transparent hover:bg-slate-50 dark:hover:bg-[#1C1C1E] cursor-pointer border-0"
                        onClick={() => setSelectedClient(c)}
                      >
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {`${c.firstName} ${c.lastName}`.trim() || c.email}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-gray-500">
                          {c.email}{c.ci ? ` · CI ${c.ci}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                  {hasNextPage && (
                    <button
                      className="w-full text-center px-4 py-2.5 text-sm font-medium text-brand-orange bg-slate-50 dark:bg-[#1C1C1E] hover:bg-slate-100 dark:hover:bg-[#2C2C2E] cursor-pointer border-0 border-t border-slate-200 dark:border-[#2C2C2E] disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isFetchingNextPage}
                      onClick={() => fetchNextPage()}
                    >
                      {isFetchingNextPage ? 'Cargando...' : 'Cargar más resultados'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Paso 2: sucursal — Super Admin (marca + sucursal) / Gerente (sucursal de su marca) */}
      {needsGymPicker && (
        <>
          {isSuperAdmin && (
            <>
              <label className={labelCls}>2. Marca</label>
              <select
                className={inputCls}
                value={selectedBrandId}
                onChange={e => {
                  setSelectedBrandId(e.target.value);
                  setSelectedGymId('');
                  setSelectedPlanId(''); // el plan depende de la sucursal
                }}
              >
                <option value="">— Selecciona una marca —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </>
          )}
          {(isGerente || selectedBrandId) && (
            <>
              <label className={labelCls}>{isSuperAdmin ? '3. Sucursal' : '2. Sucursal'}</label>
              <select
                className={inputCls}
                value={selectedGymId}
                onChange={e => {
                  setSelectedGymId(e.target.value);
                  setSelectedPlanId(''); // los planes vendibles cambian con la sucursal
                }}
              >
                <option value="">— Selecciona una sucursal —</option>
                {filteredBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </>
          )}
        </>
      )}

      {/* Paso: plan */}
      <label className={labelCls}>{isSuperAdmin ? '4' : isGerente ? '3' : '2'}. Plan de membresía</label>
      <select className={inputCls} value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}>
        <option value="">
          {needsGymPicker && !selectedGymId
            ? 'Selecciona primero la sucursal (o elige un plan global)'
            : 'Selecciona un plan'}
        </option>
        {sellablePlans.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} — {fmtPrice(p.priceMonthly)} ({planTypeLabel(p)}){p.gymId == null ? ' · Global' : ''}
          </option>
        ))}
      </select>

      {/* Paso: fecha — al editarla, el vencimiento del resumen se recalcula
          automáticamente (useMemo) y el backend lo re-deriva del plan igual. */}
      <label className={labelCls}>{isSuperAdmin ? '5' : isGerente ? '4' : '3'}. Fecha de inicio</label>
      <input
        className={inputCls}
        type="date"
        value={startDate}
        min={startOfMonthISO()}
        onChange={e => setStartDate(e.target.value)}
      />

      {selectedPlan && endDate && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#2C2C2E] bg-slate-50 dark:bg-[#1C1C1E] px-4 py-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-gray-500">Inscripción</span>
            <span className="text-slate-900 dark:text-white font-medium">{startDate}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-gray-500">
              {isSessionPlan(selectedPlan) ? 'Fin de ventana' : 'Vencimiento'}
            </span>
            <span className="text-slate-900 dark:text-white font-medium">{endDate}</span>
          </div>
          {isSessionPlan(selectedPlan) && (
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500 dark:text-gray-500">Sesiones incluidas</span>
              <span className="text-slate-900 dark:text-white font-medium">{selectedPlan.sessionsIncluded}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <button className={btnPrimary} onClick={() => setConfirmInscribir(true)} disabled={!canSubmit}>
          {saving ? 'Inscribiendo...' : 'Inscribir Membresía'}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmInscribir}
        onClose={() => setConfirmInscribir(false)}
        onConfirm={() => { setConfirmInscribir(false); handleInscribir(); }}
        title="Inscribir membresía"
        message={`¿Estás seguro de inscribir la membresía "${selectedPlan?.name ?? ''}" a ${selectedClient ? (`${selectedClient.firstName} ${selectedClient.lastName}`.trim() || selectedClient.email) : ''}?`}
        confirmLabel="Sí, inscribir"
      />
    </div>
  );
};

// ─── Tab: Inscripciones del territorio ───────────────────────────────────────

const INSCRIPCIONES_STATUS_OPTIONS = ['ACTIVA', 'VENCIDA', 'CONGELADA', 'CANCELADA'];

const InscripcionesTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const callerLevel = user?.level ?? 0;
  const needsGymFilter = callerLevel === 5 || callerLevel >= 10;

  const [cancelTarget, setCancelTarget] = useState<SubscriptionDto | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<SubscriptionDto | null>(null);
  const [cardUserId, setCardUserId] = useState<number | null>(null);
  const [freezingId, setFreezingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterGymId, setFilterGymId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { page, setPage, limit, offset } = usePagination(20, [debouncedSearch, filterGymId, filterDate, filterStatus]);

  // Sucursales del territorio del caller (Gerente: las de su marca; Super Admin: todas).
  const { data: gymOptions = [] } = useQuery({
    queryKey: ['membership-filter-gyms'],
    queryFn: async () => {
      const res = await apiClient.get<GymOption[]>('/gyms').catch(() => []);
      type RawGym = { id: number; name: string };
      const raw: RawGym[] = Array.isArray(res) ? (res as RawGym[]) : ((res as { data?: RawGym[] })?.data ?? []);
      return raw.map((g) => ({ id: g.id, name: g.name })) as { id: number; name: string }[];
    },
    enabled: needsGymFilter,
  });

  const subsKey = ['memberships-territory', page, limit, debouncedSearch, filterGymId, filterDate, filterStatus] as const;

  const { data: queryData, isLoading } = useQuery({
    queryKey: subsKey,
    queryFn: async () => {
      const res = await apiClient.get('/subscriptions', {
        params: {
          search: debouncedSearch || undefined,
          gymId: filterGymId ? Number(filterGymId) : undefined,
          date: filterDate || undefined,
          status: filterStatus || undefined,
          limit,
          offset,
        },
      });
      const body = res.data as { data: SubscriptionDto[]; meta: { total: number; limit: number; offset: number } } | SubscriptionDto[];
      if (Array.isArray(body)) return { data: body, meta: { total: body.length, limit, offset } };
      return body;
    },
  });
  const subs = useMemo(() => queryData?.data ?? [], [queryData]);
  const meta = queryData?.meta ?? { total: 0, limit, offset };

  const hasActiveFilters = !!(search || filterGymId || filterDate || filterStatus);
  const resetFilters = () => {
    setSearch(''); setDebouncedSearch('');
    setFilterGymId(''); setFilterDate(''); setFilterStatus('');
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await apiClient.put(`/subscriptions/${cancelTarget.id}`, { status: 'CANCELADA' }, { _skipErrorToast: true } as never);
      toast.success('Membresía cancelada.');
      queryClient.invalidateQueries({ queryKey: ['memberships-territory'] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo cancelar.');
    } finally {
      setCancelTarget(null);
    }
  };

  // Congelar/Descongelar: requiere confirmación explícita (el backend ya
  // calcula la extensión de vencimiento por los días congelados, pero
  // afecta el conteo real de la membresía del cliente — no es trivial).
  const handleToggleFreeze = async () => {
    if (!freezeTarget) return;
    const sub = freezeTarget;
    const freezing = sub.status === 'ACTIVA' || sub.status === 'ACTIVO';
    setFreezingId(sub.id);
    setFreezeTarget(null);
    try {
      await apiClient.put(
        `/subscriptions/${sub.id}`,
        { status: freezing ? 'CONGELADA' : 'ACTIVA' },
        { _skipErrorToast: true } as never,
      );
      toast.success(freezing ? 'Membresía congelada.' : 'Membresía reactivada — vencimiento extendido por los días congelados.');
      queryClient.invalidateQueries({ queryKey: ['memberships-territory'] });
      queryClient.invalidateQueries({ queryKey: ['membership-freeze-logs'] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo actualizar la membresía.');
    } finally {
      setFreezingId(null);
    }
  };

  return (
    <div>
      {(isLoading || meta.total > 0 || hasActiveFilters) && (
        <div className="flex flex-col md:flex-row flex-wrap gap-3 items-center mb-4">
          <div className="relative flex-1" style={{ minWidth: '200px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email del cliente..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <input
            type="date"
            className={inputCls}
            style={{ maxWidth: '170px' }}
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            title="Membresías vigentes en esta fecha"
          />
          {needsGymFilter && gymOptions.length > 0 && (
            <select className={inputCls} style={{ maxWidth: '200px' }} value={filterGymId} onChange={e => setFilterGymId(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {gymOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <select className={inputCls} style={{ maxWidth: '160px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {INSCRIPCIONES_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasActiveFilters && (
            <button className={btnGhost} onClick={resetFilters}>Limpiar filtros</button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-gray-400 py-8 text-center">Cargando inscripciones...</p>
      ) : subs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">{hasActiveFilters ? 'Sin resultados para los filtros aplicados.' : 'Sin membresías registradas'}</p>
          {hasActiveFilters ? (
            <button className={`${btnGhost} mt-3`} onClick={resetFilters}>Limpiar filtros</button>
          ) : (
            <p className="text-sm">Las inscripciones de tu territorio aparecerán aquí.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2C2C2E]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1C1C1E] text-left text-xs uppercase tracking-wide text-slate-500 dark:text-gray-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {subs.map(s => {
                const isActive = s.status === 'ACTIVA' || s.status === 'ACTIVO';
                const isFrozen = s.status === 'CONGELADA';
                return (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-[#2C2C2E]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{clientName(s.user)}</div>
                      <div className="text-xs text-slate-500 dark:text-gray-500">{s.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">{s.plan?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300 whitespace-nowrap">
                      {String(s.startDate).split('T')[0]} → {String(s.endDate).split('T')[0]}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">{s.homeGym?.name ?? 'Global'}</td>
                    <td className="px-4 py-3">
                      <span
                        title={isFrozen && s.frozenAt ? `Congelada desde ${String(s.frozenAt).split('T')[0]}` : undefined}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[s.status] ?? 'bg-gray-500/15 text-gray-400'}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.user?.id != null && (
                          <button
                            title="Ver carnet de membresía"
                            className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/10 cursor-pointer bg-transparent border-0"
                            onClick={() => setCardUserId(Number(s.user!.id))}
                          >
                            <IdCard size={16} />
                          </button>
                        )}
                        {(isActive || isFrozen) && (
                          <button
                            title={isFrozen ? 'Descongelar (extiende el vencimiento por los días congelados)' : 'Congelar membresía'}
                            disabled={freezingId === s.id}
                            className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-500/10 cursor-pointer bg-transparent border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setFreezeTarget(s)}
                          >
                            {isFrozen ? <Play size={16} /> : <Snowflake size={16} />}
                          </button>
                        )}
                        {isActive && (
                          <button
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent border border-red-500/30"
                            onClick={() => setCancelTarget(s)}
                          >
                            Cancelar
                          </button>
                        )}
                        {isFrozen && (
                          <button
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent border border-red-500/30"
                            onClick={() => setCancelTarget(s)}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls page={page} limit={meta.limit} total={meta.total} onPageChange={setPage} />
        </div>
      )}

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Cancelar membresía"
        confirmLabel="Cancelar Membresía"
        message={`La membresía "${cancelTarget?.plan?.name ?? ''}" de ${clientName(cancelTarget?.user)} quedará CANCELADA y el cliente podrá inscribir una nueva. Esta acción no se puede deshacer.`}
      />

      <ConfirmModal
        isOpen={!!freezeTarget}
        onClose={() => setFreezeTarget(null)}
        onConfirm={handleToggleFreeze}
        title={freezeTarget?.status === 'CONGELADA' ? 'Descongelar membresía' : 'Congelar membresía'}
        confirmLabel={freezeTarget?.status === 'CONGELADA' ? 'Descongelar' : 'Congelar'}
        message={
          freezeTarget?.status === 'CONGELADA'
            ? `La membresía "${freezeTarget?.plan?.name ?? ''}" de ${clientName(freezeTarget?.user)} se reactivará y su vencimiento se extenderá automáticamente por los días que estuvo congelada, a partir de hoy.`
            : `La membresía "${freezeTarget?.plan?.name ?? ''}" de ${clientName(freezeTarget?.user)} quedará CONGELADA: deja de contar días hasta que la descongeles. El tiempo restante se conserva — puedes revertirlo en cualquier momento.`
        }
      />

      {cardUserId !== null && (
        <MembershipCardModal userId={cardUserId} onClose={() => setCardUserId(null)} />
      )}
    </div>
  );
};

// ─── Tab: Historial de Congelamientos ────────────────────────────────────────
// Registro PERMANENTE, independiente de cada membresía: sobrevive aunque la
// suscripción de origen cambie de estado o se cancele. Solo lectura — no hay
// edición ni borrado, es un log de control administrativo.

const HistorialCongelamientosTab = () => {
  const { page, setPage, limit, offset } = usePagination(20, []);

  const logsKey = ['membership-freeze-logs', page, limit] as const;
  const { data: queryData, isLoading } = useQuery({
    queryKey: logsKey,
    queryFn: async () => {
      const res = await apiClient.get('/subscriptions/freeze-logs', { params: { limit, offset } });
      const body = res.data as { data: FreezeLogDto[]; meta: { total: number; limit: number; offset: number } };
      return body;
    },
  });
  const logs = queryData?.data ?? [];
  const meta = queryData?.meta ?? { total: 0, limit, offset };

  return (
    <div>
      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-gray-400 py-8 text-center">Cargando historial...</p>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-gray-500">
          <History size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin eventos de congelamiento registrados</p>
          <p className="text-sm">Cada vez que se congele o descongele una membresía de tu territorio, quedará aquí.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2C2C2E]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1C1C1E] text-left text-xs uppercase tracking-wide text-slate-500 dark:text-gray-500">
                <th className="px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Realizado por</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const isFreeze = log.action === 'CONGELAR';
                return (
                  <tr key={log.id} className="border-t border-slate-100 dark:border-[#2C2C2E]">
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300 whitespace-nowrap">{fmtDateTime(log.occurredAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        isFreeze ? 'bg-sky-500/15 text-sky-400' : 'bg-green-500/15 text-green-500'
                      }`}>
                        {isFreeze ? <Snowflake size={12} /> : <Play size={12} />}
                        {isFreeze ? 'Congelada' : 'Descongelada'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{clientName(log.user)}</div>
                      <div className="text-xs text-slate-500 dark:text-gray-500">{log.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">{log.homeGym?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">
                      {log.performedBy ? clientName(log.performedBy) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">
                      {!isFreeze && log.daysFrozen != null
                        ? `${log.daysFrozen} día${log.daysFrozen === 1 ? '' : 's'} congelada · vencimiento ${log.previousEndDate} → ${log.newEndDate}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls page={page} limit={meta.limit} total={meta.total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
};

// ─── Vista principal ─────────────────────────────────────────────────────────

type TabKey = 'planes' | 'inscribir' | 'inscripciones' | 'historial';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'planes',        label: 'Gestión de Planes', icon: <CreditCard size={15} /> },
  { key: 'inscribir',     label: 'Inscribir Cliente', icon: <Users size={15} /> },
  { key: 'inscripciones', label: 'Inscripciones',     icon: <ClipboardList size={15} /> },
  { key: 'historial',     label: 'Historial de Congelamientos', icon: <History size={15} /> },
];

export const MembresiasView = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('planes');

  if ((user?.level ?? 0) < 4) return null; // RoleGuard ya bloquea; defensa extra

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Membresías</h1>
      <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 mb-6">
        Planes de membresía e inscripción de clientes de tu sucursal.
      </p>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-[#2C2C2E]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium cursor-pointer bg-transparent border-0 border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'planes'        && <PlanesTab />}
      {tab === 'inscribir'     && <InscribirTab />}
      {tab === 'inscripciones' && <InscripcionesTab />}
      {tab === 'historial'     && <HistorialCongelamientosTab />}
    </div>
  );
};
