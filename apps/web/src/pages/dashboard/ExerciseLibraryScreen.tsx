import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, BookOpen, Filter, Plus, Loader2, Trash2, Save, X, Upload, Pencil, AlertCircle, Play, Eye, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { btnPrimary, btnGhost, btnDanger, iconBtnCls, cardCls } from '../../components/Dashboard/Shared/designTokens';
import { EmptyState } from '../../components/Dashboard/Shared/DashboardShared';

const isValidYoutubeId = (id?: string | null) => !!id && /^[a-zA-Z0-9_-]{11}$/.test(id);
const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;
const EX_NAME_MAX = 100;
const EX_DESC_MAX = 500;
const EX_EQUIP_MAX = 200;

type Exercise = {
  id: number;
  name: string;
  description?: string | null;
  muscleGroup: string;
  category?: string | null;
  exerciseType?: string | null;
  difficultyLevel: string;
  equipmentRequired?: string | null;
  youtubeVideoId?: string | null;
  imageUrl?: string | null;
  logType: string;
  isActive: boolean;
};

const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Pierna', 'Hombro', 'Brazo', 'Core', 'Cardio', 'HIIT', 'Fondos'];

const DIFFICULTY_OPTIONS = [
  { label: 'Principiante', value: 'PRINCIPIANTE' },
  { label: 'Intermedio',   value: 'INTERMEDIO'   },
  { label: 'Avanzado',     value: 'AVANZADO'     },
];

const CATEGORY_OPTIONS = [
  { label: 'Fuerza',       value: 'FUERZA'      },
  { label: 'Hipertrofia',  value: 'HIPERTROFIA' },
  { label: 'Resistencia',  value: 'RESISTENCIA' },
  { label: 'Potencia',     value: 'POTENCIA'    },
  { label: 'Flexibilidad', value: 'FLEXIBILIDAD' },
];

const EXERCISE_TYPE_OPTIONS = [
  { label: 'Musculación / Fuerza',     value: 'STRENGTH'    },
  { label: 'Cardiovascular',           value: 'CARDIO'      },
  { label: 'Flexibilidad / Movilidad', value: 'FLEXIBILITY' },
];

const LOG_TYPE_OPTIONS = [
  { label: 'Peso + Repeticiones', value: 'WEIGHT_REPS'   },
  { label: 'Solo Repeticiones',   value: 'REPS_ONLY'     },
  { label: 'Tiempo + Distancia',  value: 'TIME_DISTANCE' },
  { label: 'Solo Tiempo',         value: 'TIME_ONLY'     },
];

const MUSCLE_COLORS: Record<string, string> = {
  Pecho:   'bg-red-500/15 text-red-400 border-red-500/30',
  Espalda: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Pierna:  'bg-violet-500/15 text-violet-400 border-violet-500/30',
  Hombro:  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Brazo:   'bg-pink-500/15 text-pink-400 border-pink-500/30',
  Core:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Cardio:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  HIIT:    'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Fondos:  'bg-teal-500/15 text-teal-400 border-teal-500/30',
};

const DIFF_STYLE: Record<string, string> = {
  PRINCIPIANTE: 'text-emerald-400',
  INTERMEDIO:   'text-amber-400',
  AVANZADO:     'text-red-400',
};

const DIFF_LABEL  = Object.fromEntries(DIFFICULTY_OPTIONS.map(o => [o.value, o.label]));
const CAT_LABEL   = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.value, o.label]));
const TYPE_LABEL  = Object.fromEntries(EXERCISE_TYPE_OPTIONS.map(o => [o.value, o.label]));
const LOG_LABELS  = Object.fromEntries(LOG_TYPE_OPTIONS.map(o => [o.value, o.label]));

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════════

