import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Wrench, Filter, Plus, Loader2, Layers, Info, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import { MachineFormModal } from '../../components/Dashboard/MachineFormModal';
import { btnPrimary, iconBtnCls, cardCls } from '../../components/Dashboard/Shared/designTokens';
import { EmptyState } from '../../components/Dashboard/Shared/DashboardShared';

type Machine = {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'MAINTENANCE';
  category?: string;
  imageUrl?: string | null;
  gymId: number;
  gym?: { id: number; name: string; parent?: { id: number; name: string } | null };
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  AVAILABLE:   { label: 'Disponible',    color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25' },
  MAINTENANCE: { label: 'Mantenimiento', color: 'text-amber-400', bg: 'bg-amber-500/10',  border: 'border-amber-500/25' },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  CARDIO:        { label: 'Cardio',         color: 'text-rose-400' },
  TREN_SUPERIOR: { label: 'Tren Superior',  color: 'text-blue-400' },
  TREN_INFERIOR: { label: 'Tren Inferior',  color: 'text-violet-400' },
  ESPALDA:       { label: 'Espalda',        color: 'text-teal-400' },
  MULTIESTACION: { label: 'Multiestación',  color: 'text-gray-400' },
};

export const MachineInventoryScreen = () => {
  const { user } = useAuth();
  const canManage = (user?.level ?? 0) >= 4;
  const isSuperAdmin = (user?.level ?? 0) >= 10;

  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedGymId, setSelectedGymId] = useState('');
  const [modalMachine, setModalMachine] = useState<Machine | null | 'new'>(null);
  const [infoMachine, setInfoMachine] = useState<Machine | null>(null);

  const fetchMachines = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/machines');
      setMachines(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const gyms = useMemo(() => {
    const map = new Map<number, string>();
    machines.forEach(m => {
      if (m.gym) map.set(m.gym.id, m.gym.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [machines]);

  const filtered = useMemo(() => {
    return machines.filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.gym?.name ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatus ? m.status === selectedStatus : true;
      const matchesCategory = selectedCategory ? m.category === selectedCategory : true;
      const matchesGym = selectedGymId ? m.gymId === Number(selectedGymId) : true;
      return matchesSearch && matchesStatus && matchesCategory && matchesGym;
    });
  }, [machines, searchQuery, selectedStatus, selectedCategory, selectedGymId]);

  const closeModal = useCallback(() => {
    setModalMachine(null);
    fetchMachines();
  }, [fetchMachines]);

  if ((user?.level ?? 0) < 4) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No tienes permisos para acceder al Inventario de Máquinas.
      </div>
    );
  }

  const stats = {
    total: machines.length,
    available: machines.filter(m => m.status === 'AVAILABLE').length,
    maintenance: machines.filter(m => m.status === 'MAINTENANCE').length,
  };

  const selectClass = 'w-full bg-white dark:bg-bg-surface text-slate-900 dark:text-white border border-slate-200 dark:border-gray-700 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-brand-orange transition-colors appearance-none cursor-pointer';

  return (
    <div className="p-6 min-h-full bg-gray-100 dark:bg-bg-deep">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inventario de Máquinas</h1>
          {canManage && (
            <button
              onClick={() => setModalMachine('new')}
              className={`${btnPrimary} inline-flex items-center gap-2`}
            >
              <Plus size={16} /> Nueva Máquina
            </button>
          )}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wider">Total</div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
          </div>
          <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wider">Disponibles</div>
            <div className="text-xl font-bold text-green-500 dark:text-green-400">{stats.available}</div>
          </div>
          <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wider">Mantenimiento</div>
            <div className="text-xl font-bold text-amber-500 dark:text-amber-400">{stats.maintenance}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre o sucursal..."
              className="w-full bg-white dark:bg-bg-surface text-slate-900 dark:text-white border border-slate-200 dark:border-gray-700 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-brand-orange transition-colors placeholder:text-slate-400 dark:placeholder:text-gray-600"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="relative w-full md:w-48 shrink-0">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
            <select className={selectClass} value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="AVAILABLE">Disponible</option>
              <option value="MAINTENANCE">Mantenimiento</option>
            </select>
          </div>

          <div className="relative w-full md:w-52 shrink-0">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
            <select className={selectClass} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">Todas las zonas</option>
              <option value="CARDIO">Cardio</option>
              <option value="TREN_SUPERIOR">Tren Superior</option>
              <option value="TREN_INFERIOR">Tren Inferior</option>
              <option value="ESPALDA">Espalda</option>
              <option value="MULTIESTACION">Multiestación</option>
            </select>
          </div>

          {isSuperAdmin && gyms.length > 1 && (
            <div className="relative w-full md:w-64 shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
              <select className={selectClass} value={selectedGymId} onChange={(e) => setSelectedGymId(e.target.value)}>
                <option value="">Todas las sucursales</option>
                {gyms.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-brand-orange">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            icon={Wrench}
            title="No se encontraron máquinas"
            description="Ajusta los filtros de estado, zona o sucursal para ver otras máquinas."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(machine => {
            const st = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.AVAILABLE;
            const cat = CATEGORY_CONFIG[machine.category ?? ''] ?? CATEGORY_CONFIG.MULTIESTACION;
            return (
              <div key={machine.id} className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-gray-800 hover:border-brand-orange/40 transition-colors rounded-xl overflow-hidden flex flex-col h-[320px]">
                <div className="h-[140px] w-full shrink-0 relative bg-slate-100 dark:bg-bg-deep">
                  {machine.imageUrl ? (
                    <img src={machine.imageUrl} alt={machine.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-bg-surface dark:to-bg-deep p-4 text-center">
                      <Wrench className="text-slate-300 dark:text-gray-700 mb-2" size={32} />
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-gray-500 uppercase">Sin imagen</span>
                    </div>
                  )}
                  <div className={`absolute top-3 right-3 ${st.bg} ${st.border} border backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${st.color} uppercase`}>
                    {st.label}
                  </div>
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-md">
                    <span className={`text-[10px] font-bold tracking-wider uppercase ${cat.color}`}>{cat.label}</span>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-slate-900 dark:text-white font-bold text-base truncate mb-1" title={machine.name}>{machine.name}</h3>
                  {machine.gym?.parent?.name && (
                    <p className="text-brand-orange text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5">
                      {machine.gym.parent.name}
                    </p>
                  )}
                  <p className="text-brand-orange/70 text-[10px] font-semibold uppercase tracking-wider mb-auto">
                    {machine.gym?.name ?? `Sede #${machine.gymId}`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setInfoMachine(machine)}
                      title="Ver información"
                      className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10 shrink-0`}
                    >
                      <Info size={14} />
                    </button>
                    {canManage && (
                      <button
                        onClick={() => setModalMachine(machine)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-white/5 hover:bg-brand-orange text-slate-600 dark:text-gray-300 hover:text-white border border-slate-200 dark:border-white/10 hover:border-brand-orange py-2 rounded-lg text-xs font-medium transition-all"
                      >
                        <Wrench size={13} /> Gestionar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalMachine !== null && (
        <MachineFormModal
          machine={modalMachine === 'new' ? null : modalMachine}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}

      {infoMachine && (
        <MachineInfoModal machine={infoMachine} onClose={() => setInfoMachine(null)} />
      )}
    </div>
  );
};

const MachineInfoModal = ({ machine, onClose }: { machine: Machine; onClose: () => void }) => {
  const st  = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.AVAILABLE;
  const cat = CATEGORY_CONFIG[machine.category ?? ''] ?? CATEGORY_CONFIG.MULTIESTACION;
  const marca    = machine.gym?.parent?.name ?? null;
  const sucursal = machine.gym?.name ?? `Sede #${machine.gymId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-bg-surface border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Imagen */}
        <div className="h-48 relative bg-slate-100 dark:bg-bg-deep">
          {machine.imageUrl ? (
            <img src={machine.imageUrl} alt={machine.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Wrench className="text-slate-300 dark:text-gray-700 mb-2" size={40} />
              <span className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-gray-500 uppercase">Sin imagen</span>
            </div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors">
            <X size={14} />
          </button>
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-md">
            <span className={`text-[10px] font-bold tracking-wider uppercase ${cat.color}`}>{cat.label}</span>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-5">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-4 leading-snug">{machine.name}</h2>

          <div className="space-y-3">
            <Row label="Estado">
              <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md ${st.bg} ${st.color} ${st.border} border`}>
                {st.label}
              </span>
            </Row>
            <Row label="Categoría">
              <span className={`text-sm font-semibold ${cat.color}`}>{cat.label}</span>
            </Row>
            {marca && (
              <Row label="Marca">
                <span className="text-sm font-semibold text-brand-orange">{marca}</span>
              </Row>
            )}
            <Row label="Sucursal">
              <span className="text-sm font-semibold text-brand-orange/80">{sucursal}</span>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-gray-800 last:border-0">
    <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">{label}</span>
    {children}
  </div>
);
