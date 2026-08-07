import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { ModalOverlay, ConfirmModal, EmptyState } from './Shared/DashboardShared';
import { guardClose } from './Shared/DashboardShared.utils';
import { cardCls, inputCls as sharedInputCls, labelCls as sharedLabelCls, btnPrimary as sharedBtnPrimary, btnGhost, iconBtnCls, pillCls, theadCls, trCls } from './Shared/designTokens';
import { Eye, Edit, Trash2, Plus, X, Search, GraduationCap, ChevronDown } from 'lucide-react';

//Types 
interface Activity {
  id: number;
  gymId: number;
  name: string;
  description: string;
  defaultDurationMin: number;
  isActive: boolean;
  isFreeAccess: boolean;
  gym?: { id: number; name: string };
}

interface GymOption { id: number; name: string; parentId?: number | null }

interface ActivitySchedule {
  id: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxAttendees?: number;
  instructorId?: number;
  instructor?: { email?: string };
}

interface RawUser {
  id: number | string;
  email?: string;
  profile?: { firstName?: string; lastName?: string };
  userProfiles?: { firstName?: string; lastName?: string }[];
}

const DAY_LABELS: Record<string, string> = {
  LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles',
  JUE: 'Jueves', VIE: 'Viernes', SAB: 'Sábado', DOM: 'Domingo',
};

const DAY_ORDER: Record<string, number> = {
  LUN: 0, LUNES: 0,
  MAR: 1, MARTES: 1,
  MIE: 2, MIERCOLES: 2,
  JUE: 3, JUEVES: 3,
  VIE: 4, VIERNES: 4,
  SAB: 5, SABADO: 5,
  DOM: 6, DOMINGO: 6,
};

const sortSchedules = <T extends { dayOfWeek: string; startTime: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => {
    const da = DAY_ORDER[a.dayOfWeek] ?? 99;
    const db = DAY_ORDER[b.dayOfWeek] ?? 99;
    return da !== db ? da - db : a.startTime.localeCompare(b.startTime);
  });

const HOURS_24   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_15 = ['00', '15', '30', '45'];

