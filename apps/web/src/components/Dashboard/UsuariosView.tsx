import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../common/PaginationControls';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { DB_ROLES, ROLE_ID_TO_NAME } from '../../config/rbac.constants';
import { ModalOverlay, ConfirmModal, RecordDetailModal, DetailField, EmptyState } from './Shared/DashboardShared';
import { guardClose, panelStyle } from './Shared/DashboardShared.utils';
import { cardCls, inputCls as sharedInputCls, labelCls as sharedLabelCls, btnPrimary, btnGhost, iconBtnCls, pillCls, theadCls, thCls, tdCls, trCls } from './Shared/designTokens';
import type { GymDto, UserDto, UserRoleDto } from './Shared/DashboardTypes';
import { Eye, EyeOff, Edit, Trash2, Plus, Building2, Search, X, ChevronDown, Users } from 'lucide-react';


//Interfaz para roles cargados dinámicamente 
interface RoleOption { id: number; name: string; label: string; level: number; }

//Formatea el nombre DB al label legible
const formatRoleName = (name: string): string => {
  const map: Record<string, string> = {
    SUPER_ADMIN: 'Super Administrador',
    GERENTE: 'Gerente de Marca',
    ENTRENADOR: 'Entrenador',
    NUTRICIONISTA: 'Nutricionista',
    CLIENTE: 'Cliente',
    INSTRUCTOR: 'Instructor',
    COORDINADOR: 'Coordinador',
    PERSONAL_DE_LIMPIEZA: 'Personal de Limpieza',
  };
  return map[name] ?? name.replace(/_/g, ' ').split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

// ─── Prefijos telefónicos y helper de parseo (fuera del componente — constantes) ─
const NAME_MAX = 60;
const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;
const LETTERS_ONLY_RE = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/;

const PHONE_PREFIXES = [
  { code: '+591', label: '+591 BO' },
  { code: '+54',  label: '+54 AR'  },
  { code: '+56',  label: '+56 CL'  },
  { code: '+55',  label: '+55 BR'  },
  { code: '+51',  label: '+51 PE'  },
  { code: '+57',  label: '+57 CO'  },
  { code: '+52',  label: '+52 MX'  },
  { code: '+1',   label: '+1 US'   },
];

const splitPhone = (raw: string): { prefix: string; number: string } => {
  for (const p of PHONE_PREFIXES) {
    if (raw.startsWith(p.code)) {
      return { prefix: p.code, number: raw.slice(p.code.length).trim() };
    }
  }
  return { prefix: '+591', number: raw.replace(/^\+\d{1,3}\s?/, '') };
};


//Tipos para el formulario de usuario 
type UserFormData = {
  firstName: string; lastName: string; email: string; password: string;
  phone: string; phonePrefix: string; phoneNumber: string; ci: string;
  roleId: number; gymIds: number[]; isActive: boolean; gender?: string;
};

interface RoleRaw { id: number; name: string; isActive?: boolean; hierarchyLevel?: number; }

interface UserPayload {
  email?: string; firstName?: string; lastName?: string;
  phone?: string; ci?: string; roleId?: number; gymId?: number | null; gymIds?: number[];
  isActive?: boolean; password?: string; gender?: string;
}

//Componente Modal de creación/edición (usa Portal via ModalOverlay) 
const UserModal = ({ isOpen, onClose, userToEdit, onSave, roleOptions, gerenteBrandId, callerGymId, currentUserId }: {
  isOpen: boolean; onClose: () => void; userToEdit: UserDto | null; onSave: (d: UserFormData) => void;
  roleOptions: RoleOption[];
  gerenteBrandId?: number;
  callerGymId?: number;
  currentUserId?: number;
}) => {

  const isSelfEdit = !!(userToEdit && currentUserId && Number(userToEdit.id) === currentUserId);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '',
    phonePrefix: '+591', phoneNumber: '', ci: '', gender: '' as string,
    roleId: DB_ROLES.CLIENTE as number, gymIds: [] as number[], isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [gyms, setGyms] = useState<GymDto[]>([]);
  const [loadingGyms, setLoadingGyms] = useState(false);
  // selectedMarcaId: Marca seleccionada (filtro cascada) para GERENTE, RECEPCIONISTA y staff multi-sede
  const [selectedMarcaId, setSelectedMarcaId] = useState<number | ''>(gerenteBrandId || '');

  // ── Derivados: marcas (parentId === null) y sucursales físicas (parentId !== null) ─
  const sedes      = Array.from(new Map(gyms.filter(g => g.parentId === null).map(g => [g.id, g])).values());
  const sucursales = Array.from(new Map(gyms.filter(g => g.parentId !== null && g.parentId !== undefined).map(g => [g.id, g])).values());
  // Sucursales que pertenecen a la marca seleccionada
  const sucursalesParaSede = selectedMarcaId !== ''
    ? sucursales.filter(s => (s.parentId ?? s.parent?.id) === selectedMarcaId)
    : [];

  const sedeIdDelGerente = gerenteBrandId ?? null;

  useEffect(() => {
    if (!isOpen) return;
setLoadingGyms(true);
    Promise.all([
      apiClient.get('/gyms/brands').catch(() => ({ data: [] })),
      apiClient.get('/gyms').catch(() => ({ data: [] })),
    ]).then(([brandsRes, sucursalesRes]) => {
      const unwrap = (raw: unknown): GymDto[] => {
        if (Array.isArray(raw)) return raw as GymDto[];
        const nested = (raw as { data?: unknown })?.data;
        return Array.isArray(nested) ? (nested as GymDto[]) : [];
      };
      setGyms([...unwrap(brandsRes.data), ...unwrap(sucursalesRes.data)]);
    }).finally(() => setLoadingGyms(false));
  }, [isOpen]);

  // ── Poblar formulario al abrir ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
setTouched(false);
    if (userToEdit) {
      const gymsFromRoles = (userToEdit.userRoles ?? [])
        .map(ur => ur.gym)
        .filter((g): g is NonNullable<typeof g> => g != null);
      const rawPhone = userToEdit.profile?.phone ?? '';
      const { prefix, number } = splitPhone(rawPhone);
    const currentRoleId = Number(userToEdit.userRoles?.[0]?.roleId) || DB_ROLES.CLIENTE;
      // Si roleOptions aún no cargó (race condition), usar el ID de la BD directamente
      // sin caer al fallback DB_ROLES.CLIENTE que sobreescribiría el rol real del usuario.
      const validRoleId = roleOptions.length === 0
        ? currentRoleId
        : roleOptions.some(r => r.id === currentRoleId)
          ? currentRoleId
          : (roleOptions[0]?.id ?? DB_ROLES.CLIENTE);
      setFormData({
        firstName:   userToEdit.profile?.firstName ?? '',
        lastName:    userToEdit.profile?.lastName  ?? '',
        phone:       rawPhone,
        phonePrefix: prefix,
        phoneNumber: number,
        ci:          userToEdit.profile?.ci ?? '',
        gender:      (userToEdit.profile as Record<string, unknown>)?.gender as string ?? '',
        email:       userToEdit.email ?? '',
        password:    '',
        roleId:      validRoleId,
        gymIds:      gymsFromRoles.map(g => Number(g.id)),
        isActive:    userToEdit.isActive ?? true,
      });
    } else {
      // 0 = sin seleccionar; obliga al usuario a elegir explícitamente y evita
      // que un race-condition en la carga de roleOptions fije un rol incorrecto.
      setFormData({ firstName: '', lastName: '', email: '', password: '', phone: '', phonePrefix: '+591', phoneNumber: '', ci: '', gender: '', roleId: 0, gymIds: [], isActive: true });
    }
    if (sedeIdDelGerente) {
      setSelectedMarcaId(sedeIdDelGerente);
    } else {
      setSelectedMarcaId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userToEdit, isOpen, sedeIdDelGerente]);

  // ── Pre-poblar marca y sucursal al editar (espera que gyms cargue) ──────────
  // Lee el árbol de gyms para reconstruir la cascada Marca → Sucursal en modo edición.
  useEffect(() => {
    if (!isOpen || !userToEdit || !gyms.length) return;
    if (sedeIdDelGerente) {
      setSelectedMarcaId(sedeIdDelGerente);
      return;
    }

    const mainRole = userToEdit.userRoles?.[0];
    if (!mainRole) return;

    const gymId = Number(mainRole.gymId || mainRole.gym?.id || 0);
    if (!gymId) return;

    const gym = gyms.find(g => g.id === gymId);
    if (!gym) return;

    const parentId = Number(gym.parentId ?? gym.parent?.id ?? 0);

    if (parentId === 0) {
      // gymId es directamente una Marca (ej. Gerente administra la red completa)
      setSelectedMarcaId(gymId);
      setFormData(prev => ({ ...prev, gymIds: [gymId] }));
    } else {
      // gymId es una Sucursal (ej. Recepcionista, Entrenador en sucursal específica)
      setSelectedMarcaId(parentId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userToEdit, gyms]);

  // ── Restaurar marca del Gerente/Recepcionista si se limpió al cambiar de rol ──
  useEffect(() => {
    if (!isOpen || !sedeIdDelGerente) return;
    setSelectedMarcaId(sedeIdDelGerente);
  }, [isOpen, formData.roleId, sedeIdDelGerente]);

  // ── Auto-selección: si el backend RBAC devuelve solo 1 marca, seleccionarla ──
  // Depende de `gyms` (estado React, referencia estable) y NO de `sedes` (nueva
  // referencia en cada render por Array.from → causaría bucle infinito).
  useEffect(() => {
    if (!isOpen || sedeIdDelGerente) return;
    const uniqueSedes = Array.from(
      new Map(gyms.filter(g => g.parentId === null).map(g => [g.id, g])).values(),
    );
    if (uniqueSedes.length !== 1) return;
    const soloId = uniqueSedes[0].id;
    setSelectedMarcaId(soloId);
    setFormData(p => (p.gymIds.length === 1 && p.gymIds[0] === soloId ? p : { ...p, gymIds: [soloId] }));
  }, [isOpen, gyms, sedeIdDelGerente]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const fn = formData.firstName.trim();
    if (!fn) {
      newErrors.firstName = 'El nombre es obligatorio';
    } else if (fn.length < 2) {
      newErrors.firstName = 'El nombre debe tener al menos 2 caracteres';
    } else if (fn.length > NAME_MAX) {
      newErrors.firstName = `Máximo ${NAME_MAX} caracteres`;
    } else if (!LETTERS_ONLY_RE.test(fn)) {
      newErrors.firstName = 'Solo se permiten letras, espacios y guiones';
    } else if (GIBBERISH_RE.test(fn)) {
      newErrors.firstName = 'El nombre parece contener caracteres aleatorios';
    }

    const ln = formData.lastName.trim();
    if (!ln) {
      newErrors.lastName = 'El apellido es obligatorio';
    } else if (ln.length < 2) {
      newErrors.lastName = 'El apellido debe tener al menos 2 caracteres';
    } else if (ln.length > NAME_MAX) {
      newErrors.lastName = `Máximo ${NAME_MAX} caracteres`;
    } else if (!LETTERS_ONLY_RE.test(ln)) {
      newErrors.lastName = 'Solo se permiten letras, espacios y guiones';
    } else if (GIBBERISH_RE.test(ln)) {
      newErrors.lastName = 'El apellido parece contener caracteres aleatorios';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Correo inválido';
    }

    const isCreation = !userToEdit;
    if (isCreation || formData.password.trim()) {
      if (!/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(formData.password)) {
        newErrors.password = 'Mínimo 8 caracteres, 1 número y 1 especial';
      }
    }

    const roleLevel = roleOptions.find(r => r.id === formData.roleId)?.level ?? 0;
    const requiresStaffFields = roleLevel >= 3 && roleLevel < 10;

    if (requiresStaffFields && isCreation) {
      if (!formData.phoneNumber.trim()) {
        newErrors.phone = 'El teléfono es obligatorio para este rol';
      } else {
        const digits = formData.phoneNumber.replace(/\s/g, '');
        if (!/^\d{6,14}$/.test(digits)) newErrors.phone = 'Solo dígitos, entre 6 y 14 números';
      }
      if (!formData.ci.trim()) {
        newErrors.ci = 'El carnet de identidad es obligatorio para este rol';
      } else {
        if (!/^\d{6,9}(-[a-zA-Z0-9]{1,2})?$/.test(formData.ci.trim())) newErrors.ci = 'CI inválido (ej: 12345678 o 1234567-1A)';
      }
    } else {
      if (formData.phoneNumber.trim()) {
        const digits = formData.phoneNumber.replace(/\s/g, '');
        if (!/^\d{6,14}$/.test(digits)) newErrors.phone = 'Solo dígitos, entre 6 y 14 números';
      }
      if (formData.ci.trim()) {
        if (!/^\d{6,9}(-[a-zA-Z0-9]{1,2})?$/.test(formData.ci.trim())) newErrors.ci = 'CI inválido (ej: 12345678 o 1234567-1A)';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const toggleGym  = (id: number) => setFormData(p => ({
    ...p, gymIds: p.gymIds.includes(id) ? p.gymIds.filter(x => x !== id) : [...p.gymIds, id],
  }));

  // Determina el nombre del rol seleccionado (usando datos reales de la BD)
  const selectedRoleLevel  = roleOptions.find(r => r.id === formData.roleId)?.level ?? 0;
  const requiresStaffInfo  = selectedRoleLevel >= 3 && selectedRoleLevel < 10 && !userToEdit;
  // Gerente: nivel jerárquico 5 (sin importar el nombre del rol)
  const isGerente          = selectedRoleLevel === 5;
  const isRecepcionista    = selectedRoleLevel === 4;
  const needsSede          = selectedRoleLevel >= 2 && selectedRoleLevel < 10;
  // Solo checkboxes múltiples para staff distinto de Gerente y Recepcionista
  const needsMulti         = needsSede && !isGerente && !isRecepcionista;

  if (!isOpen) return null;

  const inputCls = (err?: string) =>
    `${sharedInputCls} ${err ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : ''}`;
  const labelCls = sharedLabelCls;

  return (
    <ModalOverlay onClose={onClose} isDirty={touched} onFormChange={() => setTouched(true)}>
      <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-gray-100 mb-2">
        {userToEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
      </h2>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '0.25rem' }}>
        <div className="flex justify-between items-baseline mt-3 mb-1">
          <label className={labelCls} style={{ marginTop: 0, marginBottom: 0 }}>Nombre</label>
          <span className={`text-xs ${formData.firstName.length > NAME_MAX ? 'text-red-500' : 'text-slate-400 dark:text-gray-500'}`}>
            {formData.firstName.length}/{NAME_MAX}
          </span>
        </div>
        <input type="text" className={inputCls(errors.firstName)} value={formData.firstName}
          onChange={e => { setFormData({ ...formData, firstName: e.target.value }); setErrors(p => ({ ...p, firstName: '' })); }}
          placeholder="Ej. Juan" maxLength={NAME_MAX} />
        {errors.firstName && <span className="text-red-500 text-xs mt-1 block">{errors.firstName}</span>}

        <div className="flex justify-between items-baseline mt-3 mb-1">
          <label className={labelCls} style={{ marginTop: 0, marginBottom: 0 }}>Apellido</label>
          <span className={`text-xs ${formData.lastName.length > NAME_MAX ? 'text-red-500' : 'text-slate-400 dark:text-gray-500'}`}>
            {formData.lastName.length}/{NAME_MAX}
          </span>
        </div>
        <input type="text" className={inputCls(errors.lastName)} value={formData.lastName}
          onChange={e => { setFormData({ ...formData, lastName: e.target.value }); setErrors(p => ({ ...p, lastName: '' })); }}
          placeholder="Ej. Pérez" maxLength={NAME_MAX} />
        {errors.lastName && <span className="text-red-500 text-xs mt-1 block">{errors.lastName}</span>}

        <label className={labelCls}>
          Teléfono{' '}
          {requiresStaffInfo
            ? <span className="text-red-500 font-bold text-xs">*</span>
            : <span className="text-slate-400 dark:text-gray-500 font-normal text-xs">— opcional</span>}
        </label>
        <div className="flex gap-2 items-center">
          <select
            value={formData.phonePrefix}
            onChange={e => setFormData({ ...formData, phonePrefix: e.target.value })}
            className={`${inputCls(errors.phone)} text-sm cursor-pointer shrink-0`}
            style={{ width: '95px' }}
          >
            {PHONE_PREFIXES.map(p => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
          <input
            type="tel"
            value={formData.phoneNumber}
            onChange={e => { setFormData({ ...formData, phoneNumber: e.target.value }); setErrors(p => ({ ...p, phone: '' })); }}
            placeholder="71234567"
            maxLength={14}
            className={`${inputCls(errors.phone)} flex-1`}
          />
        </div>
        {errors.phone && <span className="text-red-500 text-xs mt-1 block">{errors.phone}</span>}

        <label className={labelCls}>
          Carnet de Identidad (CI){' '}
          {requiresStaffInfo
            ? <span className="text-red-500 font-bold text-xs">*</span>
            : <span className="text-slate-400 dark:text-gray-500 font-normal text-xs">— opcional</span>}
        </label>
        <input
          type="text"
          className={inputCls(errors.ci)}
          value={formData.ci}
          onChange={e => { setFormData({ ...formData, ci: e.target.value }); setErrors(p => ({ ...p, ci: '' })); }}
          placeholder="Ej. 12345678 o 1234567-1A"
          maxLength={20}
        />
        {errors.ci && <span className="text-red-500 text-xs mt-1 block">{errors.ci}</span>}

        <label className={labelCls}>
          Género <span className="text-slate-400 dark:text-gray-500 font-normal text-xs">— opcional</span>
        </label>
        <select
          className={inputCls()}
          value={formData.gender || ''}
          onChange={e => setFormData({ ...formData, gender: e.target.value })}
        >
          <option value="">Sin especificar</option>
          <option value="MALE">Masculino</option>
          <option value="FEMALE">Femenino</option>
          <option value="OTHER">Otro</option>
        </select>

        <label className={labelCls}>Correo Electrónico</label>
        <input
          type="email"
          className={inputCls(errors.email)}
          value={formData.email}
          onChange={e => { setFormData({ ...formData, email: e.target.value }); setErrors(p => ({ ...p, email: '' })); }}
          placeholder="correo@ejemplo.com"
        />
        {errors.email && <span className="text-red-500 text-xs mt-1 block">{errors.email}</span>}

        <label className={labelCls}>
          Contraseña{' '}
          {userToEdit && <span className="text-slate-400 dark:text-gray-500 font-normal text-xs">(vacío = sin cambios)</span>}
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            className={`${inputCls(errors.password)} pr-10`}
            value={formData.password}
            onChange={e => { setFormData({ ...formData, password: e.target.value }); setErrors(p => ({ ...p, password: '' })); }}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center p-1 rounded cursor-pointer bg-transparent border-0 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors duration-200"
            title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && <span className="text-red-500 text-xs mt-1 block">{errors.password}</span>}

        {isSelfEdit ? (
          <div className="bg-slate-50 dark:bg-bg-surface border border-slate-200 dark:border-gray-700 rounded-lg p-3 mt-3 flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-gray-500 mt-0.5 flex-shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <p className="m-0 text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
              Tu rol, sucursal y estado de cuenta son gestionados por un administrador de nivel superior.
              Desde aquí puedes actualizar tus datos de perfil.
            </p>
          </div>
        ) : (
        <>
        <label className={labelCls}>Rol del Sistema <span className="text-red-500 font-bold text-xs">*</span></label>
        <select
          className={inputCls(formData.roleId === 0 ? 'required' : undefined)}
          value={formData.roleId}
          onChange={e => {
            setFormData({ ...formData, roleId: Number(e.target.value), gymIds: [] });
            setSelectedMarcaId('');
          }}
        >
          {!userToEdit && <option value={0} disabled>— Seleccionar Rol —</option>}
          {roleOptions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {formData.roleId === 0 && <span className="text-red-500 text-xs mt-1 block">Selecciona el rol del usuario</span>}
        </>
        )}

        {/* ── GERENTE (nivel 5): solo Marca — administra la red completa ──────── */}
        {!isSelfEdit && isGerente && (
          <div className="bg-brand-orange/5 border border-brand-orange/30 rounded-xl p-4 mt-3 mb-1 flex flex-col gap-3">
            <p className="m-0 text-xs font-semibold tracking-widest uppercase text-brand-orange">
              Asignación de Marca
            </p>
            <p className="m-0 text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
              El gerente administra <strong className="text-slate-900 dark:text-gray-200">todas las sucursales</strong> de
              la <strong className="text-slate-900 dark:text-gray-200">Marca</strong> seleccionada (ej. "Smart Fit").
            </p>

            {sedeIdDelGerente ? (
              <div className="w-full bg-slate-100 dark:bg-bg-deep border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
                <span className="font-medium">{sedes.find(s => s.id === sedeIdDelGerente)?.name ?? `Marca #${sedeIdDelGerente}`}</span>
                <span className="text-xs text-slate-400 dark:text-gray-500 ml-2">(tu marca)</span>
              </div>
            ) : loadingGyms ? <p className="text-sm text-slate-400 dark:text-gray-500">Cargando...</p> : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  Marca *
                </label>
                <select
                  value={selectedMarcaId}
                  onChange={e => {
                    const val = Number(e.target.value) || '';
                    setSelectedMarcaId(val);
                    setFormData(p => ({ ...p, gymIds: val ? [val as number] : [] }));
                  }}
                  className={`${sharedInputCls} ${!selectedMarcaId ? '!border-red-500' : ''}`}
                >
                  <option value="">— Seleccionar Marca —</option>
                  {sedes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* ── RECEPCIONISTA: dos pasos (Marca → Sucursal asignada) ─────────────── */}
        {!isSelfEdit && isRecepcionista && (
          <div className="bg-brand-orange/5 border border-brand-orange/30 rounded-xl p-4 mt-3 mb-1 flex flex-col gap-3">
            <p className="m-0 text-xs font-semibold tracking-widest uppercase text-brand-orange">
              Asignación de Marca y Sucursal
            </p>
            <p className="m-0 text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
              Una <strong className="text-slate-900 dark:text-gray-200">Marca</strong> es la organización (ej. "Smart Fit").
              Una <strong className="text-slate-900 dark:text-gray-200">Sucursal</strong> es el gimnasio físico donde
              trabajará el recepcionista (ej. "Smart Fit - Centro").
            </p>

            {/* Paso 1: Marca */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                {sedeIdDelGerente ? 'Marca' : '1 · Marca *'}
              </label>
              {sedeIdDelGerente ? (
                <div className="w-full bg-slate-100 dark:bg-bg-deep border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
                  <span className="font-medium">{sedes.find(s => s.id === sedeIdDelGerente)?.name ?? `Marca #${sedeIdDelGerente}`}</span>
                  <span className="text-xs text-slate-400 dark:text-gray-500 ml-2">(tu marca)</span>
                </div>
              ) : loadingGyms ? <p className="text-sm text-slate-400 dark:text-gray-500">Cargando...</p> : (
                <select
                  className={`${sharedInputCls} ${!selectedMarcaId ? '!border-red-500' : ''}`}
                  value={selectedMarcaId || ''}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setSelectedMarcaId(val);
                    // FIX CRÍTICO: Guardamos el ID de la Marca en el estado. 
                    // Si el usuario es Gerente, esto se enviará al backend.
                    setFormData(prev => ({ ...prev, gymIds: val ? [val] : [] }));
                  }}
                >
                  <option value="">— Seleccionar Marca —</option>
                  {sedes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>

            {/* Paso 2: Sucursal única */}
            <div style={{ opacity: selectedMarcaId !== '' ? 1 : 0.4, transition: 'opacity 0.2s' }}>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                {sedeIdDelGerente ? '' : '2 · '}Sucursal Asignada *
              </label>
              {selectedMarcaId !== '' && sucursalesParaSede.length === 0 ? (
                <p className="m-0 text-sm text-red-500 p-2 bg-red-50 dark:bg-bg-surface rounded-lg">
                  Atención: esta marca no tiene sucursales registradas aún.
                </p>
              ) : (
                <select
                  className={`${sharedInputCls} disabled:opacity-40 ${selectedMarcaId !== '' && formData.gymIds.length === 0 ? '!border-red-500' : ''}`}
                  disabled={selectedMarcaId === ''}
                  // CRÍTICO: El value debe leer directamente del formData
                  value={formData.gymIds && formData.gymIds.length > 0 ? formData.gymIds[0] : ''}
                  onChange={e => {
                    const val = Number(e.target.value);
                    // CRÍTICO: Guardar el ID en el formData como array numérico
                    setFormData(prev => ({ ...prev, gymIds: val ? [val] : [] }));
                  }}
                >
                  <option value="">— Seleccionar Sucursal —</option>
                  {sucursalesParaSede.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* ── ENTRENADOR / NUTRICIONISTA: sucursales agrupadas por marca ────────── */}
        {!isSelfEdit && needsMulti && (
          <>
            {/* Paso 1: Marca obligatoria (oculto si el contexto ya la impone) */}
            {!sedeIdDelGerente && (
              <>
                <label className={labelCls}>
                  1 · Marca <span className="text-red-500">*</span>
                </label>
                {loadingGyms ? <p className="text-sm text-slate-400 dark:text-gray-500">Cargando...</p> : (
                  <select
                    value={selectedMarcaId}
                    onChange={e => {
                      setSelectedMarcaId(Number(e.target.value) || '');
                      setFormData(p => ({ ...p, gymIds: [] }));
                    }}
                    className={`${sharedInputCls} ${!selectedMarcaId ? '!border-amber-400' : ''}`}
                  >
                    <option value="">— Seleccionar Marca —</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </>
            )}

            {/* Paso 2: Checkboxes filtrados por la Marca seleccionada */}
            {(selectedMarcaId !== '' || sedeIdDelGerente) && (() => {
              const activeMarcaId = sedeIdDelGerente ?? Number(selectedMarcaId);
              const checkboxSucursales = sucursales.filter(
                s => (s.parentId ?? s.parent?.id) === activeMarcaId
                  && (callerGymId == null || Number(s.id) === callerGymId)
              );
              return (
                <>
                  <label className={labelCls}>
                    {sedeIdDelGerente ? 'Sucursales Asignadas' : '2 · Sucursales'}{' '}
                    <span className="text-slate-400 dark:text-gray-500 font-normal text-xs">— puede seleccionar múltiples</span>
                  </label>
                  {loadingGyms ? <p className="text-sm text-slate-400 dark:text-gray-500">Cargando...</p>
                    : checkboxSucursales.length === 0
                      ? <p className="text-sm text-red-500 p-2 bg-red-50 dark:bg-bg-surface rounded-lg mt-1">Esta marca no tiene sucursales registradas.</p>
                      : (
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto p-3 bg-slate-50 dark:bg-bg-deep rounded-lg border border-slate-200 dark:border-bg-deep">
                          {checkboxSucursales.map(g => {
                            const isChecked = formData.gymIds.includes(Number(g.id));
                            return (
                              <label key={g.id}
                                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md border transition-all duration-200 ${
                                  isChecked
                                    ? 'bg-sky-500/10 border-sky-500/30'
                                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                                }`}>
                                <input type="checkbox" checked={isChecked}
                                  onChange={() => toggleGym(Number(g.id))}
                                  className="w-[15px] h-[15px] cursor-pointer accent-sky-400" />
                                <span className={`text-sm font-medium ${isChecked ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-gray-300'}`}>
                                  {g.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )
                  }
                </>
              );
            })()}
          </>
        )}

        {!isSelfEdit && (
        <div className="flex items-center gap-2 mt-4">
          <input type="checkbox" className="w-4 h-4 cursor-pointer accent-brand-orange" checked={formData.isActive}
            onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
          <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Usuario Activo</label>
        </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0">
        <button className={btnGhost} onClick={() => guardClose(touched, onClose)}>Cancelar</button>
        <button className={btnPrimary} onClick={() => {
          if (!validateForm()) return;
          if (!isSelfEdit && !formData.roleId) {
            toast.error('Debes seleccionar el Rol del Sistema');
            return;
          }
          if (!isSelfEdit && isGerente) {
            if (!selectedMarcaId) {
              toast.error('Debes seleccionar la Marca que administrará el Gerente');
              return;
            }
            // gymIds ya contiene la marca seleccionada (se asigna al cambiar el selector)
          }
          if (!isSelfEdit && isRecepcionista) {
            if (!selectedMarcaId) {
              toast.error('Debes seleccionar la Marca a la que pertenece el Recepcionista');
              return;
            }
            if (formData.gymIds.length === 0) {
              toast.error('Debes seleccionar la Sucursal que atenderá el Recepcionista');
              return;
            }
          }
          const phoneVal = formData.phoneNumber.trim()
            ? `${formData.phonePrefix}${formData.phoneNumber.replace(/\s/g, '')}`
            : '';
          onSave({ ...formData, phone: phoneVal });
        }}>
          Guardar Usuario
        </button>
      </div>
    </ModalOverlay>
  );
};

// ─── Vista Principal de Usuarios ──────────────────────────────────────────────
export const UsuariosView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // ── Filtros (declarados antes de usePagination para ser sus deps) ──────────
  const [search,          setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRole,      setFilterRole]   = useState('');
  const [filterGym,       setFilterGym]    = useState('');
  const [filterStatus,    setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortOrder,       setSortOrder]    = useState<'az' | 'za' | 'id_asc' | 'id_desc'>('az');

  // Debounce: espera 400ms sin tipear para disparar el query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { page, setPage, limit, offset } = usePagination(20, [debouncedSearch, filterRole, filterGym, filterStatus, sortOrder]);
  const usersKey = ['users', user?.id, user?.gymId, page, limit, debouncedSearch, filterRole, filterGym, filterStatus, sortOrder] as const;

  const { data: queryData, isLoading: loading, error: fetchError } = useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const res = await apiClient.get('/users', {
        params: {
          search: debouncedSearch || undefined,
          roleId: filterRole && filterRole !== 'none' ? Number(filterRole) : undefined,
          noRole: filterRole === 'none' ? true : undefined,
          gymId:  filterGym ? Number(filterGym) : undefined,
          status: filterStatus !== 'all' ? filterStatus : undefined,
          sortBy: sortOrder,
          limit,
          offset,
        },
      });
      const body = res.data as { data: UserDto[]; meta: { total: number; limit: number; offset: number } } | UserDto[];
      if (Array.isArray(body)) return { data: body, meta: { total: body.length, limit, offset } };
      return body;
    },
    enabled: !!user,
  });
  const users = useMemo(() => queryData?.data ?? [], [queryData]);
  const meta = queryData?.meta ?? { total: 0, limit, offset };

  const error = fetchError
    ? ((fetchError as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (fetchError as Error).message
        || 'No se pudo cargar usuarios.')
    : null;

  const [isModalOpen,       setIsModalOpen]       = useState(false);
  const [userToEdit,        setUserToEdit]        = useState<UserDto | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserDto | null>(null);
  const [viewingUser,       setViewingUser]       = useState<UserDto | null>(null);
  const [viewUserClasses, setViewUserClasses] = useState<{ day: string; time: string; activity: string; gymName: string }[]>([]);

  useEffect(() => {
    const level = (viewingUser as UserDto & { level?: number })?.level ?? 0;
    if (!viewingUser || level !== 2) { setViewUserClasses([]); return; }
    apiClient.get(`/activities/instructor/${viewingUser.id}/schedules`)
      .then((res: { data: unknown }) => {
        setViewUserClasses(Array.isArray(res.data) ? (res.data as { day: string; time: string; activity: string; gymName: string }[]) : []);
      })
      .catch(() => setViewUserClasses([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUser?.id]);

  // ── Roles dinámicos desde la BD ───────────────────────────────────────────────
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  useEffect(() => {
    apiClient.get('/roles')
      .then((res: { data: unknown }) => {
        const rawData = res.data;
        const raw: RoleRaw[] = Array.isArray(rawData)
          ? (rawData as RoleRaw[])
          : (Array.isArray((rawData as { data?: unknown })?.data) ? ((rawData as { data: RoleRaw[] }).data) : []);
        setRoleOptions(
          raw
            .filter(r => r.isActive !== false)
            .sort((a, b) => (b.hierarchyLevel ?? 0) - (a.hierarchyLevel ?? 0))
            .map(r => ({ id: r.id, name: r.name, label: formatRoleName(r.name), level: r.hierarchyLevel ?? 0 }))
        );
      })
      .catch(() => {});
  }, []);

  // ── Catálogo de gyms para el mapa sede↔sucursal en la ficha detallada ────────
  const [gymsCatalog, setGymsCatalog] = useState<GymDto[]>([]);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiClient.get('/gyms/brands').catch(() => ({ data: [] })),
      apiClient.get('/gyms').catch(() => ({ data: [] })),
    ]).then(([brandsRes, sucursalesRes]) => {
      if (!mounted) return;
      const unwrap = (raw: unknown): GymDto[] => {
        if (Array.isArray(raw)) return raw as GymDto[];
        const nested = (raw as { data?: unknown })?.data;
        return Array.isArray(nested) ? (nested as GymDto[]) : [];
      };
      setGymsCatalog([...unwrap(brandsRes.data), ...unwrap(sucursalesRes.data)]);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  /** Mapa sucursalId → { sucursalName, sedeId, sedeName } */
  const gymInfoMap = useMemo(() => {
    const sedes      = gymsCatalog.filter(g => !g.parentId && !g.parent?.id);
    const sucursales = gymsCatalog.filter(g => !!(g.parentId ?? g.parent?.id));
    const sedesById  = new Map(sedes.map(s => [s.id, s.name]));
    const map = new Map<number, { sucursalName: string; sedeId: number | null; sedeName: string }>();
    sucursales.forEach(s => {
      const sedeId = s.parentId ?? s.parent?.id ?? null;
      map.set(s.id, {
        sucursalName: s.name,
        sedeId,
        sedeName: sedeId ? (sedesById.get(sedeId) ?? `Marca #${sedeId}`) : 'Sin Marca Registrada',
      });
    });
    return map;
  }, [gymsCatalog]);


  // Gyms para el selector de filtro (catálogo completo, sin duplicados)
  const gymOptions = useMemo(() => {
    return Array.from(new Map(gymsCatalog.map(g => [g.id, g])).values())
      .map(g => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [gymsCatalog]);

  const hasActiveFilters = search || filterRole || filterGym || filterStatus !== 'all' || sortOrder !== 'az';
  const resetFilters = () => { setSearch(''); setDebouncedSearch(''); setFilterRole(''); setFilterGym(''); setFilterStatus('all'); setSortOrder('az'); };

  // ── Re-fetch directo (no usa el use-case para evitar fallos silenciosos de RBAC) ──

  // ── Acciones CRUD ────────────────────────────────────────────────────────────
  const handleSaveUser = async (formData: UserFormData) => {
    try {
      const emailTrimmed = formData.email?.trim();
      const isSelf = userToEdit && Number(userToEdit.id) === Number(user?.id);

      // Extraer el ID de la sucursal de forma segura
      const selectedRoleObj = roleOptions.find(r => r.id === Number(formData.roleId));
      const hierarchy = selectedRoleObj?.level ?? 0;
      
      // Niveles intermedios SÍ requieren. Nivel 10 (Super Admin) y 1 (Usuario base) NO.
      const requiresGymUI = hierarchy > 1 && hierarchy < 10;
      const targetGymId = formData.gymIds && formData.gymIds.length > 0 ? Number(formData.gymIds[0]) : null;
      const finalGymId = requiresGymUI ? targetGymId : null;

      // Construir el teléfono desde prefix + número (no el raw del DB, que puede tener espacios)
      const builtPhone = formData.phoneNumber?.trim()
        ? (formData.phonePrefix + formData.phoneNumber.trim())
        : null;

      // Construir payload a prueba de balas
      const payload: UserPayload = {
        ...(emailTrimmed ? { email: emailTrimmed } : {}),
        firstName: formData.firstName?.trim() || undefined,
        lastName:  formData.lastName?.trim()  || undefined,
        ...(builtPhone ? { phone: builtPhone } : {}),
        ...(formData.ci?.trim()    ? { ci:    formData.ci.trim()    } : {}),
        ...(formData.gender        ? { gender: formData.gender }      : {}),
        roleId: Number(formData.roleId),
        gymId: finalGymId,
        gymIds: finalGymId ? [finalGymId] : [],
        isActive: formData.isActive,
      };

      if (formData.password?.trim()) payload.password = formData.password.trim();

      if (isSelf) {
        delete payload.roleId;
        delete payload.gymIds;
        delete payload.isActive;
      }

      if (userToEdit) {
        await apiClient.put(`/users/${userToEdit.id}`, payload);
      } else {
        await apiClient.post('/users', payload);
      }

      // Re-fetch directo: garantiza que la lista refleja el estado real del servidor
      await queryClient.invalidateQueries({ queryKey: usersKey });

      // Actualizar ficha detallada si estaba abierta para el mismo usuario
      if (userToEdit && viewingUser && Number(viewingUser.id) === Number(userToEdit.id)) {
        try {
          const refreshed = await apiClient.get<UserDto>(`/users/${userToEdit.id}`);
          setViewingUser(refreshed.data);
        } catch { /* si falla, la ficha mostrará datos viejos */ }
      }

      setIsModalOpen(false);
      setUserToEdit(null);
      toast.success(userToEdit ? 'Usuario actualizado.' : 'Usuario creado.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      console.error('[handleSaveUser]', err);
      toast.error(e?.response?.data?.message || e?.message || 'Error al guardar usuario');
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      await apiClient.delete(`/users/${deleteConfirmUser.id}`);
      toast.success('Usuario eliminado.');
      await queryClient.invalidateQueries({ queryKey: usersKey });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e?.response?.data?.message || e?.message || 'Error al eliminar usuario.');
    } finally {
      setDeleteConfirmUser(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section style={panelStyle} className="glass-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Usuarios</h1>
          <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">
            {(user?.level ?? 0) >= 10
              ? 'Gestión de usuarios de toda la red.'
              : 'Gestión de usuarios de tus sucursales asignadas.'}
          </p>
        </div>
        {(user?.level ?? 0) >= 4 && (
          <button onClick={() => { setUserToEdit(null); setIsModalOpen(true); }}
            className={`${btnPrimary} inline-flex items-center gap-1.5 whitespace-nowrap`}>
            <Plus size={15} />
            Nuevo Usuario
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-gray-500 mt-4 mb-1">
        {loading ? 'Cargando usuarios...' : `Total: ${meta.total} usuarios`}
      </p>

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
      {loading && <div className="mt-8 text-center text-sm text-slate-500 dark:text-gray-500">Cargando...</div>}

      {/* ── Barra de filtros — visible si hay datos o filtros activos; NO depende de loading para que el input nunca se desmonte ── */}
      {!error && (meta.total > 0 || hasActiveFilters) && (
        <div className={`${cardCls} p-4 mt-4 mb-5 flex flex-col md:flex-row flex-wrap gap-3 items-center`}>
          <div className="relative flex-1" style={{ minWidth: '200px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              aria-label="Buscar por nombre o email"
              className={`${sharedInputCls} pl-9`}
            />
          </div>
          {/* Rol */}
          <div className="relative">
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              aria-label="Filtrar por rol"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="">Todos los roles</option>
              <option value="none">Sin rol asignado</option>
              {roleOptions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {/* Sede asignada */}
          {gymOptions.length > 0 && (
            <div className="relative" style={{ maxWidth: '180px' }}>
              <select value={filterGym} onChange={e => setFilterGym(e.target.value)}
                aria-label="Filtrar por marca"
                className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
                <option value="">Todas las marcas</option>
                {gymOptions.map(g => <option key={`gym-${g.id}`} value={g.id}>{g.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
            </div>
          )}
          {/* Estado */}
          <div className="relative">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              aria-label="Filtrar por estado"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="all"     >Todos</option>
              <option value="active"  >Solo Activos</option>
              <option value="inactive">Solo Inactivos</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {/* Orden */}
          <div className="relative">
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'az' | 'za' | 'id_asc' | 'id_desc')}
              aria-label="Ordenar"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="az"      >Nombre A → Z</option>
              <option value="za"      >Nombre Z → A</option>
              <option value="id_asc"  >ID ↑</option>
              <option value="id_desc" >ID ↓</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {hasActiveFilters && (
            <button onClick={resetFilters} className={`${btnGhost} inline-flex items-center gap-1.5`}>
              <X size={12} />Limpiar
            </button>
          )}
        </div>
      )}

      {/* Contador */}
      {!loading && !error && (meta.total > 0 || hasActiveFilters || debouncedSearch !== '') && (
        <div className="text-xs text-slate-500 dark:text-gray-500 mb-2">
          {meta.total === 0
            ? 'Sin resultados para los filtros aplicados.'
            : `${meta.total} usuario${meta.total !== 1 ? 's' : ''}${hasActiveFilters ? ' (filtrado)' : ''}`
          }
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className={`${cardCls} mt-8`}>
          <EmptyState
            icon={Users}
            title={hasActiveFilters ? 'Sin resultados para los filtros aplicados' : 'No hay usuarios disponibles en esta marca'}
            description={hasActiveFilters
              ? 'Prueba a ajustar o limpiar los filtros de búsqueda para ver más resultados.'
              : 'Los usuarios que crees para esta marca o sucursal aparecerán aquí.'}
            action={hasActiveFilters && (
              <button onClick={resetFilters} className={btnGhost}>Limpiar filtros</button>
            )}
          />
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className={`overflow-hidden mt-4 ${cardCls}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: '850px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead className={theadCls}>
              <tr>
                {['ID', 'Nombre', 'Email', 'Rol', 'Sucursal / Marca', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className={thCls} style={{ textAlign: h === 'Acciones' ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-gray-500">Sin resultados para los filtros aplicados.</td></tr>
              ) : users.map(u => {
                const fullName  = [u?.profile?.firstName, u?.profile?.lastName].filter(Boolean).join(' ').trim() || '-';
                const roleId    = Number(u?.userRoles?.[0]?.roleId ?? 0);
                // Prioridad: joined role object del backend > roleOptions dinámico > ROLE_ID_TO_NAME hardcodeado
                const roleNameRaw = u?.userRoles?.[0]?.role?.name
                  ?? roleOptions.find(r => r.id === roleId)?.name
                  ?? ROLE_ID_TO_NAME[roleId]
                  ?? 'SIN_ROL';
                const roleDisplay = formatRoleName(roleNameRaw);
                const targetLevel = roleOptions.find(r => r.id === roleId)?.level
                  ?? (u?.userRoles?.[0]?.role as { name?: string; hierarchyLevel?: number } | null | undefined)?.hierarchyLevel ?? 0;
                const myLevel = user?.level ?? 0;
                const isSelf = Number(u.id) === Number(user?.id);
                const canEdit = isSelf || targetLevel < myLevel || myLevel >= 10;
                type GymRef = NonNullable<UserRoleDto['gym']>;
                const gymsList = (u?.userRoles ?? [])
                  .map((ur: UserRoleDto) => ur.gym)
                  .filter((g): g is GymRef => g != null);
                const gymNames = gymsList.map(g => u.gymsMap?.get(Number(g.id)) ?? g.name ?? '').filter(Boolean);
                const showSedes = (targetLevel ?? 0) >= 2 && (targetLevel ?? 0) < 10 && gymNames.length > 0;

                return (
                  <tr key={`user-${u.id}`} className={trCls}>
                    <td className={`${tdCls} text-slate-500 dark:text-gray-500`}>{u.id}</td>
                    <td className={tdCls}>
                      <p className="font-semibold text-slate-900 dark:text-gray-100">{fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-500 font-mono mt-0.5">
                        CI: {u.profile?.ci || 'Sin registrar'}
                      </p>
                    </td>
                    <td className={`${tdCls} truncate`} title={u.email ?? undefined}>{u.email ?? '-'}</td>
                    <td className={`${tdCls} text-slate-500 dark:text-gray-500`}>{roleDisplay}</td>
                    <td className={tdCls}>
                      {showSedes ? (() => {
                        const first  = gymsList[0];
                        const extras = gymsList.length - 1;
                        const gId    = Number(first?.id);
                        const info   = gymInfoMap.get(gId);
                        const sucursalName = info?.sucursalName ?? first?.name ?? `Gym #${gId}`;
                        const sedeName     = info?.sedeName;
                        return (
                          <div className="flex flex-col gap-1">
                            {/* Primera sucursal siempre visible */}
                            <span className={pillCls('sky')}>{sucursalName}</span>
                            {sedeName && (
                              <span className="text-xs text-slate-500 dark:text-gray-500 pl-0.5">
                                {sedeName}
                              </span>
                            )}
                            {/* Badge compacto si hay más */}
                            {extras > 0 && (
                              <button
                                onClick={() => setViewingUser(u)}
                                title="Ver ficha completa"
                                className="text-xs text-slate-500 dark:text-gray-500 hover:text-brand-orange cursor-pointer mt-0.5 underline decoration-dotted text-left bg-transparent border-0 p-0 transition-colors duration-200"
                              >
                                y {extras} {extras === 1 ? 'sucursal más' : 'sucursales más'}
                              </button>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-slate-500 dark:text-gray-500 text-sm">Sin asignar</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className={pillCls(u.isActive ? 'green' : 'red')}>
                        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${u.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <div className="flex gap-1.5 justify-center items-center">
                        {/* Ver detalle */}
                        <button
                          onClick={() => setViewingUser(u)}
                          title="Ver detalle"
                          className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                        >
                          <Eye size={15} />
                        </button>

                        {/* Editar */}
                        {canEdit && (
                          <button
                            onClick={() => { setUserToEdit(u); setIsModalOpen(true); }}
                            title={isSelf ? 'Editar mi perfil' : 'Editar usuario'}
                            className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                          >
                            <Edit size={15} />
                          </button>
                        )}

                        {/* Eliminar: visible para cualquier admin que pueda gestionar a este usuario, nunca para sí mismo */}
                        {!isSelf && (targetLevel < myLevel || myLevel >= 10) && (
                          <button
                            onClick={() => setDeleteConfirmUser(u)}
                            title="Eliminar usuario"
                            className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <PaginationControls
        page={page}
        limit={limit}
        total={meta.total}
        onPageChange={setPage}
      />

      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userToEdit={userToEdit}
        onSave={handleSaveUser}
        currentUserId={user?.id}
        roleOptions={
          roleOptions.filter(r => {
            const myLevel = user?.level ?? 0;
            if (myLevel >= 10) return true;
            return r.level < myLevel;
          })
        }
        gerenteBrandId={(() => {
          const level = user?.level ?? 0;
          if (level >= 10) return undefined;
          // Gerente (5): su gymId en el JWT es directamente el ID de la Marca que administra
          if (level === 5) return user?.gymId ? Number(user.gymId) : undefined;
          if (user?.brandId) return Number(user.brandId);
          if (user?.gymId && gymsCatalog.length) {
            const s = gymsCatalog.find(g => Number(g.id) === Number(user.gymId));
            return s?.parentId ?? s?.parent?.id ?? undefined;
          }
          return undefined;
        })()}
        callerGymId={(() => {
          const level = user?.level ?? 0;
          if (level >= 5) return undefined;
          return user?.gymId ? Number(user.gymId) : undefined;
        })()}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmUser}
        onClose={() => setDeleteConfirmUser(null)}
        onConfirm={confirmDeleteUser}
        title="Confirmar Eliminación"
        message={`¿Estás seguro de querer eliminar al usuario "${deleteConfirmUser?.email}"? Esta acción no se puede deshacer.`}
      />

      <RecordDetailModal isOpen={!!viewingUser} onClose={() => setViewingUser(null)} title="Ficha Detallada de Usuario">
        <DetailField label="ID de Usuario" value={viewingUser?.id} />
        <DetailField label="Nombre Completo"
          value={[viewingUser?.profile?.firstName, viewingUser?.profile?.lastName].filter(Boolean).join(' ') || '-'} />
        <DetailField label="Correo Electrónico" value={viewingUser?.email} />
        <DetailField label="Carnet de Identidad (CI)" value={viewingUser?.profile?.ci || 'Sin registrar'} />
        <DetailField label="Teléfono" value={viewingUser?.profile?.phone || 'No registrado'} />
        <DetailField label="Género" value={
          viewingUser?.profile?.gender === 'MALE' ? 'Masculino' :
          viewingUser?.profile?.gender === 'FEMALE' ? 'Femenino' :
          viewingUser?.profile?.gender === 'OTHER' ? 'Otro' :
          viewingUser?.profile?.gender || 'Sin especificar'
        } />
        <DetailField label="Estado de Cuenta"
          value={<span className={pillCls(viewingUser?.isActive ? 'green' : 'red')}>{viewingUser?.isActive ? 'ACTIVO' : 'INACTIVO'}</span>} />
        <DetailField label="Rol del Sistema" isFullWidth
          value={(() => {
            const ur    = viewingUser?.userRoles?.[0];
            const rId   = Number(ur?.roleId ?? 0);
            const rawName = ur?.role?.name ?? ROLE_ID_TO_NAME[rId] ?? 'CLIENTE';
            return roleOptions.find(r => r.id === rId)?.label ?? formatRoleName(rawName);
          })()} />

        {/* ── Asignación: desglose sede + sucursal según rol ── */}
        {(() => {
          const rId        = Number(viewingUser?.userRoles?.[0]?.roleId ?? 0);
          const targetRoleLevel2 = roleOptions.find(r => r.id === rId)?.level ?? 0;
          const hasAssign  = targetRoleLevel2 >= 2 && targetRoleLevel2 < 10;
          type GymRef2 = NonNullable<UserRoleDto['gym']>;
          const gymsInRoles = (viewingUser?.userRoles ?? [])
            .map((ur: UserRoleDto) => ur.gym)
            .filter((g): g is GymRef2 => g != null);

          if (!hasAssign || gymsInRoles.length === 0) {
            return (
              <DetailField
                label="Sucursal Asignada"
                isFullWidth
                value={<span className="text-slate-400 dark:text-gray-500 italic">Sin asignar</span>}
              />
            );
          }

          // Gerente (nivel 5): su gym asignado ES la marca (parentId === null)
          if (targetRoleLevel2 === 5) {
            const g    = gymsInRoles[0];
            const gId  = Number(g?.id);
            const isBrand = !g?.parentId && !g?.parent?.id;
            const sedeName     = isBrand
              ? (g?.name ?? '—')
              : (gymInfoMap.get(gId)?.sedeName ?? g?.parent?.name ?? '—');
            const sucursalName = isBrand
              ? '—'
              : (gymInfoMap.get(gId)?.sucursalName ?? g?.name ?? `Gym #${gId}`);
            return (
              <>
                <DetailField
                  label={<span className="flex items-center gap-1"><Building2 size={12} />Sucursal (Marca)</span>}
                  value={<span className="text-brand-orange font-semibold">{sedeName}</span>}
                />
                <DetailField
                  label="Sucursal Asignada"
                  value={
                    <span className={sucursalName === '—' ? 'text-slate-400 dark:text-gray-500 italic' : 'text-sky-500 dark:text-sky-400 font-semibold'}>
                      {sucursalName}
                    </span>
                  }
                />
              </>
            );
          }

          // ENTRENADOR / NUTRICIONISTA: puede tener varias → una fila por sucursal
          return (
            <DetailField
              label={`Sucursales Asignadas (${gymsInRoles.length})`}
              isFullWidth
              value={
                <div className="flex flex-col gap-2 mt-1">
                  {gymsInRoles.map((g, i) => {
                    const gId   = Number(g?.id);
                    const info  = gymInfoMap.get(gId);
                    const sucursalName = info?.sucursalName ?? g?.name ?? `Gym #${gId}`;
                    const sedeName     = info?.sedeName     ?? g?.parent?.name ?? null;
                    return (
                      <div key={i} className="px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/25">
                        <div className="text-sky-600 dark:text-sky-400 font-semibold text-sm">{sucursalName}</div>
                        {sedeName && (
                          <div className="text-slate-500 dark:text-gray-500 text-xs mt-0.5">
                            {sedeName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              }
            />
          );
        })()}

        {/* ── Clases Asignadas (solo nivel 2 — Instructores/Coordinadores) ── */}
        {(() => {
          const targetLevel = (viewingUser as UserDto & { level?: number })?.level ?? 0;
          if (targetLevel !== 2) return null;
          if (viewUserClasses.length === 0) return (
            <DetailField label="Clases Asignadas" isFullWidth value={
              <span className="text-sm text-slate-400 dark:text-gray-500">Sin clases asignadas.</span>
            } />
          );
          return (
            <DetailField
              label={`Clases Asignadas (${viewUserClasses.length})`}
              isFullWidth
              value={
                <div className="flex flex-col gap-1.5 mt-1">
                  {viewUserClasses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/15">
                      <span className="font-bold text-sky-500 dark:text-sky-400" style={{ minWidth: '3rem' }}>{c.day}</span>
                      <span className="text-slate-500 dark:text-gray-500" style={{ minWidth: '7rem' }}>{c.time}</span>
                      <span className="font-semibold text-slate-900 dark:text-gray-100">{c.activity}</span>
                      <span className="text-slate-500 dark:text-gray-500 ml-auto">{c.gymName}</span>
                    </div>
                  ))}
                </div>
              }
            />
          );
        })()}
      </RecordDetailModal>
    </section>
  );
};