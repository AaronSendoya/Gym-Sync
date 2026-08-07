import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Loader2, Trash2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { btnPrimary, btnGhost, btnDanger, iconBtnCls } from './Shared/designTokens';

type Machine = {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'MAINTENANCE';
  category?: string;
  imageUrl?: string | null;
  gymId: number;
  gym?: { id: number; name: string };
};

type GymOption = { id: number; name: string };

type Props = {
  machine: Machine | null;
  onClose: () => void;
  onSuccess: () => void;
};

const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;
const NAME_MAX = 100;

const STATUSES: { value: string; label: string }[] = [
  { value: 'AVAILABLE', label: 'Disponible' },
  { value: 'MAINTENANCE', label: 'Mantenimiento' },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'TREN_SUPERIOR', label: 'Tren Superior' },
  { value: 'TREN_INFERIOR', label: 'Tren Inferior' },
  { value: 'ESPALDA', label: 'Espalda' },
  { value: 'MULTIESTACION', label: 'Multiestación' },
];

export const MachineFormModal: React.FC<Props> = ({ machine, onClose, onSuccess }) => {
  const { user } = useAuth();
  const isNew = !machine;
  const canEdit = (user?.level ?? 0) >= 4;

  const [form, setForm] = useState({
    name: machine?.name ?? '',
    status: machine?.status ?? 'AVAILABLE',
    category: machine?.category ?? 'MULTIESTACION',
    gymId: machine?.gymId ? String(machine.gymId) : '',
  });
  const [gyms, setGyms] = useState<GymOption[]>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState(machine?.imageUrl ?? undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageChanged, setImageChanged] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const initialFormRef = useRef({
    name: machine?.name ?? '',
    status: machine?.status ?? 'AVAILABLE',
    category: machine?.category ?? 'MULTIESTACION',
    gymId: machine?.gymId ? String(machine.gymId) : '',
  });

  const isDirty = imageChanged || Object.keys(initialFormRef.current).some(
    k => form[k as keyof typeof form] !== initialFormRef.current[k as keyof typeof form]
  );

  useEffect(() => {
    apiClient.get('/gyms').then((res: any) => {
      const raw: any[] = Array.isArray(res.data) ? res.data : [];
      const branches = raw.filter((g: any) => g.parentId || g.parent_id).map((g: any) => ({ id: g.id, name: g.name }));
      setGyms(branches);
      if (isNew && branches.length === 1 && !form.gymId) {
        setForm(prev => ({ ...prev, gymId: String(branches[0].id) }));
      }
    }).catch(() => {});
  }, []);

  const handleClose = () => {
    if (isDirty) {
      if (!window.confirm('Tienes cambios sin guardar. ¿Deseas salir?')) return;
    }
    onClose();
  };

  const updateField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre de la máquina es obligatorio.');
      return;
    }
    if (form.name.trim().length > NAME_MAX) {
      toast.error(`El nombre no puede superar los ${NAME_MAX} caracteres.`);
      return;
    }
    if (GIBBERISH_RE.test(form.name)) {
      toast.error('El nombre parece contener caracteres aleatorios o inválidos.');
      return;
    }
    if (!form.gymId) {
      toast.error('Selecciona una sucursal.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = { name: form.name, status: form.status, category: form.category, gymId: Number(form.gymId) };
      if (isNew) {
        const res = await apiClient.post('/machines', payload);
        const newMachineId = res.data?.id;
        if (newMachineId && pendingImage) {
          const formData = new FormData();
          formData.append('image', pendingImage);
          await apiClient.patch(`/machines/${newMachineId}/image`, formData);
        }
        toast.success('Máquina registrada');
      } else {
        await apiClient.put(`/machines/${machine.id}`, payload);
        toast.success('Máquina actualizada');
      }
      onSuccess();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (file: File) => {
    if (isNew) {
      setPendingImage(file);
      setCurrentImageUrl(URL.createObjectURL(file));
      setImageChanged(true);
      resetFileInput();
      return;
    }
    if (!machine || !canEdit) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { data } = await apiClient.patch(`/machines/${machine.id}/image`, formData);
      setCurrentImageUrl(data.imageUrl);
      setImageChanged(true);
      toast.success('Imagen subida');
    } catch {
      toast.error('Error al subir imagen');
    } finally {
      setIsUploading(false);
      resetFileInput();
    }
  };

  const handleDeleteImage = async () => {
    if (isNew) {
      setPendingImage(null);
      setCurrentImageUrl(undefined);
      setImageChanged(true);
      resetFileInput();
      return;
    }
    if (!machine || !canEdit) return;
    try {
      await apiClient.delete(`/machines/${machine.id}/image`);
      setCurrentImageUrl(undefined);
      setImageChanged(true);
      resetFileInput();
      toast.success('Imagen eliminada');
    } catch {
      toast.error('Error al eliminar imagen');
    }
  };

  const handleDeleteMachine = async () => {
    if (!machine || !canEdit) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/machines/${machine.id}`);
      toast.success('Máquina eliminada');
      onSuccess();
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const inputClass = 'w-full bg-slate-50 dark:bg-bg-deep/60 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-orange transition-colors';
  const labelClass = 'text-slate-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4" onClick={handleClose}>
      <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-white/10 w-full max-w-lg rounded-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center shrink-0">
          <h2 className="text-slate-900 dark:text-white font-bold">{isNew ? 'Registrar Máquina' : `Editar: ${machine.name}`}</h2>
          <button onClick={handleClose} className={`${iconBtnCls} text-slate-500 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {/* Imagen */}
          <div>
            <p className={labelClass}>Imagen del equipo</p>
            <div className="h-40 w-full bg-slate-100 dark:bg-bg-deep/60 rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10">
              {currentImageUrl ? (
                <img src={currentImageUrl} alt={machine?.name || 'Preview'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-400 dark:text-gray-600 italic text-sm">Sin imagen</span>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <label className={`flex-1 inline-flex items-center justify-center gap-2 cursor-pointer ${btnGhost} hover:bg-brand-orange hover:text-white dark:hover:bg-brand-orange dark:hover:text-white`}>
                  {isUploading ? (
                    <><Loader2 size={14} className="animate-spin" /> Subiendo...</>
                  ) : (
                    <><Upload size={14} /> {currentImageUrl ? 'Reemplazar' : 'Subir imagen'}</>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }} />
                </label>
                {currentImageUrl && (
                  <button onClick={handleDeleteImage} className={`${btnDanger} px-4 py-2.5 inline-flex items-center gap-2`}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Campos */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <p className={labelClass}>Nombre de la máquina *</p>
                <span className={`text-xs ${form.name.length > NAME_MAX ? 'text-red-500' : form.name.length > NAME_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                  {form.name.length}/{NAME_MAX}
                </span>
              </div>
              <input className={inputClass} value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej: Cinta de Correr Precor A" maxLength={NAME_MAX} />
              {GIBBERISH_RE.test(form.name) && (
                <p className="text-amber-500 text-xs mt-1">El nombre parece contener caracteres aleatorios</p>
              )}
            </div>

            <div>
              <p className={labelClass}>Estado *</p>
              <select className={inputClass} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <p className={labelClass}>Zona muscular *</p>
              <select className={inputClass} value={form.category} onChange={(e) => updateField('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <p className={labelClass}>Sucursal *</p>
              <select className={inputClass} value={form.gymId} onChange={(e) => updateField('gymId', e.target.value)}>
                <option value="">Seleccionar sucursal...</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-3 shrink-0">
          {!isNew && canEdit && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xs">¿Eliminar máquina?</span>
                  <button onClick={handleDeleteMachine} disabled={isDeleting} className={btnDanger}>
                    {isDeleting ? 'Eliminando...' : 'Confirmar'}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)} className={`${btnGhost} px-3 py-1.5 text-xs`}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2">
                  <Trash2 size={14} /> Eliminar máquina
                </button>
              )}
            </>
          )}
          <div className="flex-1" />
          <button onClick={handleClose} className={btnGhost}>
            Cancelar
          </button>
          {canEdit && (
            <button onClick={handleSave} disabled={isSaving} className={`${btnPrimary} inline-flex items-center gap-2`}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isNew ? 'Registrar' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