// Selector de hora en formato 24 h — inmune al locale del navegador
const TimeSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const parts = value.split(':');
  const h = parts[0]?.padStart(2, '0') ?? '08';
  const m = parts[1]?.substring(0, 2) ?? '00';

  const selCls = "bg-transparent text-slate-900 dark:text-gray-100 border-0 px-[0.4rem] py-[0.45rem] text-sm font-mono font-semibold cursor-pointer outline-none appearance-none text-center";

  return (
    <div className="inline-flex items-center gap-px bg-slate-50 dark:bg-bg-deep/60 border border-slate-300 dark:border-white/10 rounded-lg overflow-hidden">
      <select value={h} onChange={e => onChange(`${e.target.value}:${m}`)} className={selCls}>
        {HOURS_24.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-slate-400 dark:text-gray-500 font-bold text-[0.9rem] select-none">:</span>
      <select value={m} onChange={e => onChange(`${h}:${e.target.value}`)} className={selCls}>
        {MINUTES_15.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
};

//Styles
const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;
const ACT_NAME_MAX = 100;
const ACT_DESC_MAX = 200;

const panelStyle: CSSProperties = { padding: '2rem', minHeight: '100vh' };

const tableStyle: CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  padding: '0.85rem 1.25rem', textAlign: 'left',
};

const tdStyle: CSSProperties = {
  padding: '1rem 1.25rem',
  fontSize: '0.9rem', verticalAlign: 'middle',
};

const btnSecondaryCls = btnGhost;

const inputCls = sharedInputCls;
const labelCls = sharedLabelCls;
const fieldGap: CSSProperties = { marginBottom: '1rem' };

// ─── Activity Detail Modal ────────────────────────────────────────────────────
const ActivityDetailModal = ({
  activity, onClose, onEdit,
}: {
  activity: Activity;
  onClose: () => void;
  onEdit: () => void;
}) => {
  const [schedules,    setSchedules]    = useState<ActivitySchedule[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [instructorMap, setInstructorMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [schedRes, usersRes] = await Promise.all([
          apiClient.get(`/activities/${activity.id}/schedules`).catch(() => null),
          apiClient.get('/users').catch(() => null),
        ]);
        const rawSched: ActivitySchedule[] = Array.isArray(schedRes)
          ? (schedRes as ActivitySchedule[])
          : ((schedRes as { data?: ActivitySchedule[] })?.data ?? []);
        setSchedules(sortSchedules(rawSched.filter(Boolean)));

        const usersBody = (usersRes as { data?: unknown })?.data;
        const rawUsers: RawUser[] = Array.isArray(usersBody)
          ? (usersBody as RawUser[])
          : Array.isArray((usersBody as { data?: unknown })?.data)
            ? ((usersBody as { data: RawUser[] }).data)
            : [];
        const map = new Map<number, string>();
        rawUsers.forEach((u) => {
          const first = u?.profile?.firstName ?? u?.userProfiles?.[0]?.firstName ?? '';
          const last  = u?.profile?.lastName  ?? u?.userProfiles?.[0]?.lastName  ?? '';
          const name  = `${first} ${last}`.trim() || u?.email || `#${u?.id}`;
          map.set(Number(u.id), name);
        });
        setInstructorMap(map);
      } finally {
        setLoading(false);
      }
    })();
  }, [activity.id]);

  const field = (label: string, value: React.ReactNode, full = false): React.ReactNode => (
    <div className={`bg-slate-50 dark:bg-bg-surface border border-slate-200 dark:border-bg-deep rounded-xl p-3 ${full ? 'col-span-2' : 'col-span-1'}`}>
      <div className="text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-[0.92rem] font-medium text-slate-900 dark:text-white">{value || <span className="text-slate-400 dark:text-gray-600">—</span>}</div>
    </div>
  );

  return (
    <ModalOverlay onClose={onClose}>
      {/* Wrapper flex-column ocupa todo el modal */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        {/* Header fijo */}
        <div className="flex justify-between items-start flex-shrink-0 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.08em] mb-[0.2rem] text-brand-orange">
              Ficha del Servicio · #{activity.id}
            </div>
            <h2 className="m-0 text-[1.35rem] font-bold text-slate-900 dark:text-white">{activity.name}</h2>
          </div>
          <button onClick={onClose} className={`${iconBtnCls} text-slate-500 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400 flex-shrink-0`}>
            <X size={16} />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '0.2rem' }}>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {field('Gimnasio / Sucursal', activity.gym?.name ?? `Gym #${activity.gymId}`)}
            {field('Duración', activity.defaultDurationMin ? `${activity.defaultDurationMin} min` : 'No definida')}
            {field('Tipo', activity.isFreeAccess
              ? <span className="font-bold text-brand-orange">Acceso Libre</span>
              : <span className="font-bold text-sky-400">Con Horarios</span>
            )}
            {field('Estado', activity.isActive
              ? <span className="font-bold text-[#00E5A3]">● Activa</span>
              : <span className="font-bold text-red-400">● Inactiva</span>
            )}
            {field('Descripción', activity.description, true)}
          </div>

          {/* Horarios */}
          {!activity.isFreeAccess && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-4">
              <div className="text-xs font-bold uppercase tracking-[0.06em] mb-2.5 text-brand-orange">
                Horarios de Clase
              </div>
              {loading ? (
                <p className="text-sm text-center py-4 text-slate-500 dark:text-gray-500">Cargando horarios...</p>
              ) : schedules.length === 0 ? (
                <p className="text-sm italic text-center py-2 text-slate-500 dark:text-gray-500">Sin horarios configurados</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {schedules.map(s => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 bg-slate-50 dark:bg-bg-deep/60 border border-brand-orange/25">
                      <span className="font-bold text-[0.78rem] min-w-[42px] text-brand-orange">{DAY_LABELS[s.dayOfWeek] ?? s.dayOfWeek}</span>
                      <span className="text-[0.87rem] flex-1 text-slate-700 dark:text-gray-200">
                        {s.startTime.substring(0, 5)} – {s.endTime.substring(0, 5)}
                      </span>
                      {s.maxAttendees && (
                        <span className="text-xs text-slate-500 dark:text-gray-500">{s.maxAttendees} cupos</span>
                      )}
                      {s.instructorId && (
                        <span className="text-xs max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap text-slate-500 dark:text-gray-500">
                          Inst. {instructorMap.get(Number(s.instructorId)) ?? s.instructor?.email ?? `#${s.instructorId}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div className="flex gap-2.5 mt-4 pt-3 border-t border-slate-200 dark:border-bg-deep flex-shrink-0">
          <button onClick={onClose} className={`${btnSecondaryCls} flex-1`}>Cerrar</button>
          <button onClick={onEdit} className={`${sharedBtnPrimary} flex-1 inline-flex items-center justify-center gap-1.5`}><Edit size={14} />Editar Servicio</button>
        </div>
      </div>
    </ModalOverlay>
  );
};

//Form Modal
const ActivityFormModal = ({
  initial, gyms, userGymId, callerLevel, gerenteBrandId, onClose, onSaved,
}: {
  initial: Activity | null;
  gyms: GymOption[];
  userGymId: number | null;
  callerLevel: number;
  gerenteBrandId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isEdit = !!initial;

  const resolveInitialGymId = () => {
    if (isEdit) {
      const initId = initial!.gymId;
      // Si el Gerente edita un servicio cuyo gymId apunta a una marca (parentId=null),
      // es dato corrupto del bug anterior — forzar re-selección de sucursal.
      if (callerLevel === 5) {
        const isBranch = gyms.some(g => g.id === initId && g.parentId != null);
        return isBranch ? String(initId) : '';
      }
      return String(initId);
    }
    if (callerLevel === 5) return ''; // Gerente elige sucursal mediante el selector
    if (userGymId) return String(userGymId);
    if (gyms.length === 1) return String(gyms[0].id);
    return '';
  };

  // ── Campos básicos ──
  const [gymId,       setGymId]       = useState<string>(resolveInitialGymId);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(() => {
    // NO derivar desde 'gyms' aquí: este inicializador corre UNA sola vez al
    // montar, antes de que la query del padre necesariamente haya resuelto —
    // si 'gyms' llega vacío en ese instante, quedaría vacío para siempre. La
    // derivación por gymId vive en el useEffect de abajo, reactivo a 'gyms'.
    if (callerLevel === 5 && gerenteBrandId) return String(gerenteBrandId);
    return '';
  });

  // Pre-poblar la Marca al editar un servicio de sucursal (Super Admin):
  // reacciona a 'gyms' en vez de derivarlo solo en el montaje inicial (mismo
  // patrón que UsuariosView usa para su cascada Marca→Sucursal).
  useEffect(() => {
    if (!isEdit || !initial?.gymId || gyms.length === 0) return;
    const branch = gyms.find(g => g.id === initial.gymId);
    if (branch?.parentId != null) {
      setSelectedBrandId(String(branch.parentId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms, isEdit, initial?.gymId]);
  const [name,        setName]        = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [duration,    setDuration]    = useState(
    initial?.defaultDurationMin ? String(initial.defaultDurationMin) : ''
  );
  const [isFreeAccess, setIsFreeAccess] = useState(initial?.isFreeAccess ?? false);
  const [isActive,     setIsActive]     = useState(initial?.isActive ?? true);
  const queryClient = useQueryClient();
  const [touched, setTouched] = useState(false);

  // ── Horarios de clase (solo en edición) ──
  const [schedules,        setSchedules]        = useState<ActivitySchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [newDay,           setNewDay]           = useState('LUN');
  const [newStart,         setNewStart]         = useState('08:00');
  const [newEnd,           setNewEnd]           = useState('09:00');
  const [newMaxAttendees,  setNewMaxAttendees]  = useState('20');
  const [newInstructorId,  setNewInstructorId]  = useState('');
  const [instructors,      setInstructors]      = useState<{ id: number; label: string }[]>([]);
  const [addingSchedule,   setAddingSchedule]   = useState(false);

  const showBrandPicker = callerLevel >= 10;
  const showBranchPicker = callerLevel >= 10 || callerLevel === 5;
  const brands = gyms.filter(g => g.parentId == null);
  const filteredBranches = callerLevel === 5
    ? gyms.filter(g => g.parentId != null)
    : selectedBrandId
      ? gyms.filter(g => g.parentId === Number(selectedBrandId))
      : [];
  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setGymId('');
    setInstructors([]);
    setNewInstructorId('');
  };

  // Cargar horarios del servidor (solo en edición)
  useEffect(() => {
    if (!isEdit || !initial?.id) return;
    setSchedulesLoading(true);
    apiClient.get(`/activities/${initial.id}/schedules`)
      .then((data: unknown) => {
        const raw: ActivitySchedule[] = Array.isArray(data)
          ? (data as ActivitySchedule[])
          : ((data as { data?: ActivitySchedule[] })?.data ?? []);
        setSchedules(sortSchedules(raw.filter(Boolean)));
      })
      .catch(() => {})
      .finally(() => setSchedulesLoading(false));
  }, [isEdit, initial?.id]);

  useEffect(() => {
    if (showBranchPicker && !gymId) {
      setInstructors([]);
      setNewInstructorId('');
      return;
    }
    apiClient.get('/activities/eligible-instructors')
      .catch(() => null)
      .then((res) => {
        const body = (res as { data?: unknown } | null)?.data;
        const raw = Array.isArray(body) ? (body as { id: number; fullName: string }[]) : [];
        const list = raw.map((u) => ({ id: u.id, label: u.fullName || `#${u.id}` }));
        setInstructors(list);
        if (list.length === 1) setNewInstructorId(String(list[0].id));
        else setNewInstructorId('');
      });
  }, [gymId, showBranchPicker]);

  const handleAddSchedule = async () => {
    if (!newStart || !newEnd)        { toast.error('Completa los horarios'); return; }
    if (newStart >= newEnd)          { toast.error('El inicio debe ser antes del fin'); return; }
    if (!newInstructorId)            { toast.error('Selecciona un instructor'); return; }
    const maxAtt = parseInt(newMaxAttendees, 10);
    if (!maxAtt || maxAtt < 1)       { toast.error('El aforo mínimo es 1'); return; }

    if (isEdit) {
      // Modo edición: POST inmediato al servidor
      setAddingSchedule(true);
      try {
        const res = await apiClient.post(`/activities/${initial!.id}/schedules`, {
          dayOfWeek:    newDay,
          startTime:    newStart,
          endTime:      newEnd,
          instructorId: Number(newInstructorId),
          maxAttendees: maxAtt,
          isRecurring:  true,
        });
        const created: ActivitySchedule = (res as { data?: ActivitySchedule })?.data ?? (res as ActivitySchedule);
        setSchedules(prev => sortSchedules([...prev, created]));
        toast.success('Horario agregado');
      } catch {
        // interceptor toasts
      } finally {
        setAddingSchedule(false);
      }
    } else {
      setSchedules(prev => sortSchedules([...prev, {
        id:           -(Date.now()),
        dayOfWeek:    newDay,
        startTime:    newStart,
        endTime:      newEnd,
        instructorId: Number(newInstructorId),
        maxAttendees: maxAtt,
      }]));
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (isEdit && scheduleId > 0) {
      // Modo edición: DELETE en el servidor
      try {
        await apiClient.delete(`/activities/${initial!.id}/schedules/${scheduleId}`);
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
        toast.success('Horario eliminado');
      } catch {
        // interceptor toasts
      }
    } else {
      // Modo creación o ID temporal: solo quitar del estado local
      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: {
      activityData: Record<string, unknown>;
      schedulesToPost: Array<Record<string, unknown>>;
    }) => {
      const res = await apiClient.post('/activities', payload.activityData);
      const body = (res as { data?: { id?: number } })?.data;
      const newId = body?.id;
      if (newId && payload.schedulesToPost.length > 0) {
        await Promise.allSettled(
          payload.schedulesToPost.map((s) => apiClient.post(`/activities/${newId}/schedules`, s))
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success('Servicio creado');
      onSaved();
      onClose();
    },
    onError: () => {},
  });

  const editMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.patch(`/activities/${initial!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success('Servicio actualizado');
      onSaved();
      onClose();
    },
    onError: () => {},
  });

  const saving = createMutation.isPending || editMutation.isPending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      toast.error('Nombre y descripción son obligatorios');
      return;
    }
    if (name.trim().length > ACT_NAME_MAX) {
      toast.error(`El nombre no puede superar los ${ACT_NAME_MAX} caracteres`);
      return;
    }
    if (GIBBERISH_RE.test(name)) {
      toast.error('El nombre parece contener caracteres aleatorios o inválidos');
      return;
    }
    if (description.trim().length > ACT_DESC_MAX) {
      toast.error(`La descripción no puede superar los ${ACT_DESC_MAX} caracteres`);
      return;
    }
    if (GIBBERISH_RE.test(description)) {
      toast.error('La descripción parece contener caracteres aleatorios o inválidos');
      return;
    }
    const parsedGymId = parseInt(gymId, 10);
    if (!parsedGymId || isNaN(parsedGymId)) {
      toast.error('Selecciona un gimnasio');
      return;
    }
    if (!isFreeAccess && schedules.length === 0) {
      toast.error('Debes agregar al menos un horario de clase o activar Acceso Libre');
      return;
    }
    if (isFreeAccess) {
      const dur = parseInt(duration, 10);
      if (!duration.trim() || isNaN(dur) || dur <= 0) {
        toast.error('La duración máxima es obligatoria para servicios de Acceso Libre');
        return;
      }
    }
    const parsedDuration = duration.trim() ? parseInt(duration, 10) : 0;

    if (isEdit) {
      editMutation.mutate({
        gymId: parsedGymId,
        name: name.trim(),
        description: description.trim(),
        defaultDurationMin: parsedDuration,
        isFreeAccess,
        isActive,
      });
    } else {
      createMutation.mutate({
        activityData: {
          gymId: parsedGymId,
          name: name.trim(),
          description: description.trim(),
          defaultDurationMin: parsedDuration,
          isFreeAccess,
        },
        schedulesToPost: schedules.map((s) => ({
          dayOfWeek:    s.dayOfWeek,
          startTime:    s.startTime.substring(0, 5),
          endTime:      s.endTime.substring(0, 5),
          instructorId: Number(s.instructorId),
          maxAttendees: Number(s.maxAttendees) || 20,
          isRecurring:  true,
        })),
      });
    }
  };

  const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;

  return (
    <ModalOverlay onClose={onClose} isDirty={touched} onFormChange={() => setTouched(true)}>
      {/* Header fijo */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-gray-800 mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white m-0">
          {isEdit ? 'Editar Servicio' : 'Nuevo Servicio'}
        </h2>
        <button
          onClick={() => guardClose(touched, onClose)}
          className="text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 bg-slate-100 dark:bg-gray-800 p-1.5 rounded border-0 cursor-pointer transition-colors flex items-center"
        ><X size={14} /></button>
      </div>

      {/* Contenido scrollable */}
      <div className="overflow-y-auto flex-1 pr-1 dark-scrollbar">
        <form onSubmit={handleSubmit} id="activity-form" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Selector marca — solo Super Admin */}
          {showBrandPicker && (
            <div style={fieldGap}>
              <label className={labelCls}>Marca *</label>
              <div className="relative">
                <select className={selectCls} value={selectedBrandId} onChange={e => handleBrandChange(e.target.value)}>
                  <option value="">— Selecciona una marca —</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <span className="absolute right-[0.85rem] top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500 text-xs">▼</span>
              </div>
            </div>
          )}
          {/* Selector sucursal — Super Admin (tras elegir marca) + Gerente (sucursales de su territorio) */}
          {showBranchPicker && (selectedBrandId || callerLevel === 5) && (
            <div style={fieldGap}>
              <label className={labelCls}>Sucursal *</label>
              <div className="relative">
                <select className={selectCls} value={gymId} onChange={e => setGymId(e.target.value)}>
                  <option value="">— Selecciona una sucursal —</option>
                  {filteredBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <span className="absolute right-[0.85rem] top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500 text-xs">▼</span>
              </div>
            </div>
          )}

          <div style={fieldGap}>
            <div className="flex justify-between items-baseline mb-1">
              <label className={labelCls} style={{ marginBottom: 0 }}>Nombre *</label>
              <span className={`text-xs ${name.length > ACT_NAME_MAX ? 'text-red-500' : name.length > ACT_NAME_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                {name.length}/{ACT_NAME_MAX}
              </span>
            </div>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej: Yoga, Spinning, Sauna..." maxLength={ACT_NAME_MAX} />
            {GIBBERISH_RE.test(name) && (
              <p className="text-amber-500 text-xs mt-1">El nombre parece contener caracteres aleatorios</p>
            )}
          </div>

          <div style={fieldGap}>
            <div className="flex justify-between items-baseline mb-1">
              <label className={labelCls} style={{ marginBottom: 0 }}>Descripción *</label>
              <span className={`text-xs ${description.length > ACT_DESC_MAX ? 'text-red-500' : description.length > ACT_DESC_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                {description.length}/{ACT_DESC_MAX}
              </span>
            </div>
            <textarea
              className={inputCls}
              style={{ minHeight: '100px', resize: 'none', lineHeight: '1.55' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descripción del servicio..."
              maxLength={ACT_DESC_MAX}
            />
            {GIBBERISH_RE.test(description) && (
              <p className="text-amber-500 text-xs mt-1">La descripción parece contener caracteres aleatorios</p>
            )}
          </div>

          {/* ── Toggle Acceso Libre ── */}
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer select-none mb-4 border ${isFreeAccess ? 'bg-gray-100 dark:bg-bg-surface border-brand-orange' : 'bg-slate-50 dark:bg-bg-surface border-slate-200 dark:border-bg-deep'}`}
            onClick={() => setIsFreeAccess(v => !v)}
          >
            <div style={{ width: '40px', height: '22px', borderRadius: '11px', background: isFreeAccess ? '#FF5E00' : undefined, position: 'relative', flexShrink: 0, transition: 'background 0.2s ease' }}
              className={!isFreeAccess ? 'bg-slate-300 dark:bg-bg-deep' : ''}>
              <div style={{ position: 'absolute', top: '3px', left: isFreeAccess ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            </div>
            <div>
              <span className={`font-semibold text-sm ${isFreeAccess ? 'text-brand-orange' : 'text-slate-700 dark:text-gray-200'}`}>
                Acceso Libre
              </span>
              <span className="block text-slate-400 dark:text-gray-500 text-xs mt-0.5">
                {isFreeAccess
                  ? 'El cliente elige libremente su horario (hora de inicio y fin). Ej: Musculación, Cardio, Zona Funcional.'
                  : 'El servicio tiene horarios fijos con instructor asignado. El cliente reserva un bloque disponible. Ej: Zumba, Spinning, Yoga.'}
              </span>
            </div>
          </div>

          {/* ── Toggle Activo/Inactivo — solo visible en edición ── */}
          {isEdit && (
            <div
              className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer select-none mb-4 border ${isActive ? 'bg-slate-50 dark:bg-bg-surface border-slate-200 dark:border-bg-deep' : 'bg-gray-100 dark:bg-bg-surface border-red-400'}`}
              onClick={() => setIsActive(v => !v)}
            >
              <div style={{ width: '40px', height: '22px', borderRadius: '11px', background: isActive ? '#00E5A3' : '#ef4444', position: 'relative', flexShrink: 0, transition: 'background 0.2s ease' }}>
                <div style={{ position: 'absolute', top: '3px', left: isActive ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
              </div>
              <div>
                <span className={`font-semibold text-sm ${isActive ? 'text-green-600 dark:text-[#00E5A3]' : 'text-red-500'}`}>
                  {isActive ? 'Servicio Activo' : 'Servicio Inactivo'}
                </span>
                <span className="block text-slate-400 dark:text-gray-500 text-xs mt-0.5">
                  {isActive ? 'Los clientes pueden reservar este servicio' : 'Los clientes no pueden ver ni reservar este servicio'}
                </span>
              </div>
            </div>
          )}

          <div style={fieldGap}>
            <label className={labelCls}>
              {isFreeAccess ? (
                <>
                  Duración Máxima Permitida (minutos)
                  <span className="text-red-500 font-semibold ml-1 text-xs">* obligatorio</span>
                </>
              ) : (
                <>
                  Duración por defecto (minutos)
                  <span className="text-slate-400 dark:text-gray-500 font-normal ml-1 text-xs">— opcional</span>
                </>
              )}
            </label>
            <input
              className={inputCls} type="number" min={1} max={480}
              value={duration} onChange={e => setDuration(e.target.value)}
              placeholder={isFreeAccess ? 'Ej: 60 · Límite máximo por reserva' : 'Ej: 60 · Dejar vacío si no aplica'}
              required={isFreeAccess}
            />
            {isFreeAccess && (
              <p className="text-slate-400 dark:text-gray-500 text-xs mt-1 m-0">
                El cliente no podrá reservar un bloque superior a este límite.
              </p>
            )}
          </div>

          {/* ── Horarios de clase — disponible en creación y edición, solo si NO es acceso libre ── */}
          {!isFreeAccess && (
            <div className="mt-5 pt-5 border-t border-slate-200 dark:border-bg-deep">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Horarios de Clase</label>
                <span className="text-brand-orange text-xs font-semibold">obligatorio</span>
              </div>
              <p className="text-slate-400 dark:text-gray-500 text-xs m-0 mb-3 leading-relaxed">
                Define bloques horarios específicos (Zumba, Natación, Sauna…). Los usuarios podrán reservar en estos bloques desde la app.
              </p>

              {/* Lista de horarios existentes */}
              {schedulesLoading ? (
                <p className="text-slate-400 dark:text-gray-500 text-sm mb-3">Cargando horarios...</p>
              ) : schedules.length === 0 ? (
                <p className="text-slate-400 dark:text-gray-500 text-sm italic mb-3">Sin horarios configurados</p>
              ) : (
                <div className="flex flex-col gap-1.5 mb-3">
                  {schedules.map(s => {
                    const instrLabel = instructors.find(i => i.id === Number(s.instructorId))?.label
                      ?? s.instructor?.email;
                    return (
                      <div key={s.id} className="flex items-center gap-2.5 bg-gray-50 dark:bg-bg-surface border border-brand-orange rounded-lg px-3 py-2">
                        <span className="font-bold text-xs min-w-[36px] text-brand-orange">
                          {DAY_LABELS[s.dayOfWeek] ?? s.dayOfWeek}
                        </span>
                        <span className="text-slate-700 dark:text-gray-200 text-sm flex-1">
                          {s.startTime.substring(0, 5)} – {s.endTime.substring(0, 5)}
                          {instrLabel && (
                            <span className="inline-flex items-center gap-1 text-slate-400 dark:text-gray-500 ml-2 text-xs">
                              · <GraduationCap size={11} /> {instrLabel}
                            </span>
                          )}
                        </span>
                        <button type="button" onClick={() => handleDeleteSchedule(s.id)}
                          className="bg-red-50 dark:bg-bg-surface text-red-500 border border-red-200 dark:border-gray-600 rounded-md p-1 cursor-pointer flex items-center">
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fila para agregar nuevo horario */}
              <div className="flex flex-col gap-2.5 bg-slate-50 dark:bg-bg-surface border border-dashed border-slate-300 dark:border-bg-deep rounded-lg p-3">
                {/* Chips de días */}
                <div>
                  <span className="text-xs text-slate-500 dark:text-gray-500 block mb-1 font-medium">Día</span>
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(DAY_LABELS).map(([key]) => (
                      <button key={key} type="button" onClick={() => setNewDay(key)}
                        className={`px-2.5 py-1 rounded-full text-xs cursor-pointer transition-colors ${newDay === key ? 'font-semibold border border-brand-orange bg-orange-50 dark:bg-bg-surface text-brand-orange' : 'font-normal border border-slate-300 dark:border-bg-deep bg-white dark:bg-bg-deep text-slate-500 dark:text-text-muted'}`}>
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horario */}
                <div className="flex gap-2 items-center flex-wrap">
                  <TimeSelect value={newStart} onChange={setNewStart} />
                  <span className="text-slate-400 dark:text-gray-500 font-semibold">–</span>
                  <TimeSelect value={newEnd} onChange={setNewEnd} />
                </div>

                {/* Instructor + Aforo */}
                <div className="flex gap-2 flex-wrap">
                  {/* Selector instructor */}
                  <div style={{ flex: 2, minWidth: '140px' }}>
                    <span className="text-xs text-slate-500 dark:text-gray-500 block mb-1 font-medium">Instructor *</span>
                    <div className="relative">
                      <select
                        value={newInstructorId}
                        onChange={e => setNewInstructorId(e.target.value)}
                        className={`${selectCls} text-sm`}
                      >
                        <option value="">— Seleccionar —</option>
                        {instructors.map(i => (
                          <option key={i.id} value={i.id}>{i.label}</option>
                        ))}
                      </select>
                      <span className="absolute right-[0.6rem] top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500 text-[0.65rem]">▼</span>
                    </div>
                    {instructors.length === 0 && (
                      <span className="text-xs text-slate-400 dark:text-gray-600 mt-0.5 block">
                        Sin instructores asignados a esta marca
                      </span>
                    )}
                  </div>

                  {/* Aforo */}
                  <div style={{ flex: 1, minWidth: '80px' }}>
                    <span className="text-xs text-slate-500 dark:text-gray-500 block mb-1 font-medium">Aforo *</span>
                    <input
                      type="number" min={1} max={500}
                      value={newMaxAttendees}
                      onChange={e => setNewMaxAttendees(e.target.value)}
                      className={`${inputCls} text-sm`}
                      placeholder="20"
                    />
                  </div>
                </div>

                {/* Botón agregar */}
                <div className="flex justify-end">
                  <button type="button" onClick={handleAddSchedule} disabled={addingSchedule}
                    className={`${sharedBtnPrimary} px-3.5 py-1.5 text-[0.82rem]`}>
                    {addingSchedule ? '...' : '+ Agregar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Botones fijos al fondo */}
      <div className="flex gap-3 justify-end mt-5 pt-4 pb-1 border-t border-slate-200 dark:border-bg-deep flex-shrink-0">
        <button type="button" className={btnSecondaryCls} onClick={() => guardClose(touched, onClose)}>Cancelar</button>
        <button type="submit" form="activity-form" className={sharedBtnPrimary} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Servicio'}
        </button>
      </div>
    </ModalOverlay>
  );
};

// ─── Select Stellar
const DarkSelect = ({ value, onChange, children, style }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  style?: CSSProperties;
}) => (
  <div className="relative inline-flex items-center">
    <select
      className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}
      style={style}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {children}
    </select>
    <ChevronDown size={14} className="absolute right-2.5 pointer-events-none text-slate-400 dark:text-gray-500" />
  </div>
);

// ─── Main View 
export const ActividadesView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userGymId = user?.gymId ? Number(user.gymId) : null;
  const callerLevel = user?.level ?? 0;
  const isSuperAdmin = callerLevel >= 10;
  const isGerente = callerLevel === 5;
  const gerenteBrandId: number | null = isGerente
    ? (user?.brandId ?? (user?.gymId ? Number(user.gymId) : null))
    : null;
  const activitiesKey = ['activities', userGymId] as const;

  const { data: activities = [], isLoading: loading } = useQuery({
    queryKey: activitiesKey,
    queryFn: async () => {
      const params = userGymId ? { gymId: userGymId } : {};
      const data = await apiClient.get<Activity[]>('/activities', { params });
      let raw: Activity[] = Array.isArray(data) ? data : ((data as { data?: Activity[] })?.data ?? []);
      // Recepcionista (nivel 4): filtro estricto por su sucursal.
      // Gerente y superiores: el backend ya aplica filtro territorial; no duplicar aquí.
      if (callerLevel === 4 && userGymId) raw = raw.filter((a) => a.gymId === userGymId);
      return raw;
    },
    enabled: !!user,
  });

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
    enabled: isSuperAdmin || isGerente,
  });
  const [formTarget,   setFormTarget]   = useState<Activity | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [detailTarget, setDetailTarget] = useState<Activity | null>(null);

  // ── Filtros ──
  const [search, setSearch] = useState('');
  const [filterGymId, setFilterGymId] = useState('');
  const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'dur_asc' | 'dur_desc'>('az');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');


  // ── Opciones para barra de filtros (solo sucursales, nunca marcas)
  const gymOptions = useMemo((): GymOption[] => {
    if (gyms.length) return gyms.filter(g => g.parentId != null);
    const seen = new Map<number, string>();
    activities.forEach(a => {
      if (!seen.has(a.gymId)) seen.set(a.gymId, a.gym?.name ?? `Gym #${a.gymId}`);
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [gyms, activities]);

  // ── Pipeline de filtros ──
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return activities
      .filter(a => {
        if (term && !a.name.toLowerCase().includes(term) && !a.description.toLowerCase().includes(term)) return false;
        if (filterGymId && a.gymId !== Number(filterGymId)) return false;
        if (filterStatus === 'active' && !a.isActive) return false;
        if (filterStatus === 'inactive' && a.isActive) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'az') return a.name.localeCompare(b.name);
        if (sortOrder === 'za') return b.name.localeCompare(a.name);
        if (sortOrder === 'dur_asc') return a.defaultDurationMin - b.defaultDurationMin;
        return b.defaultDurationMin - a.defaultDurationMin;
      });
  }, [activities, search, filterGymId, sortOrder, filterStatus]);

  const hasActiveFilters = search || filterGymId || filterStatus !== 'all' || sortOrder !== 'az';

  const resetFilters = () => {
    setSearch('');
    setFilterGymId('');
    setSortOrder('az');
    setFilterStatus('all');
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/activities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success('Servicio eliminado');
      setDeleteTarget(null);
    },
    onError: () => {},
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  return (
    <section style={panelStyle}>
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Catálogo de Servicios</h1>
          <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">Gestión de actividades disponibles en el gimnasio</p>
        </div>
        <button className={`${sharedBtnPrimary} inline-flex items-center gap-1.5`} onClick={() => setFormTarget('new')}>
          <Plus size={15} />
          Nuevo Servicio
        </button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="flex flex-col md:flex-row flex-wrap gap-3 items-center mb-6">
        {/* Búsqueda libre */}
        <div className="relative flex-1" style={{ minWidth: '220px' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
          <input
            className="w-full bg-white dark:bg-bg-deep border border-gray-300 dark:border-gray-700 text-slate-900 dark:text-gray-100 rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500"
            placeholder="Buscar por nombre o descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Sucursal — solo SUPER_ADMIN ve múltiples gyms */}
        {isSuperAdmin && gymOptions.length > 1 && (
          <DarkSelect value={filterGymId} onChange={setFilterGymId}>
            <option value="">Todas las sucursales</option>
            {gymOptions
              .filter((g, i, a) => a.findIndex(t => t.name === g.name) === i)
              .map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
          </DarkSelect>
        )}

        {/* Orden */}
        <DarkSelect value={sortOrder} onChange={v => setSortOrder(v as typeof sortOrder)}>
          <option value="az" >Nombre A → Z</option>
          <option value="za" >Nombre Z → A</option>
          <option value="dur_asc" >Duración ↑</option>
          <option value="dur_desc">Duración ↓</option>
        </DarkSelect>

        {/* Estado */}
        <DarkSelect value={filterStatus} onChange={v => setFilterStatus(v as typeof filterStatus)}>
          <option value="all"     >Todos los estados</option>
          <option value="active"  >Solo Activas</option>
          <option value="inactive">Solo Inactivas</option>
        </DarkSelect>

        {hasActiveFilters && (
          <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={resetFilters}><X size={12} />Limpiar filtros</button>
        )}
      </div>

      {/* Contador */}
      {!loading && (
        <p className="text-[0.8rem] mb-3 text-slate-500 dark:text-gray-500">
          {filtered.length === activities.length
            ? `${activities.length} servicio${activities.length !== 1 ? 's' : ''}`
            : `${filtered.length} de ${activities.length} servicios`}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-center py-12 text-slate-500 dark:text-gray-500">Cargando servicios...</p>
      ) : filtered.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            icon={GraduationCap}
            title={activities.length === 0 ? 'No hay servicios registrados aún' : 'Sin resultados para los filtros aplicados'}
            description={activities.length === 0
              ? 'Crea el primer servicio con el botón "Nuevo Servicio".'
              : 'Prueba a ajustar o limpiar los filtros de búsqueda.'}
            action={hasActiveFilters && (
              <button className={btnGhost} onClick={resetFilters}>Limpiar filtros</button>
            )}
          />
        </div>
      ) : (
        <div className={`overflow-hidden mt-4 ${cardCls}`}>
        <div className="overflow-x-auto">
          <table style={tableStyle}>
            <thead className={theadCls}>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Descripción</th>
                {isSuperAdmin && <th style={thStyle}>Gimnasio</th>}
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Duración</th>
                <th style={thStyle}>Estado</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(act => (
                <tr key={act.id} className={`${trCls} text-sm`}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }} className="text-slate-500 dark:text-gray-500">#{act.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{act.name}</td>
                  <td style={{ ...tdStyle, maxWidth: '280px' }} className="text-slate-500 dark:text-gray-400">
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {act.description}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td style={tdStyle} className="text-slate-500 dark:text-gray-400">
                      {act.gym?.name ?? `Gym #${act.gymId}`}
                    </td>
                  )}
                  <td style={tdStyle}>
                    {act.isFreeAccess
                      ? <span className={pillCls('amber')}>Libre</span>
                      : <span className={pillCls('sky')}>Horarios</span>
                    }
                  </td>
                  <td style={tdStyle} className="text-slate-500 dark:text-gray-400">
                    {act.defaultDurationMin ? `${act.defaultDurationMin} min` : <span className="text-slate-400 dark:text-gray-600">—</span>}
                  </td>
                  <td style={tdStyle}>
                    <span className={pillCls(act.isActive ? 'green' : 'amber')}>
                      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${act.isActive ? 'bg-green-400' : 'bg-amber-400'}`} />
                      {act.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        title="Ver detalle"
                        onClick={() => setDetailTarget(act)}
                        className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                      ><Eye size={15} /></button>
                      <button
                        onClick={() => setFormTarget(act)}
                        title="Editar actividad"
                        className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                      ><Edit size={15} /></button>
                      <button
                        onClick={() => setDeleteTarget(act)}
                        title="Eliminar actividad"
                        className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}
                      ><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailTarget && (
        <ActivityDetailModal
          activity={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setFormTarget(detailTarget); setDetailTarget(null); }}
        />
      )}

      {/* Form Modal */}
      {formTarget !== null && (
        <ActivityFormModal
          initial={formTarget === 'new' ? null : formTarget}
          gyms={gyms}
          userGymId={userGymId}
          callerLevel={callerLevel}
          gerenteBrandId={gerenteBrandId}
          onClose={() => setFormTarget(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['activities'] })}
        />
      )}

      {/* Confirm Delete */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Servicio"
        message={`¿Confirmas eliminar "${deleteTarget?.name}"? Esta acción aplica soft-delete en el servidor.`}
      />
    </section>
  );
};
