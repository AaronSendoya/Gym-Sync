import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import type { ReportType, ReportFilters, GymOption, DatePreset, DateRange } from './types';
import { today, weekStart, monthStart, last7, last30, fmtDate } from './types';

interface Props {
  type: ReportType;
  onConfirm: (filters: ReportFilters) => void;
  onClose: () => void;
}

const REPORT_TITLES: Record<ReportType, string> = {
  asistencia:    'Asistencia por Sucursal',
  maquinas:      'Inventario de Máquinas',
  consolidado:   'Consolidado de Sucursales',
  aforo:         'Estado de Aforo',
  ranking:       'Ranking de Sucursales',
  actividades:   'Rendimiento de Actividades',
  cancelaciones: 'Cancelaciones y No-Shows',
  frecuencia:    'Frecuencia de Entrenamiento',
  auditoria:     'Auditoría de Accesos',
  churn:         'Retención de Usuarios',
};

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'hoy',           label: 'Hoy'         },
  { key: 'ultimos7',      label: 'Últ. 7 días'  },
  { key: 'ultimos30',     label: 'Últ. 30 días' },
  { key: 'semana',        label: 'Esta semana'  },
  { key: 'mes',           label: 'Este mes'     },
  { key: 'personalizado', label: 'Personalizar' },
];

const TOP_N_OPTIONS = [
  { value: 5,  label: 'Top 5'  },
  { value: 10, label: 'Top 10' },
  { value: 20, label: 'Top 20' },
  { value: 0,  label: 'Todos'  },
];

const TYPES_WITH_GYM_PICKER: ReportType[] = [
  'asistencia', 'maquinas', 'actividades', 'cancelaciones', 'frecuencia', 'auditoria', 'churn',
];

const TYPES_WITH_TOP_N: ReportType[] = ['ranking', 'actividades'];

function defaultPreset(type: ReportType): DatePreset {
  if (type === 'auditoria')                        return 'ultimos7';
  if (type === 'churn' || type === 'frecuencia')   return 'ultimos30';
  return 'mes';
}

interface SavedState {
  preset?:           DatePreset;
  topN?:             number;
  selectedBrand?:    string;
  selectedGymId?:    number | null;
  selectedGymName?:  string;
}

