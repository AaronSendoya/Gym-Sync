import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { ModalOverlay, ConfirmModal, EmptyState } from './Shared/DashboardShared';
import { guardClose, panelStyle } from './Shared/DashboardShared.utils';
import { cardCls, inputCls as sharedInputCls, btnPrimary, btnGhost, iconBtnCls, pillCls } from './Shared/designTokens';
import type { GymDto, GymScheduleDto, UserDto, CheckinDto, ScheduleEntry } from './Shared/DashboardTypes';
import { Edit, Trash2, Plus, Shield, X } from 'lucide-react';

type RoleDto = {
  id: number;
  name: string;
  description?: string;
  hierarchyLevel?: number;
  isSystemRole?: boolean;
};

const HIERARCHY_LABELS: Record<number, string> = {
  10: 'Máximo (10)',
  5: 'Alto (5)',
  3: 'Medio (3)',
  2: 'Básico-Avanzado (2)',
  1: 'Básico (1)',
};

const RoleModal = ({ isOpen, onClose, roleToEdit, onSave, roles }: any) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hierarchyLevel: 1,
    isSystemRole: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => { setTouched(false); }, [isOpen]);

  useEffect(() => {
    if (roleToEdit) {
      setFormData({
        name: roleToEdit.name || '',
        description: roleToEdit.description || '',
        hierarchyLevel: roleToEdit.hierarchyLevel ?? 1,
        isSystemRole: roleToEdit.isSystemRole ?? false,
      });
    } else {
      setFormData({ name: '', description: '', hierarchyLevel: 1, isSystemRole: false });
    }
    setErrors({});
  }, [roleToEdit, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const editingId = roleToEdit?.id ?? null;

    // Regla 1: Nombre formato + longitud
    if (!formData.name || formData.name.trim().length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres.';
    } else if (!/^[A-Z_]+$/.test(formData.name)) {
      newErrors.name = 'Solo letras mayúsculas y guiones bajos permitidos.';
    } else {
      // Regla 2: Unicidad local
      const isDuplicate = (roles as RoleDto[]).some(
        r => r.name === formData.name && r.id !== editingId
      );
      if (isDuplicate) newErrors.name = 'Este rol ya existe.';
    }

    // Regla 3: Descripción
    const descTrimmed = formData.description?.trim() ?? '';
    if (!descTrimmed || descTrimmed.length < 5) {
      newErrors.description = 'La descripción es obligatoria (mínimo 5 caracteres).';
    } else if (descTrimmed.length > 300) {
      newErrors.description = 'La descripción no puede superar los 300 caracteres.';
    } else if (/[bcdfghjklmnñpqrstvwxyz]{5,}/i.test(descTrimmed)) {
      newErrors.description = 'La descripción parece contener caracteres aleatorios.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose} isDirty={touched} onFormChange={() => setTouched(true)}>
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-white/[0.06] mb-4">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-gray-100 m-0">
          {roleToEdit ? 'Editar Rol' : 'Nuevo Rol'}
        </h2>
        <button onClick={() => guardClose(touched, onClose)} className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/5`}>
          <X size={18} />
        </button>
      </div>

      {/* Nombre */}
      <div className="flex flex-col mb-4">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
          Nombre del Rol
        </label>
        <input
          type="text"
          className={`${sharedInputCls} ${errors.name ? '!border-red-500' : ''}`}
          value={formData.name}
          onChange={e => {
            setFormData({ ...formData, name: e.target.value.toUpperCase().replace(/\s/g, '_') });
            if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
          }}
          placeholder="Ej. COORDINADOR"
        />
        {errors.name ? (
          <span className="text-red-500 text-xs mt-1 block">{errors.name}</span>
        ) : (
          <small className="text-slate-400 dark:text-gray-500 text-xs mt-1 block">
            Solo mayúsculas y guión bajo (AUTO)
          </small>
        )}
      </div>

      {/* Descripción */}
      <div className="flex flex-col mb-4">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
          Descripción
        </label>
        <textarea
          maxLength={300}
          rows={3}
          className={`${sharedInputCls} resize-none font-sans ${errors.description ? '!border-red-500' : ''}`}
          value={formData.description}
          onChange={e => {
            setFormData({ ...formData, description: e.target.value });
            if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
          }}
          placeholder="Descripción del rol y sus permisos"
        />
        <div className="flex justify-between items-center mt-1">
          {errors.description ? (
            <span className="text-red-500 text-xs block">{errors.description}</span>
          ) : (
            <span />
          )}
          <span className={`text-xs ml-auto ${formData.description.length >= 300 ? 'text-red-500 font-semibold' : formData.description.length >= 270 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
            {formData.description.length} / 300
          </span>
        </div>
      </div>

      {/* Nivel Jerárquico */}
      <div className="flex flex-col mb-4">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
          Nivel Jerárquico
        </label>
        <select
          className={`${sharedInputCls} cursor-pointer`}
          value={formData.hierarchyLevel}
          onChange={e => setFormData({ ...formData, hierarchyLevel: Number(e.target.value) })}
        >
          <option value={4}>Medio-Alto (4) — Recepcionistas / Secretarios</option>
          <option value={3}>Medio (3) — Entrenadores / Nutricionistas</option>
          <option value={2}>Básico-Avanzado (2) — Instructores de Clases Grupales</option>
          <option value={1}>Básico (1) — Usuarios / Clientes</option>
        </select>
      </div>

      {/* Rol de Sistema */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          className="w-4 h-4 cursor-pointer accent-brand-orange rounded"
          id="isSystemRoleCheckbox"
          checked={formData.isSystemRole}
          onChange={e => setFormData({ ...formData, isSystemRole: e.target.checked })}
        />
        <label htmlFor="isSystemRoleCheckbox" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer m-0">
          Rol de Sistema (no puede ser eliminado por usuarios)
        </label>
      </div>

      {/* Warning */}
      {roleToEdit?.isSystemRole && (
        <div className="p-3 bg-brand-orange/10 border border-brand-orange/30 text-brand-orange rounded-lg text-xs font-semibold mb-4">
          Atención: este es un rol de sistema. Modifícalo con precaución.
        </div>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
        <button onClick={() => guardClose(touched, onClose)} className={btnGhost}>
          Cancelar
        </button>
        <button onClick={handleSubmit} className={btnPrimary}>
          {roleToEdit ? 'Actualizar Rol' : 'Crear Rol'}
        </button>
      </div>
    </ModalOverlay>
  );
};

export const RolesView = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<RoleDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RoleDto | null>(null);

  // Guard: Solo SUPER_ADMIN
  if ((user?.level ?? 0) < 10) {
    return (
      <section style={panelStyle} className="glass-panel">
        <div className={`${cardCls} py-16 px-8 text-center`}>
          <Shield size={32} className="mx-auto mb-3 text-brand-orange opacity-70" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100 mb-1.5">Acceso Denegado</h2>
          <p className="text-sm text-slate-500 dark:text-gray-500">Solo el Super Administrador puede gestionar los roles del sistema.</p>
        </div>
      </section>
    );
  }

  useEffect(() => {
    let mounted = true;
    // Limpiar overrides locales obsoletos para que la BD sea la fuente de verdad
    localStorage.removeItem('gymsync_local_roles');
    localStorage.removeItem('gymsync_deleted_role_ids');
    localStorage.removeItem('gymsync_edited_roles');

    const fetchRoles = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/roles');
        const dbRoles: RoleDto[] = Array.isArray(res.data) ? res.data : res.data?.data || [];
        if (mounted) setRoles(dbRoles);
      } catch (err) {
        if (mounted) setError('No se pudieron cargar los roles.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchRoles();
    return () => { mounted = false; };
  }, []);

  const handleSaveRole = async (formData: any) => {
    try {
      const payload = {
        name: formData.name,
        description: formData.description || '',
        hierarchyLevel: Number(formData.hierarchyLevel),
        isSystemRole: Boolean(formData.isSystemRole),
      };

      if (roleToEdit) {
        const res = await apiClient.patch(`/roles/${roleToEdit.id}`, payload);
        const updated: RoleDto = res.data?.id ? res.data : { ...roleToEdit, ...payload };
        setRoles(prev => prev.map(r => r.id === roleToEdit.id ? updated : r));
        toast.success(`Rol "${payload.name}" actualizado con éxito`);
      } else {
        const res = await apiClient.post('/roles', payload);
        const newRole: RoleDto = res.data?.id ? res.data : { id: res.data?.data?.id, ...payload };
        setRoles(prev => [...prev, newRole]);
        toast.success(`Rol "${payload.name}" creado con éxito`);
      }

      setIsModalOpen(false);
      setRoleToEdit(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Ocurrió un error al guardar el rol.';
      toast.error(msg);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.isSystemRole) {
      alert('No se pueden eliminar roles de sistema.');
      setDeleteConfirm(null);
      return;
    }
    try {
      await apiClient.delete(`/roles/${deleteConfirm.id}`);
      setRoles(prev => prev.filter(r => r.id !== deleteConfirm.id));
      toast.success(`Rol "${deleteConfirm.name}" eliminado con éxito`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'No se pudo eliminar el rol.';
      toast.error(msg);
    } finally {
      setDeleteConfirm(null);
    }
  };

  type HierarchyTone = 'amber' | 'sky' | 'green' | 'gray';
  const hierarchyTone = (level?: number): HierarchyTone => {
    if (!level) return 'gray';
    if (level >= 5) return 'amber';
    if (level >= 3) return 'sky';
    return 'green';
  };
  const HIERARCHY_ICON_CLS: Record<HierarchyTone, string> = {
    amber: 'border-amber-500/40 text-amber-500 dark:text-amber-400',
    sky:   'border-sky-500/40 text-sky-500 dark:text-sky-400',
    green: 'border-green-500/40 text-green-500 dark:text-green-400',
    gray:  'border-gray-400/40 text-gray-500 dark:text-gray-400',
  };

  return (
    <section style={panelStyle} className="glass-panel">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Gestión de Roles</h1>
      <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Administración de roles y jerarquías del sistema. Solo visible para Super Administradores.</p>

      <div className="flex justify-between items-center mt-4">
        <div className="text-sm text-slate-500 dark:text-gray-500">
          {loading ? 'Cargando roles...' : `${roles.length} roles registrados`}
        </div>
        <button onClick={() => { setRoleToEdit(null); setIsModalOpen(true); }} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
          <Plus size={15} />
          Nuevo Rol
        </button>
      </div>

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}

      {!loading && !error && (
        <div className="mt-5 grid gap-3">
          {roles.map(role => (
            <div
              key={role.id}
              className={`flex justify-between items-center rounded-xl px-5 py-4 ${cardCls} ${role.isSystemRole ? '!border-brand-orange/30' : ''}`}
            >
              {/* Info del Rol */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 border flex items-center justify-center shrink-0 ${HIERARCHY_ICON_CLS[hierarchyTone(role.hierarchyLevel)]}`}>
                  <Shield size={17} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-gray-100 text-[0.95rem] font-mono">
                      {role.name}
                    </span>
                    {role.isSystemRole && (
                      <span className="text-[0.7rem] px-1.5 py-0.5 rounded bg-brand-orange/15 text-brand-orange font-bold border border-brand-orange/30">
                        SISTEMA
                      </span>
                    )}
                    <span className={pillCls(hierarchyTone(role.hierarchyLevel))}>
                      Nivel {role.hierarchyLevel ?? '—'}
                    </span>
                  </div>
                  {role.description && (
                    <span className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 block">
                      {role.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setRoleToEdit(role); setIsModalOpen(true); }}
                  title="Editar rol"
                  className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(role)}
                  disabled={role.isSystemRole}
                  title={role.isSystemRole ? 'Los roles de sistema no pueden eliminarse' : 'Eliminar rol'}
                  className={`${iconBtnCls} ${role.isSystemRole ? 'text-slate-300 dark:text-gray-700 opacity-40 cursor-not-allowed' : 'text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400'}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}

          {roles.length === 0 && !loading && (
            <div className={cardCls}>
              <EmptyState
                icon={Shield}
                title="No hay roles registrados"
                description="Crea el primer rol del sistema con el botón de arriba."
              />
            </div>
          )}
        </div>
      )}

      <RoleModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setRoleToEdit(null); }}
        roleToEdit={roleToEdit}
        onSave={handleSaveRole}
        roles={roles}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Eliminar Rol"
        message={`¿Estás seguro de eliminar el rol "${deleteConfirm?.name}"? Los usuarios con este rol podrían perder acceso al sistema.`}
      />
    </section>
  );
};