const ExerciseModal: React.FC<{
  exercise: Exercise | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ exercise, onClose, onSuccess }) => {
  const isNew = !exercise;

  const [form, setForm] = useState({
    name: exercise?.name ?? '',
    description: exercise?.description ?? '',
    muscleGroup: exercise?.muscleGroup ?? 'Pectorales',
    category: exercise?.category ?? 'FUERZA',
    exerciseType: exercise?.exerciseType ?? 'STRENGTH',
    difficultyLevel: exercise?.difficultyLevel ?? 'PRINCIPIANTE',
    equipmentRequired: exercise?.equipmentRequired ?? '',
    youtubeVideoId: exercise?.youtubeVideoId ?? '',
    logType: exercise?.logType ?? 'WEIGHT_REPS',
    isActive: exercise?.isActive ?? true,
  });
  const [currentImageUrl, setCurrentImageUrl] = useState(exercise?.imageUrl ?? undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const updateField = (field: string, value: string | boolean) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio.'); return; }
    if (form.name.trim().length > EX_NAME_MAX) { toast.error(`El nombre no puede superar los ${EX_NAME_MAX} caracteres.`); return; }
    if (GIBBERISH_RE.test(form.name)) { toast.error('El nombre parece contener caracteres aleatorios o inválidos.'); return; }
    if (form.description && GIBBERISH_RE.test(form.description)) { toast.error('La descripción parece contener caracteres aleatorios o inválidos.'); return; }
    if (form.equipmentRequired && GIBBERISH_RE.test(form.equipmentRequired)) { toast.error('El equipamiento parece contener caracteres aleatorios o inválidos.'); return; }
    setIsSaving(true);
    try {
      if (isNew) {
        const res = await apiClient.post('/exercises', form);
        const newExId = res.data?.id;
        if (newExId && pendingImage) {
          const fd = new FormData();
          fd.append('image', pendingImage);
          await apiClient.patch(`/exercises/${newExId}/image`, fd);
        }
        toast.success('Ejercicio creado');
      } else {
        await apiClient.put(`/exercises/${exercise.id}`, form);
        toast.success('Ejercicio actualizado');
      }
      onSuccess();
    } catch { toast.error('Error al guardar'); }
    finally { setIsSaving(false); }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (file: File) => {
    if (isNew) {
      setPendingImage(file);
      setCurrentImageUrl(URL.createObjectURL(file));
      resetFileInput();
      return;
    }
    if (!exercise) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const { data } = await apiClient.patch(`/exercises/${exercise.id}/image`, fd);
      setCurrentImageUrl(data.imageUrl);
      toast.success('Imagen subida');
    } catch { toast.error('Error al subir imagen'); }
    finally {
      setIsUploading(false);
      resetFileInput();
    }
  };

  const handleDeleteImage = async () => {
    if (isNew) {
      setPendingImage(null);
      setCurrentImageUrl(undefined);
      resetFileInput();
      return;
    }
    if (!exercise) return;
    try {
      await apiClient.delete(`/exercises/${exercise.id}/image`);
      setCurrentImageUrl(undefined);
      resetFileInput();
      toast.success('Imagen eliminada');
    } catch { toast.error('Error al eliminar imagen'); }
  };

  const handleDelete = async () => {
    if (!exercise) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/exercises/${exercise.id}`);
      toast.success('Ejercicio eliminado');
      onSuccess();
    } catch { toast.error('Error al eliminar'); }
    finally { setIsDeleting(false); }
  };

  const inputClass = 'w-full bg-slate-50 dark:bg-bg-deep/60 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-orange transition-colors';
  const labelClass = 'text-slate-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-white/10 w-full max-w-4xl rounded-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center shrink-0">
          <h2 className="text-slate-900 dark:text-white font-bold">{isNew ? 'Crear Ejercicio' : `Editar: ${exercise.name}`}</h2>
          <button onClick={onClose} className={`${iconBtnCls} text-slate-500 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}><X size={16} /></button>
        </div>

        {/* Body — 2 columnas */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* ── Columna Izquierda: Datos Duros (3/5) ── */}
            <div className="lg:col-span-3 space-y-4">
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <p className={labelClass} style={{ marginBottom: 0 }}>Nombre *</p>
                  <span className={`text-xs ${form.name.length > EX_NAME_MAX ? 'text-red-500' : form.name.length > EX_NAME_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                    {form.name.length}/{EX_NAME_MAX}
                  </span>
                </div>
                <input className={inputClass} value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Ej: Press de Banca Plano" maxLength={EX_NAME_MAX} />
                {GIBBERISH_RE.test(form.name) && (
                  <p className="text-amber-500 text-xs mt-1">El nombre parece contener caracteres aleatorios</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={labelClass}>Grupo muscular *</p>
                  <select className={inputClass} value={form.muscleGroup} onChange={e => updateField('muscleGroup', e.target.value)}>
                    {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelClass}>Dificultad *</p>
                  <select className={inputClass} value={form.difficultyLevel} onChange={e => updateField('difficultyLevel', e.target.value)}>
                    {DIFFICULTY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={labelClass}>Categoría</p>
                  <select className={inputClass} value={form.category} onChange={e => updateField('category', e.target.value)}>
                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelClass}>Tipo de ejercicio</p>
                  <select className={inputClass} value={form.exerciseType} onChange={e => updateField('exerciseType', e.target.value)}>
                    {EXERCISE_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={labelClass}>Tipo de Log (App Móvil)</p>
                  <select className={inputClass} value={form.logType} onChange={e => updateField('logType', e.target.value)}>
                    {LOG_TYPE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className={labelClass} style={{ marginBottom: 0 }}>Equipamiento</p>
                    <span className={`text-xs ${(form.equipmentRequired?.length ?? 0) > EX_EQUIP_MAX ? 'text-red-500' : 'text-slate-400 dark:text-gray-500'}`}>
                      {form.equipmentRequired?.length ?? 0}/{EX_EQUIP_MAX}
                    </span>
                  </div>
                  <input className={inputClass} value={form.equipmentRequired} onChange={e => updateField('equipmentRequired', e.target.value)} placeholder="Barra, Mancuernas..." maxLength={EX_EQUIP_MAX} />
                  {form.equipmentRequired && GIBBERISH_RE.test(form.equipmentRequired) && (
                    <p className="text-amber-500 text-xs mt-1">El equipamiento parece contener caracteres aleatorios</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <p className={labelClass} style={{ marginBottom: 0 }}>Descripción</p>
                  <span className={`text-xs ${(form.description?.length ?? 0) > EX_DESC_MAX ? 'text-red-500' : (form.description?.length ?? 0) > EX_DESC_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                    {form.description?.length ?? 0}/{EX_DESC_MAX}
                  </span>
                </div>
                <textarea className={`${inputClass} resize-none h-20`} value={form.description ?? ''} onChange={e => updateField('description', e.target.value)} placeholder="Instrucciones de ejecución del ejercicio..." maxLength={EX_DESC_MAX} />
                {form.description && GIBBERISH_RE.test(form.description) && (
                  <p className="text-amber-500 text-xs mt-1">La descripción parece contener caracteres aleatorios</p>
                )}
              </div>

              {!isNew && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input type="checkbox" checked={form.isActive} onChange={e => updateField('isActive', e.target.checked)} className="accent-brand-orange w-4 h-4" />
                  <span className="text-slate-700 dark:text-gray-300 text-sm font-medium">Ejercicio activo en la app</span>
                </label>
              )}
            </div>

            {/* ── Columna Derecha: Multimedia (2/5) ── */}
            <div className="lg:col-span-2 space-y-5">
              {/* Imagen */}
              <div>
                <p className={labelClass}>Imagen del ejercicio</p>
                <div className="h-40 w-full bg-slate-100 dark:bg-bg-deep/60 rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10">
                  {currentImageUrl
                    ? <img src={currentImageUrl} alt={form.name} className="w-full h-full object-cover" />
                    : <span className="text-slate-400 dark:text-gray-600 italic text-sm">Sin imagen</span>}
                </div>
                <div className="flex gap-2">
                  <label className={`flex-1 inline-flex items-center justify-center gap-2 cursor-pointer ${btnGhost} hover:bg-brand-orange hover:text-white dark:hover:bg-brand-orange dark:hover:text-white`}>
                    {isUploading ? <><Loader2 size={14} className="animate-spin" /> Subiendo...</> : <><Upload size={14} /> {currentImageUrl ? 'Reemplazar' : 'Subir'}</>}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }} />
                  </label>
                  {currentImageUrl && (
                    <button onClick={handleDeleteImage} className={`${btnDanger} px-3 py-2`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Video YouTube */}
              <div>
                <p className={labelClass}>Video demostrativo (YouTube)</p>
                <div className="relative">
                  <Play className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" size={16} />
                  <input
                    className={`${inputClass} pl-10`}
                    value={form.youtubeVideoId}
                    onChange={e => updateField('youtubeVideoId', e.target.value)}
                    placeholder="ID de 11 caracteres"
                  />
                </div>

                {isValidYoutubeId(form.youtubeVideoId) ? (
                  <div className="aspect-video w-full rounded-lg overflow-hidden bg-black border border-slate-200 dark:border-gray-700 mt-3">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${form.youtubeVideoId}`}
                      title="Video Demo"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="w-full h-28 mt-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-gray-700 flex flex-col items-center justify-center text-slate-400 dark:text-gray-500 bg-slate-50 dark:bg-bg-deep/60">
                    <AlertCircle size={20} className="mb-1.5" />
                    <p className="text-xs">
                      {form.youtubeVideoId ? 'ID no válido (debe tener 11 caracteres)' : 'Introduce un ID de YouTube para ver la vista previa'}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-3 shrink-0">
          {!isNew && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-xs">¿Eliminar ejercicio?</span>
                <button onClick={handleDelete} disabled={isDeleting} className={btnDanger}>{isDeleting ? 'Eliminando...' : 'Confirmar'}</button>
                <button onClick={() => setShowDeleteConfirm(false)} className={`${btnGhost} px-3 py-1.5 text-xs`}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm font-medium inline-flex items-center gap-2">
                <Trash2 size={14} /> Eliminar ejercicio
              </button>
            )
          )}
          <div className="flex-1" />
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className={`${btnPrimary} inline-flex items-center gap-2`}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Crear' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export const ExerciseLibraryScreen = () => {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedLogType, setSelectedLogType] = useState('');
  const [modalExercise, setModalExercise] = useState<Exercise | null | 'new'>(null);
  const [viewingExercise, setViewingExercise] = useState<Exercise | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchExercises = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/exercises');
      setExercises(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('No se pudo cargar la biblioteca.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchExercises(); }, [fetchExercises]);

  const muscleGroups = useMemo(() => {
    const groups = exercises.map(e => e.muscleGroup).filter(Boolean);
    return Array.from(new Set(groups)).sort();
  }, [exercises]);

  const filtered = useMemo(() => {
    return exercises.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.equipmentRequired ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMuscle = selectedMuscleGroup ? e.muscleGroup === selectedMuscleGroup : true;
      const matchesCat = selectedCategory ? e.category === selectedCategory : true;
      const matchesDiff = selectedDifficulty ? e.difficultyLevel === selectedDifficulty : true;
      const matchesLog = selectedLogType ? e.logType === selectedLogType : true;
      return matchesSearch && matchesMuscle && matchesCat && matchesDiff && matchesLog;
    });
  }, [exercises, searchQuery, selectedMuscleGroup, selectedCategory, selectedDifficulty, selectedLogType]);

  const closeModal = useCallback(() => { setModalExercise(null); fetchExercises(); }, [fetchExercises]);

  const handleQuickDelete = async (ex: Exercise) => {
    if (!window.confirm(`¿Eliminar "${ex.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(ex.id);
    try {
      await apiClient.delete(`/exercises/${ex.id}`);
      toast.success(`"${ex.name}" eliminado`);
      fetchExercises();
    } catch { toast.error('Error al eliminar'); }
    finally { setDeletingId(null); }
  };

  if ((user?.level ?? 0) < 10) {
    return <div className="flex items-center justify-center h-full text-gray-500">Acceso exclusivo para Super Admin.</div>;
  }

  const selectClass = 'w-full bg-white dark:bg-bg-surface text-slate-900 dark:text-white border border-slate-200 dark:border-gray-700 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-brand-orange transition-colors appearance-none cursor-pointer';
  const thClass = 'px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500';
  const tdClass = 'px-5 py-4 text-sm';

  return (
    <div className="p-6 min-h-full bg-gray-100 dark:bg-bg-deep">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Biblioteca de Ejercicios App</h1>
            <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
              {exercises.length} ejercicios registrados — {filtered.length} visibles
            </p>
          </div>
          <button
            onClick={() => setModalExercise('new')}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            <Plus size={16} /> Nuevo Ejercicio
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o equipamiento..."
            className="w-full bg-white dark:bg-bg-surface text-slate-900 dark:text-white border border-slate-200 dark:border-gray-700 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-brand-orange transition-colors placeholder:text-slate-400 dark:placeholder:text-gray-600"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-48 shrink-0">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
          <select className={selectClass} value={selectedMuscleGroup} onChange={e => setSelectedMuscleGroup(e.target.value)}>
            <option value="">Músculo</option>
            {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="relative w-full md:w-40 shrink-0">
          <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
          <select className={selectClass} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">Categoría</option>
            {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="relative w-full md:w-40 shrink-0">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
          <select className={selectClass} value={selectedDifficulty} onChange={e => setSelectedDifficulty(e.target.value)}>
            <option value="">Dificultad</option>
            {DIFFICULTY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div className="relative w-full md:w-44 shrink-0">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
          <select className={selectClass} value={selectedLogType} onChange={e => setSelectedLogType(e.target.value)}>
            <option value="">Tipo de Log</option>
            {LOG_TYPE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-20 text-brand-orange"><Loader2 className="animate-spin" size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            icon={BookOpen}
            title="No se encontraron ejercicios"
            description="Ajusta los filtros de músculo, tipo o dificultad para ver otros ejercicios."
          />
        </div>
      ) : (
        <div className={`overflow-hidden ${cardCls}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-bg-deep">
                  <th className={thClass}>#</th>
                  <th className={thClass}>Ejercicio</th>
                  <th className={thClass}>Músculo Objetivo</th>
                  <th className={thClass}>Tipo / Log</th>
                  <th className={thClass}>Dificultad</th>
                  <th className={thClass}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ex => {
                  const muscleStyle = MUSCLE_COLORS[ex.muscleGroup] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30';
                  const diffStyle = DIFF_STYLE[ex.difficultyLevel] ?? 'text-gray-400';
                  return (
                    <tr
                      key={ex.id}
                      className={`border-b border-slate-100 dark:border-gray-800/60 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors ${!ex.isActive ? 'opacity-40' : ''}`}
                    >
                      <td className={`${tdClass} text-slate-400 dark:text-gray-600 font-mono text-xs`}>{ex.id}</td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-3">
                          {ex.imageUrl ? (
                            <img src={ex.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-gray-700 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-bg-deep border border-slate-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                              <BookOpen size={14} className="text-slate-300 dark:text-gray-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-slate-900 dark:text-white font-semibold text-sm truncate">{ex.name}</p>
                            <p className="text-slate-400 dark:text-gray-600 text-xs truncate">{ex.equipmentRequired || 'Peso corporal'}</p>
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider border ${muscleStyle}`}>
                          {ex.muscleGroup}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-700 dark:text-gray-300 text-xs font-medium">{ex.category ? (CAT_LABEL[ex.category] ?? ex.category) : '—'}</span>
                          <span className="text-slate-400 dark:text-gray-500 text-[11px]">{LOG_LABELS[ex.logType] ?? ex.logType}</span>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <span className={`font-bold text-xs ${diffStyle}`}>{DIFF_LABEL[ex.difficultyLevel] ?? ex.difficultyLevel}</span>
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setViewingExercise(ex)}
                            className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                            title="Ver detalle"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => setModalExercise(ex)}
                            className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-brand-orange/10 hover:text-brand-orange`}
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleQuickDelete(ex)}
                            disabled={deletingId === ex.id}
                            className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30`}
                            title="Eliminar"
                          >
                            {deletingId === ex.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-800 text-xs text-slate-400 dark:text-gray-600">
            Mostrando {filtered.length} de {exercises.length} ejercicios
          </div>
        </div>
      )}

      {/* Detail Panel (View) */}
      {viewingExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4" onClick={() => setViewingExercise(null)}>
          <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-white/10 w-full max-w-2xl rounded-xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center shrink-0">
              <h2 className="text-slate-900 dark:text-white font-bold truncate pr-4">{viewingExercise.name}</h2>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setViewingExercise(null); setModalExercise(viewingExercise); }} className="px-3 py-1.5 bg-brand-orange/10 text-brand-orange rounded-lg text-xs font-medium hover:bg-brand-orange hover:text-white transition-all inline-flex items-center gap-1.5">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => setViewingExercise(null)} className={`${iconBtnCls} text-slate-500 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: info */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Músculo</p>
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider border ${MUSCLE_COLORS[viewingExercise.muscleGroup] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>{viewingExercise.muscleGroup}</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Dificultad</p>
                      <span className={`font-bold text-sm ${DIFF_STYLE[viewingExercise.difficultyLevel] ?? 'text-gray-400'}`}>{DIFF_LABEL[viewingExercise.difficultyLevel] ?? viewingExercise.difficultyLevel}</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Categoría</p>
                      <span className="text-slate-800 dark:text-gray-200 text-sm">{viewingExercise.category ? (CAT_LABEL[viewingExercise.category] ?? viewingExercise.category) : '—'}</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Tipo</p>
                      <span className="text-slate-800 dark:text-gray-200 text-sm">{viewingExercise.exerciseType ? (TYPE_LABEL[viewingExercise.exerciseType] ?? viewingExercise.exerciseType) : '—'}</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Tipo de Log</p>
                      <span className="text-slate-800 dark:text-gray-200 text-sm">{LOG_LABELS[viewingExercise.logType] ?? viewingExercise.logType}</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Estado</p>
                      <span className={`text-sm font-semibold ${viewingExercise.isActive ? 'text-green-400' : 'text-red-400'}`}>{viewingExercise.isActive ? 'Activo' : 'Inactivo'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Equipamiento</p>
                    <p className="text-slate-800 dark:text-gray-200 text-sm">{viewingExercise.equipmentRequired || 'Peso corporal / Sin equipo'}</p>
                  </div>
                  {viewingExercise.description && (
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-1">Descripción</p>
                      <p className="text-slate-600 dark:text-gray-400 text-sm leading-relaxed">{viewingExercise.description}</p>
                    </div>
                  )}
                </div>
                {/* Right: multimedia */}
                <div className="space-y-4">
                  {viewingExercise.imageUrl && (
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-2">Imagen</p>
                      <img src={viewingExercise.imageUrl} alt={viewingExercise.name} className="w-full h-40 object-cover rounded-lg border border-slate-200 dark:border-gray-700" />
                    </div>
                  )}
                  {isValidYoutubeId(viewingExercise.youtubeVideoId) && (
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase tracking-wider font-semibold mb-2">Video demostrativo</p>
                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black border border-slate-200 dark:border-gray-700">
                        <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${viewingExercise.youtubeVideoId}`} title="Demo" frameBorder="0" allowFullScreen />
                      </div>
                    </div>
                  )}
                  {!viewingExercise.imageUrl && !isValidYoutubeId(viewingExercise.youtubeVideoId) && (
                    <div className="h-40 rounded-lg border-2 border-dashed border-slate-300 dark:border-gray-700 flex flex-col items-center justify-center text-slate-400 dark:text-gray-500 bg-slate-50 dark:bg-bg-deep/60">
                      <BookOpen size={24} className="mb-2" />
                      <p className="text-xs">Sin multimedia</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      {modalExercise !== null && (
        <ExerciseModal
          exercise={modalExercise === 'new' ? null : modalExercise}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}
    </div>
  );
};