function loadSaved(type: ReportType): SavedState {
  try {
    const raw = localStorage.getItem(`gymsync-filters-${type}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function ReportFilterModal({ type, onConfirm, onClose }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = (user?.level ?? 0) >= 10;

  const needsGymPicker = TYPES_WITH_GYM_PICKER.includes(type) && isSuperAdmin;
  const needsDateRange  = type !== 'aforo';
  const needsTopN       = TYPES_WITH_TOP_N.includes(type);

  // Restore from localStorage or fall back to smart defaults
  const saved = useMemo(() => loadSaved(type), [type]);

  const [preset,          setPreset]         = useState<DatePreset>(
    saved.preset && saved.preset !== 'personalizado' ? saved.preset : defaultPreset(type),
  );
  const [customFrom,      setCustomFrom]      = useState(monthStart());
  const [customTo,        setCustomTo]        = useState(today());
  const [selectedBrand,   setSelectedBrand]   = useState<string>(saved.selectedBrand ?? '');
  const [selectedGymId,   setSelectedGymId]   = useState<number | null>(saved.selectedGymId ?? null);
  const [selectedGymName, setSelectedGymName] = useState<string>(saved.selectedGymName ?? '');
  const [topN,            setTopN]            = useState<number>(saved.topN ?? 10);

  const { data: gyms = [], isLoading: gymsLoading } = useQuery<GymOption[]>({
    queryKey: ['gyms-for-report-picker'],
    queryFn: async () => {
      const res = await apiClient.get('/gyms');
      const arr: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      return arr.map((g: any) => ({
        id:         Number(g.id),
        name:       String(g.name),
        parentName: g.parentName ?? g.parent?.name ?? 'Sin Marca',
      }));
    },
    enabled: needsGymPicker,
    staleTime: 5 * 60 * 1000,
  });

  // Validate saved gymId still exists once gyms load
  useEffect(() => {
    if (!needsGymPicker || gyms.length === 0) return;
    if (saved.selectedGymId && !gyms.find(g => g.id === saved.selectedGymId)) {
      setSelectedGymId(null);
      setSelectedGymName('');
      setSelectedBrand('');
    }
  }, [gyms, needsGymPicker, saved.selectedGymId]);

  const brands = useMemo(
    () => [...new Set(gyms.map(g => g.parentName ?? 'Sin Marca'))].sort(),
    [gyms],
  );

  const branchesForBrand = useMemo(
    () => gyms.filter(g => (g.parentName ?? 'Sin Marca') === selectedBrand),
    [gyms, selectedBrand],
  );

  // Auto-assign branch for Gerente (non-SuperAdmin)
  useEffect(() => {
    if (!isSuperAdmin && user?.gymId) {
      setSelectedGymId(Number(user.gymId));
      setSelectedGymName(user.gymName ?? '');
    }
  }, [isSuperAdmin, user?.gymId, user?.gymName]);

  function getRange(): DateRange {
    const t = today();
    switch (preset) {
      case 'hoy':       return { from: t,          to: t          };
      case 'ultimos7':  return { from: last7(),     to: t          };
      case 'ultimos30': return { from: last30(),    to: t          };
      case 'semana':    return { from: weekStart(), to: t          };
      case 'mes':       return { from: monthStart(), to: t         };
      default:          return { from: customFrom,  to: customTo   };
    }
  }

  function handleBrandChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedBrand(e.target.value);
    setSelectedGymId(null);
    setSelectedGymName('');
  }

  function handleBranchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value) || null;
    setSelectedGymId(id);
    setSelectedGymName(gyms.find(g => g.id === id)?.name ?? '');
  }

  function handleConfirm() {
    if (needsGymPicker && (!selectedBrand || !selectedGymId)) return;
    if (needsDateRange && preset === 'personalizado' && customFrom > customTo) return;

    const range   = needsDateRange ? getRange() : { from: today(), to: today() };
    const gymId   = selectedGymId ?? (user?.gymId ? Number(user.gymId) : undefined);
    const gymName = selectedGymName || user?.gymName;

    // Persist for next session
    const stateToSave: SavedState = {
      preset:          preset !== 'personalizado' ? preset : undefined,
      topN:            needsTopN ? topN : undefined,
      selectedBrand:   needsGymPicker ? selectedBrand : undefined,
      selectedGymId:   needsGymPicker ? selectedGymId : undefined,
      selectedGymName: needsGymPicker ? selectedGymName : undefined,
    };
    try {
      localStorage.setItem(`gymsync-filters-${type}`, JSON.stringify(stateToSave));
    } catch { /* ignore quota errors */ }

    onConfirm({ type, range, gymId, gymName, topN: needsTopN ? topN : undefined });
  }

  const canConfirm =
    (!needsGymPicker || (!!selectedBrand && !!selectedGymId)) &&
    (!needsDateRange || preset !== 'personalizado' || (!!customFrom && !!customTo && customFrom <= customTo));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[#3A3A3C] bg-[#1C1C1E] p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF5E00]">
              Configurar Reporte
            </p>
            <h2 className="mt-1 text-[17px] font-semibold text-white">
              {REPORT_TITLES[type]}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#2C2C2E] hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {/* Date presets */}
        {needsDateRange && (
          <>
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Período de reporte
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      preset === key
                        ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00]'
                        : 'border-[#3A3A3C] text-gray-400 hover:border-[#FF5E00]/40 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {preset === 'personalizado' && (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || today()}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2 text-sm text-white focus:border-[#FF5E00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={today()}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2 text-sm text-white focus:border-[#FF5E00] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {preset !== 'personalizado' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2.5">
                <Calendar size={13} className="shrink-0 text-[#FF5E00]" />
                <span className="text-sm text-gray-300">
                  {fmtDate(getRange().from)}
                  {getRange().from !== getRange().to && ` — ${fmtDate(getRange().to)}`}
                </span>
              </div>
            )}
          </>
        )}

        {/* Top N selector */}
        {needsTopN && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Mostrar resultados
            </p>
            <div className="grid grid-cols-4 gap-2">
              {TOP_N_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTopN(opt.value)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                    topN === opt.value
                      ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00]'
                      : 'border-[#3A3A3C] text-gray-400 hover:border-[#FF5E00]/40 hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Brand → Branch cascade (SuperAdmin only) */}
        {needsGymPicker && (
          <>
            <div className="mb-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Marca
              </p>
              <div className="relative">
                <select
                  value={selectedBrand}
                  onChange={handleBrandChange}
                  disabled={gymsLoading}
                  className="w-full appearance-none rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2.5 text-sm text-white focus:border-[#FF5E00] focus:outline-none disabled:opacity-50"
                >
                  <option value="">
                    {gymsLoading ? 'Cargando marcas...' : 'Seleccionar marca...'}
                  </option>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Sucursal
              </p>
              <div className="relative">
                <select
                  value={selectedGymId ?? ''}
                  onChange={handleBranchChange}
                  disabled={!selectedBrand || branchesForBrand.length === 0}
                  className="w-full appearance-none rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] px-3 py-2.5 text-sm text-white focus:border-[#FF5E00] focus:outline-none disabled:opacity-40"
                >
                  <option value="">
                    {!selectedBrand ? 'Selecciona una marca primero' : 'Seleccionar sucursal...'}
                  </option>
                  {branchesForBrand.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-[#3A3A3C] pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#3A3A3C] px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-[#2C2C2E] hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-[#FF5E00] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#e65400] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generar Vista Previa
          </button>
        </div>
      </div>
    </div>
  );
}
