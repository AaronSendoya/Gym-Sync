import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { ModalOverlay, ConfirmModal, EmptyState } from './Shared/DashboardShared';
import { guardClose, panelStyle } from './Shared/DashboardShared.utils';
import { cardCls, inputCls as sharedInputCls, btnPrimary, btnGhost, iconBtnCls, pillCls, theadCls, thCls, tdCls, trCls } from './Shared/designTokens';
import type { GymDto, GymScheduleDto, UserDto, CheckinDto, ScheduleEntry } from './Shared/DashboardTypes';
import { Edit, Trash2, Building2, Search, X, Info, ChevronDown } from 'lucide-react';

const DESC_MAX = 180;
const NAME_MAX = 100;
const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;

const MarcaModal = ({ isOpen, onClose, marcaToEdit, onSave, existingGyms = [] }: any) => {
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [touched, setTouched]   = useState(false);
  const textareaRef             = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setTouched(false); }, [isOpen]);

  /* Auto-resize textarea */
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (marcaToEdit) {
      setFormData({ name: marcaToEdit.name || '', description: marcaToEdit.description || '' });
    } else {
      setFormData({ name: '', description: '' });
    }
    setErrors({});
    /* reset altura al abrir */
    requestAnimationFrame(() => autoResize());
  }, [marcaToEdit, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const nameTrimmed = formData.name.trim();

    if (!nameTrimmed) {
      newErrors.name = 'El nombre es obligatorio';
    } else if (nameTrimmed.length > NAME_MAX) {
      newErrors.name = `El nombre no puede superar los ${NAME_MAX} caracteres`;
    } else if (GIBBERISH_RE.test(nameTrimmed)) {
      newErrors.name = 'El nombre parece contener caracteres aleatorios';
    } else {
      const isDuplicate = (existingGyms as any[]).some(
        s => s.name.trim().toLowerCase() === nameTrimmed.toLowerCase() &&
             s.id !== marcaToEdit?.id
      );
      if (isDuplicate) newErrors.name = 'Esta marca ya existe en tu lista';
    }

    if (formData.description.length > DESC_MAX) {
      newErrors.description = `Máximo ${DESC_MAX} caracteres`;
    } else if (formData.description.trim() && GIBBERISH_RE.test(formData.description)) {
      newErrors.description = 'La descripción parece contener caracteres aleatorios';
    }

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return false; }
    setErrors({});
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSave(formData);
  };

  if (!isOpen) return null;

  const descLen     = formData.description.length;
  const descOver    = descLen > DESC_MAX;
  const descNear    = descLen >= DESC_MAX * 0.85;

  const inputCls = (err?: string) =>
    `${sharedInputCls} ${err ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : ''}`;
  const labelCls = "text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-wide";

  return (
    <ModalOverlay onClose={onClose} isDirty={touched} onFormChange={() => setTouched(true)}>
      <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-gray-100 mb-4">
        {marcaToEdit ? 'Editar Marca' : 'Nueva Marca'}
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Nombre */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-baseline">
            <label className={labelCls}>Nombre de la Marca *</label>
            <span className={`text-xs ${formData.name.length > NAME_MAX ? 'text-red-500' : formData.name.length > NAME_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
              {formData.name.length}/{NAME_MAX}
            </span>
          </div>
          <input
            type="text"
            className={inputCls(errors.name)}
            value={formData.name}
            onChange={e => { setFormData({ ...formData, name: e.target.value }); setErrors(p => ({ ...p, name: '' })); }}
            placeholder="Ej. Metro Flex"
            maxLength={NAME_MAX}
          />
          {errors.name && <span className="text-red-500 text-xs">{errors.name}</span>}
        </div>

        {/* Descripción con auto-resize */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-baseline">
            <label className={labelCls}>Descripción</label>
            <span className={`text-xs ${descOver ? 'text-red-500' : descNear ? 'text-brand-orange' : 'text-slate-400 dark:text-gray-500'}`}>
              {descLen}/{DESC_MAX}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            className={`${inputCls(errors.description || descOver ? 'err' : undefined)} resize-none overflow-hidden`}
            value={formData.description}
            onChange={e => {
              setFormData({ ...formData, description: e.target.value });
              setErrors(p => ({ ...p, description: '' }));
              autoResize();
            }}
            placeholder="Ej. Cadena de gimnasios premium"
            rows={3}
            style={{ minHeight: '80px', lineHeight: '1.55' }}
          />
          {(errors.description || descOver) && (
            <span className="text-red-500 text-xs">
              {errors.description || `Máximo ${DESC_MAX} caracteres`}
            </span>
          )}
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
          <button type="button" onClick={() => guardClose(touched, onClose)} className={btnGhost}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            {marcaToEdit ? 'Actualizar' : 'Crear'} Marca
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
};

// --- MODAL DE SUCURSAL ---

export const SedesView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: gyms = [], isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['sedes'],
    queryFn: async () => {
      const res = await apiClient.get('/gyms/brands');
      return Array.isArray(res.data) ? (res.data as GymDto[]) : [];
    },
  });
  const error = fetchError
    ? ((fetchError as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (fetchError as Error).message
        || 'No se pudo cargar sedes.')
    : null;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sedeToEdit, setSedeToEdit] = useState<GymDto | null>(null);
  const [deleteConfirmSede, setDeleteConfirmSede] = useState<GymDto | null>(null);
  const [infoSede, setInfoSede] = useState<GymDto | null>(null);

  // ── Filtros ──
  const [search,    setSearch]    = useState('');
  const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'id_asc' | 'id_desc'>('az');

  const filteredGyms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return gyms
      .filter(g => !term || g.name.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sortOrder === 'az') return a.name.localeCompare(b.name);
        if (sortOrder === 'za') return b.name.localeCompare(a.name);
        if (sortOrder === 'id_asc')  return a.id - b.id;
        return b.id - a.id;
      });
  }, [gyms, search, sortOrder]);


  const handleDeleteSede = (sede: GymDto) => {
    setDeleteConfirmSede(sede);
  };

  const confirmDeleteSede = async () => {
    if (!deleteConfirmSede) return;
    try {
      await apiClient.delete(`/gyms/${deleteConfirmSede.id}`);
      await queryClient.invalidateQueries({ queryKey: ['sedes'] });
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Error al eliminar marca.');
    } finally {
      setDeleteConfirmSede(null);
    }
  };

  const handleCreateSede = () => {
    setSedeToEdit(null);
    setIsModalOpen(true);
  };

  const handleEditSede = (sede: GymDto) => {
    if ((user?.level ?? 0) === 5 && user?.gymId && sede.id !== parseInt(user.gymId as string)) {
      console.warn(`[Security Guard]: Bloqueo de acceso a Sede ajena para Gerente ID ${user.id}`);
      alert("Acceso denegado: No tienes permisos para editar una marca que no te pertenece.");
      return;
    }
    setSedeToEdit(sede);
    setIsModalOpen(true);
  };

  const handleSaveSede = async (formData: any) => {
    try {
      let payload: any = {};

      if (sedeToEdit) {
        // PUT: UpdateGymDto — Solo propiedades de identidad mutables, sin location
        payload = {
          name: formData.name,
          description: formData.description || '',
          maxCapacity: 0
        };
      } else {
        // POST: Crear Marca (entidad abstracta) - solo nombre y capacidad 0
        payload = {
          name: formData.name,
          description: formData.description || '',
          maxCapacity: 0
        };
      }

      if (sedeToEdit) {
        await apiClient.put(`/gyms/${sedeToEdit.id}`, payload);
        await queryClient.invalidateQueries({ queryKey: ['sedes'] });
      } else {
        await apiClient.post('/gyms', payload);
        await queryClient.invalidateQueries({ queryKey: ['sedes'] });
      }

      setIsModalOpen(false);
    } catch {
      // El interceptor de apiClient maneja el toast de error
    }
  };


  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section style={panelStyle} className="glass-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Gestión de Marcas</h1>
          <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">
            {(user?.level ?? 0) >= 10
              ? 'Administra las marcas o franquicias del grupo. Cada marca puede tener múltiples sucursales (locales físicos).'
              : 'Solo los administradores pueden gestionar las marcas del sistema.'}
          </p>
        </div>
        {(user?.level ?? 0) >= 10 && (
          <button onClick={handleCreateSede} className={`${btnPrimary} whitespace-nowrap`}>
            Nueva Marca
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-gray-500 mt-4 mb-1">
        {loading ? 'Cargando marcas...' : `Total de marcas: ${gyms.length}`}
      </p>
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}

      {/* ── Barra de filtros ── */}
      {!loading && !error && gyms.length > 0 && (
        <div className={`${cardCls} p-4 mt-4 mb-5 flex flex-col md:flex-row flex-wrap gap-3 items-center`}>
          <div className="relative flex-1" style={{ minWidth: '180px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar marca por nombre..."
              aria-label="Buscar marca por nombre"
              className={`${sharedInputCls} pl-9`}
            />
          </div>
          <div className="relative">
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}
              aria-label="Ordenar"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="az"     >Nombre A → Z</option>
              <option value="za"     >Nombre Z → A</option>
              <option value="id_asc" >ID ↑</option>
              <option value="id_desc">ID ↓</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {(search || sortOrder !== 'az') && (
            <button onClick={() => { setSearch(''); setSortOrder('az'); }} className={`${btnGhost} inline-flex items-center gap-1.5`}>
              <X size={12} />Limpiar
            </button>
          )}
        </div>
      )}
      {!loading && !error && gyms.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-gray-500 mb-2">
          {filteredGyms.length === gyms.length ? `${gyms.length} marcas` : `${filteredGyms.length} de ${gyms.length} marcas`}
        </div>
      )}

      {!loading && !error && filteredGyms.length === 0 && (
        <div className={cardCls}>
          <EmptyState
            icon={Building2}
            title={search ? 'Sin resultados para los filtros aplicados' : 'No hay marcas registradas'}
            description={search ? 'Prueba con otro término de búsqueda.' : 'Crea la primera marca con el botón de arriba.'}
          />
        </div>
      )}

      {!loading && !error && filteredGyms.length > 0 && (
        <div className={`overflow-hidden mt-4 ${cardCls}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: '400px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '62%' }} />
              <col style={{ width: '26%' }} />
            </colgroup>
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} text-left`}>ID</th>
                <th className={`${thCls} text-left`}>Nombre de la Marca</th>
                <th className={`${thCls} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredGyms.map((g) => (
                <tr key={g.id} className={trCls}>
                  <td className={`${tdCls} text-slate-500 dark:text-gray-500`}>{g.id}</td>
                  <td className={tdCls}>
                    <span className={pillCls('sky')}>{g.name}</span>
                  </td>
                  <td className={`${tdCls} text-center`}>
                    <div className="flex gap-1.5 justify-center items-center">
                      <button
                        title="Ver información"
                        onClick={() => setInfoSede(g)}
                        className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                      >
                        <Info size={15} />
                      </button>

                      {(user?.level ?? 0) >= 10 && (<>
                        <button
                          onClick={() => handleEditSede(g)}
                          title="Editar marca"
                          className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteSede(g)}
                          title="Eliminar marca"
                          className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <MarcaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        marcaToEdit={sedeToEdit}
        onSave={handleSaveSede}
        existingGyms={gyms}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmSede}
        onClose={() => setDeleteConfirmSede(null)}
        onConfirm={confirmDeleteSede}
        title="Confirmar Eliminación"
        message={`¿Estás seguro de querer eliminar la marca "${deleteConfirmSede?.name}"? Esta acción no se puede deshacer y borrará los registros asociados permanentemente.`}
      />

      {/* ── Info card de marca ── */}
      {infoSede && (
        <ModalOverlay onClose={() => setInfoSede(null)}>
          <div style={{ width: '100%' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-2.5">
                <Building2 size={22} className="text-sky-400" strokeWidth={2.2} />
                <div>
                  <div className="text-[0.68rem] text-sky-500 dark:text-sky-400 font-bold uppercase tracking-wider mb-0.5">
                    Marca · #{infoSede.id}
                  </div>
                  <h2 className="text-slate-900 dark:text-gray-100 m-0 text-xl font-extrabold">{infoSede.name}</h2>
                </div>
              </div>
              <button onClick={() => setInfoSede(null)} className={`${iconBtnCls} shrink-0 text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/5`}>
                <X size={18} />
              </button>
            </div>

            {/* Descripción */}
            <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
              <div className="text-[0.68rem] text-slate-500 dark:text-gray-500 font-bold uppercase tracking-wide mb-2">
                Descripción
              </div>
              {infoSede.description ? (
                <p className="text-slate-900 dark:text-gray-200 m-0 text-sm leading-relaxed">{infoSede.description}</p>
              ) : (
                <p className="text-slate-400 dark:text-gray-500 m-0 text-sm italic">Sin descripción registrada.</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end mt-5 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
              <button onClick={() => setInfoSede(null)} className={btnGhost}>
                Cerrar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
};

// --- MODAL DE MARCA (SEDE) ---
