import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../infrastructure/api.config';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });
import { ModalOverlay, ConfirmModal, RecordDetailModal, DetailField, EmptyState } from './Shared/DashboardShared';
import { guardClose, panelStyle } from './Shared/DashboardShared.utils';
import { cardCls, inputCls as sharedInputCls, labelCls as sharedLabelCls, btnPrimary, btnGhost, iconBtnCls, pillCls, theadCls, thCls, tdCls, trCls } from './Shared/designTokens';
import type { GymDto, GymScheduleDto } from './Shared/DashboardTypes';
import { Eye, Edit, Trash2, Search, X, LocateFixed, Map as MapIcon, ChevronDown, Building2 } from 'lucide-react';


const HOURS_24_S   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_15_S = ['00', '15', '30', '45'];
const NAME_MAX = 100;
const DESC_MAX_BRANCH = 300;
const GIBBERISH_RE = /[bcdfghjklmnñpqrstvwxyz]{5,}/i;

const TimeSelect = ({ value, onChange, disabled = false }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) => {
  const parts = (value || '').split(':');
  const h = parts[0]?.padStart(2, '0') ?? '08';
  const m = parts[1]?.substring(0, 2) ?? '00';

  const selCls = `bg-transparent border-0 px-1.5 py-2 text-sm font-mono font-semibold outline-none text-center ${
    disabled ? 'text-slate-400 dark:text-gray-600 cursor-not-allowed' : 'text-slate-700 dark:text-gray-200 cursor-pointer'
  }`;

  return (
    <div className={`inline-flex items-center gap-px rounded-lg overflow-hidden w-full border transition-opacity duration-200 ${
      disabled
        ? 'bg-slate-100 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] opacity-50'
        : 'bg-slate-50 dark:bg-bg-deep/60 border-slate-300 dark:border-white/10'
    }`}>
      <select value={h} onChange={e => !disabled && onChange(`${e.target.value}:${m}`)} disabled={disabled} className={selCls}>
        {HOURS_24_S.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-slate-400 dark:text-gray-500 font-bold text-sm select-none">:</span>
      <select value={m} onChange={e => !disabled && onChange(`${h}:${e.target.value}`)} disabled={disabled} className={selCls}>
        {MINUTES_15_S.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
};

interface ScheduleFormEntry {
  dayOfWeek: string;
  opensAt: string;
  closesAt: string;
  isHoliday?: boolean;
}

const DAY_ORDER = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'] as const;

const timeToMinutes = (t: string): number => {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
};

const sortSchedules = (list: ScheduleFormEntry[]): ScheduleFormEntry[] =>
  [...list].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.dayOfWeek as typeof DAY_ORDER[number])
                  - DAY_ORDER.indexOf(b.dayOfWeek as typeof DAY_ORDER[number]);
    if (dayDiff !== 0) return dayDiff;
    return timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt);
  });

interface SucursalFormData {
  name: string;
  description: string;
  address: string;
  maxCapacity: number;
  isOpen: boolean;
  latitude: number;
  longitude: number;
  city: string;
  parentId: string;
  schedules: ScheduleFormEntry[];
}

interface SucursalModalProps {
  isOpen: boolean;
  onClose: () => void;
  level: number;
  sucursalToEdit: GymDto | null;
  onSave: (data: SucursalFormData) => void;
  parentGyms: Record<number, string>;
  existingGyms?: GymDto[];
}

interface LocationMarkerProps {
  position: [number, number];
  setPosition: (pos: L.LatLng) => void;
}

const LocationMarker = ({ position, setPosition }: LocationMarkerProps) => {
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return (
    <Marker position={position}></Marker>
  );
};

/** Control propio de Leaflet: centra el mapa en la ubicación actual del navegador. */
const LocateMeControl = () => {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
        setLocating(false);
      },
      () => {
        toast.error('No se pudo obtener tu ubicación actual.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <button
      type="button"
      onClick={handleLocate}
      disabled={locating}
      title="Ir a mi ubicación actual"
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        width: '34px',
        height: '34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        border: '2px solid rgba(0,0,0,0.2)',
        borderRadius: '4px',
        cursor: locating ? 'wait' : 'pointer',
        padding: 0,
      }}
    >
      <LocateFixed size={18} color={locating ? '#999' : '#1C1C1E'} />
    </button>
  );
};

const SucursalModal = ({ isOpen, onClose, level, sucursalToEdit, onSave, parentGyms, existingGyms = [] }: SucursalModalProps) => {
  const canEditMachineCapacity = level >= 5;
  const [showMap, setShowMap] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [formData, setFormData] = useState({
    name: '', 
    description: '',
    address: '', 
    maxCapacity: 100, 
    isOpen: true,
    latitude: -17.7833, 
    longitude: -63.1667, 
    city: 'Santa Cruz de la Sierra',
    parentId: '',
    schedules: [] as ScheduleFormEntry[]
  });

  const [newSchedule, setNewSchedule] = useState({
    dayOfWeek: 'LUNES',
    opensAt: '06:00',
    closesAt: '22:00',
    isHoliday: false
  });

  const fetchAddress = async (latlng: L.LatLng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`);
      const data = await response.json();
      if (data && data.display_name) {
         setFormData(prev => ({ 
           ...prev, 
           address: data.display_name, 
           latitude: latlng.lat, 
           longitude: latlng.lng,
           city: data.address?.city || data.address?.town || data.address?.village || data.address?.county || prev.city 
         }));
      } else {
         setFormData(prev => ({ ...prev, latitude: latlng.lat, longitude: latlng.lng }));
      }
    } catch (err) {
      console.error(err);
      setFormData(prev => ({ ...prev, latitude: latlng.lat, longitude: latlng.lng }));
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.setAttribute('data-modal-open', 'true');
      setShowMap(false);
      setTouched(false);
      setFormData({
        name: '',
        description: '',
        address: '',
        maxCapacity: 100,
        isOpen: true,
        latitude: -17.7833,
        longitude: -63.1667,
        city: 'Santa Cruz de la Sierra',
        parentId: '',
        schedules: []
      });
      setNewSchedule({ dayOfWeek: 'LUNES', opensAt: '06:00', closesAt: '22:00', isHoliday: false });
    } else {
      document.body.style.overflow = 'unset';
      document.body.removeAttribute('data-modal-open');
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.body.removeAttribute('data-modal-open');
    };
  }, [isOpen]);

  // Cargar datos cuando se edita
  useEffect(() => {
    if (sucursalToEdit && isOpen) {
      setFormData({
        name: sucursalToEdit.name || '',
        description: sucursalToEdit.description || '',
        address: sucursalToEdit.location?.address || '',
        maxCapacity: sucursalToEdit.maxCapacity || 100,
        isOpen: sucursalToEdit.isOpen ?? true,
        latitude: sucursalToEdit.location?.latitude || -17.7833,
        longitude: sucursalToEdit.location?.longitude || -63.1667,
        city: sucursalToEdit.location?.city || 'Santa Cruz de la Sierra',
        parentId: sucursalToEdit.parentId?.toString() || sucursalToEdit.parent?.id?.toString() || '',
        schedules: []
      });
      // Cargar horarios reales desde el backend
      apiClient.get(`/gyms/${sucursalToEdit.id}/schedules`).then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setFormData(prev => ({
          ...prev,
          schedules: sortSchedules(data.map((s: GymScheduleDto) => ({
            dayOfWeek: s.dayOfWeek,
            opensAt: s.opensAt?.slice(0, 5) || '06:00',
            closesAt: s.closesAt?.slice(0, 5) || '22:00',
            isHoliday: s.isHoliday ?? false,
          })))
        }));
      }).catch(() => {});
    }
  }, [sucursalToEdit, isOpen]);

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
      const isDuplicate = existingGyms.some(
        g => g.name.trim().toLowerCase() === nameTrimmed.toLowerCase() &&
             g.id !== sucursalToEdit?.id
      );
      if (isDuplicate) newErrors.name = 'Ya existe una sucursal con este nombre';
    }

    const descTrimmed = formData.description.trim();
    if (descTrimmed.length > DESC_MAX_BRANCH) {
      newErrors.description = `La descripción no puede superar los ${DESC_MAX_BRANCH} caracteres`;
    } else if (descTrimmed && GIBBERISH_RE.test(descTrimmed)) {
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

  const inputCls2 = sharedInputCls;
  const labelCls2 = sharedLabelCls;

  return (
    <ModalOverlay onClose={onClose} isDirty={touched} onFormChange={() => setTouched(true)}>
      <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-gray-100 mb-4">
        {sucursalToEdit ? 'Editar Sucursal' : 'Nueva Sucursal'}
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col overflow-y-auto flex-1 min-h-0 pr-1">
          <div className="flex justify-between items-baseline mb-1 mt-3">
            <label className={labelCls2} style={{ marginTop: 0, marginBottom: 0 }}>Nombre de la Sucursal</label>
            <span className={`text-xs ${formData.name.length > NAME_MAX ? 'text-red-500' : formData.name.length > NAME_MAX * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
              {formData.name.length}/{NAME_MAX}
            </span>
          </div>
          <input
            type="text"
            className={`${sharedInputCls} ${errors.name ? '!border-red-500' : ''}`}
            value={formData.name}
            onChange={e => { setFormData({ ...formData, name: e.target.value }); setErrors(p => ({ ...p, name: '' })); }}
            placeholder="Ej. Sucursal Centro"
            maxLength={NAME_MAX}
          />
          {errors.name && <span className="text-red-500 text-xs mt-1 block">{errors.name}</span>}

          <div className="flex justify-between items-baseline mb-1 mt-3">
            <label className={labelCls2} style={{ marginTop: 0, marginBottom: 0 }}>Descripción (Opcional)</label>
            <span className={`text-xs ${formData.description.length > DESC_MAX_BRANCH ? 'text-red-500' : formData.description.length > DESC_MAX_BRANCH * 0.9 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
              {formData.description.length}/{DESC_MAX_BRANCH}
            </span>
          </div>
          <textarea
            className={`${inputCls2}${errors.description ? ' !border-red-500' : ''}`}
            value={formData.description}
            onChange={e => { setFormData({...formData, description: e.target.value}); setErrors(p => ({ ...p, description: '' })); }}
            placeholder="Ej. Gimnasio equipado con área de pesas libres..."
            style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
            maxLength={DESC_MAX_BRANCH}
          />
          {errors.description && <span className="text-red-500 text-xs mt-1 block">{errors.description}</span>}

          <label className={labelCls2}>Marca Principal</label>
          <select
            className={inputCls2}
            value={formData.parentId}
            onChange={e => setFormData({...formData, parentId: e.target.value})}
            required
          >
            <option value="">Selecciona una marca principal</option>
            {Object.entries(parentGyms).map(([id, name]) => (
              <option key={id} value={id}>{name as string}</option>
            ))}
          </select>

          <div className="flex justify-between items-center mt-3 mb-1">
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Dirección (Apunta en el mapa)</label>
            <button
              type="button"
              onClick={() => setShowMap(!showMap)}
              className="text-xs px-2.5 py-1 border border-sky-500/30 text-sky-500 dark:text-sky-400 rounded-md cursor-pointer bg-sky-500/10 hover:bg-sky-500/15 transition-all duration-200 inline-flex items-center gap-1.5"
            >
              <MapIcon size={12} />{showMap ? 'Ocultar Mapa' : 'Ver Mapa'}
            </button>
          </div>
          {showMap && (() => {
            const lat = typeof formData.latitude === 'number' && !isNaN(formData.latitude) ? formData.latitude : parseFloat(formData.latitude as any) || -17.7833;
            const lng = typeof formData.longitude === 'number' && !isNaN(formData.longitude) ? formData.longitude : parseFloat(formData.longitude as any) || -63.1667;
            return (
              <>
                <p className="text-xs text-sky-500 dark:text-sky-400 mb-2">
                  Desplázate y haz clic en el mapa para ubicar automáticamente la dirección y ciudad.
                </p>
                <div style={{ width: '100%', height: '220px', minHeight: '220px', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem', cursor: 'crosshair', flexShrink: 0, display: 'block' }}>
                  <MapContainer center={[lat, lng]} zoom={14} style={{ height: '100%', width: '100%', minHeight: '220px' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <LocationMarker
                      position={[lat, lng]}
                      setPosition={(pos: L.LatLng) => fetchAddress(pos)}
                    />
                    <LocateMeControl />
                  </MapContainer>
                </div>
              </>
            );
          })()}
          <input
            type="text"
            className={inputCls2}
            value={formData.address}
            onChange={e => setFormData({...formData, address: e.target.value})}
            placeholder="Ej. Av. Principal #123"
            required
          />

          <label className={labelCls2}>Ciudad</label>
          <input
            type="text"
            className={inputCls2}
            value={formData.city}
            onChange={e => setFormData({...formData, city: e.target.value})}
            placeholder="Ej. Santa Cruz de la Sierra"
          />

          <label className={labelCls2}>Capacidad Máxima</label>
          <input
            type="number"
            className={inputCls2}
            value={formData.maxCapacity}
            onChange={e => setFormData({...formData, maxCapacity: parseInt(e.target.value) || 0})}
            placeholder="Ej. 100"
            min="1"
            required
          />



          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              checked={formData.isOpen}
              onChange={e => setFormData({...formData, isOpen: e.target.checked})}
              className="w-[18px] h-[18px] cursor-pointer accent-sky-400"
            />
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300 cursor-pointer">Sucursal Abierta</label>
          </div>

          {/* SECCIÓN DE HORARIOS */}
          <div className={`mt-4 p-4 ${cardCls}`}>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mt-0 mb-4">Configuración de Horarios</h3>

            {formData.schedules && formData.schedules.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {formData.schedules.map((sch, i) => (
                  <div key={i} className={`flex justify-between items-center p-2 px-3 rounded-md bg-slate-50 dark:bg-white/[0.03] ${sch.isHoliday ? 'border border-red-500/30' : 'border border-transparent'}`}>
                    <span className="text-sm text-slate-700 dark:text-gray-300 flex items-center gap-2">
                      <strong className="text-sky-500 dark:text-sky-400">{sch.dayOfWeek}</strong>:
                      {sch.isHoliday ? (
                        <span className={pillCls('red')}>FERIADO / CERRADO</span>
                      ) : (
                        `${sch.opensAt} - ${sch.closesAt}`
                      )}
                    </span>
                    <button type="button" onClick={() => setFormData(prev => ({...prev, schedules: prev.schedules.filter((_, idx) => idx !== i)}))}
                      className="text-red-500 text-xs cursor-pointer bg-transparent border-0 px-1 hover:text-red-400 transition-colors duration-200">Quitar</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-gray-500 mb-2">Selecciona el Día</label>
                <div className="flex gap-1.5 flex-wrap">
                  {['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setNewSchedule({...newSchedule, dayOfWeek: d})}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-all duration-200 ${
                        newSchedule.dayOfWeek === d
                          ? 'border-sky-500/40 bg-sky-500/10 text-sky-500 dark:text-sky-400 font-semibold'
                          : 'border-slate-300 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:border-slate-400 dark:hover:border-white/25'
                      }`}
                    >
                      {d.substring(0,3)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-gray-500 mb-1">Apertura</label>
                  <TimeSelect value={newSchedule.opensAt} onChange={v => setNewSchedule({...newSchedule, opensAt: v})} disabled={newSchedule.isHoliday} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-gray-500 mb-1">Cierre</label>
                  <TimeSelect value={newSchedule.closesAt} onChange={v => setNewSchedule({...newSchedule, closesAt: v})} disabled={newSchedule.isHoliday} />
                </div>
              </div>
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setNewSchedule({...newSchedule, isHoliday: !newSchedule.isHoliday})}>
                  <input
                    type="checkbox"
                    checked={newSchedule.isHoliday}
                    onChange={e => setNewSchedule({...newSchedule, isHoliday: e.target.checked})}
                    onClick={e => e.stopPropagation()}
                    className="w-[18px] h-[18px] cursor-pointer accent-sky-400"
                  />
                  <label className="text-sm text-slate-700 dark:text-gray-300 cursor-pointer">Día Feriado / Cerrado</label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const opensAt  = newSchedule.isHoliday ? '00:00' : newSchedule.opensAt;
                    const closesAt = newSchedule.isHoliday ? '00:00' : newSchedule.closesAt;

                    // Detectar solapamiento con entradas del mismo día (permite contiguos)
                    const newStart = timeToMinutes(opensAt);
                    const newEnd   = timeToMinutes(closesAt);
                    const clash = (formData.schedules || []).find(
                      s => s.dayOfWeek === newSchedule.dayOfWeek &&
                           !s.isHoliday &&
                           newStart < timeToMinutes(s.closesAt) &&
                           newEnd   > timeToMinutes(s.opensAt)
                    );
                    if (clash) {
                      toast.error(
                        `Horario superpuesto en ${newSchedule.dayOfWeek}: ${opensAt}–${closesAt} choca con ${clash.opensAt}–${clash.closesAt}.`
                      );
                      return;
                    }

                    const schToAdd: ScheduleFormEntry = { ...newSchedule, opensAt, closesAt };
                    setFormData(prev => ({
                      ...prev,
                      schedules: sortSchedules([...(prev.schedules || []), schToAdd]),
                    }));
                    setNewSchedule(prev => ({ ...prev, isHoliday: false }));
                  }}
                  className="px-4 py-2 rounded-lg border-0 cursor-pointer text-sm font-semibold flex items-center gap-1 bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-500/15 transition-all duration-200"
                >
                  + Añadir
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <button type="button" onClick={() => guardClose(touched, onClose)} className={btnGhost}>
              Cancelar
            </button>
            <button type="submit" className={btnPrimary}>
              {sucursalToEdit ? 'Actualizar' : 'Crear'} Sucursal
            </button>
          </div>
        </form>
    </ModalOverlay>
  );
};

// --- VISTA DE SUCURSALES ---

export const SucursalesView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sucursalesData, isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['sucursales'],
    queryFn: async () => {
      const [gymsResp, brandsResp] = await Promise.all([
        apiClient.get('/gyms'),
        apiClient.get('/gyms/brands'),
      ]);
      const gymsArr: GymDto[]    = Array.isArray(gymsResp.data)   ? gymsResp.data   : [];
      const brandsArr: GymDto[]  = Array.isArray(brandsResp.data) ? brandsResp.data : [];
      const parentMap: Record<number, string> = {};
      brandsArr.forEach(g => { parentMap[g.id] = g.name; });
      return { gyms: gymsArr, parentGyms: parentMap };
    },
  });
  const gyms       = sucursalesData?.gyms       ?? [];
  const parentGyms = sucursalesData?.parentGyms ?? {};
  // Excluir estrictamente Marcas principales (parent_id === null) — solo sucursales hijas
  const branches   = useMemo(
    () => gyms.filter(g => (g.parentId ?? g.parent?.id ?? null) !== null),
    [gyms],
  );
  const error = fetchError
    ? ((fetchError as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (fetchError as Error).message
        || 'No se pudo cargar sucursales.')
    : null;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sucursalToEdit, setSucursalToEdit] = useState<GymDto | null>(null);
  const [viewingSucursal, setViewingSucursal] = useState<GymDto | null>(null);

  // ── Filtros ──
  const [search,        setSearch]        = useState('');
  const [filterParent,  setFilterParent]  = useState('');
  const [filterEstado,  setFilterEstado]  = useState<'all' | 'activa' | 'inactiva' | 'abierta' | 'cerrada'>('all');
  const [sortOrder,     setSortOrder]     = useState<'az' | 'za' | 'cap_asc' | 'cap_desc'>('az');

  // Opciones de marcas ordenadas A→Z
  const parentOptions = useMemo(() =>
    Object.entries(parentGyms)
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [parentGyms]
  );

  const filteredSucursales = useMemo(() => {
    const term = search.trim().toLowerCase();
    return branches
      .filter(g => {
        if (term && !g.name.toLowerCase().includes(term) && !(g.location?.address ?? g.description ?? '').toLowerCase().includes(term)) return false;
        if (filterParent && String(g.parentId ?? g.parent?.id ?? '') !== filterParent) return false;
        if (filterEstado === 'activa'   && !g.isActive)  return false;
        if (filterEstado === 'inactiva' &&  g.isActive)  return false;
        if (filterEstado === 'abierta'  && !g.isOpen)    return false;
        if (filterEstado === 'cerrada'  &&  g.isOpen)    return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'az') return a.name.localeCompare(b.name);
        if (sortOrder === 'za') return b.name.localeCompare(a.name);
        if (sortOrder === 'cap_asc')  return (a.maxCapacity ?? 0) - (b.maxCapacity ?? 0);
        return (b.maxCapacity ?? 0) - (a.maxCapacity ?? 0);
      });
  }, [branches, search, filterParent, filterEstado, sortOrder]);

  const hasFilters = search || filterParent || filterEstado !== 'all' || sortOrder !== 'az';
  const resetFilters = () => { setSearch(''); setFilterParent(''); setFilterEstado('all'); setSortOrder('az'); };


  const [deleteConfirmSucursal, setDeleteConfirmSucursal] = useState<GymDto | null>(null);

  const handleCreateSucursal = () => {
    setSucursalToEdit(null);
    setIsModalOpen(true);
  };

  const handleEditSucursal = (sucursal: GymDto) => {
    setSucursalToEdit(sucursal);
    setIsModalOpen(true);
  };

  const handleDeleteSucursal = (sucursal: GymDto) => {
    setDeleteConfirmSucursal(sucursal);
  };

  const confirmDeleteSucursal = async () => {
    if (!deleteConfirmSucursal) return;
    const nameToDelete = deleteConfirmSucursal.name;
    try {
      await apiClient.delete(`/gyms/${deleteConfirmSucursal.id}`);
      toast.success(`Sucursal "${nameToDelete}" eliminada`);
      await queryClient.invalidateQueries({ queryKey: ['sucursales'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e?.response?.data?.message || e?.message || 'Error al eliminar sucursal.');
    } finally {
      setDeleteConfirmSucursal(null);
    }
  };


  const handleSaveSucursal = async (formData: SucursalFormData) => {
    try {
      const payload: {
        name: string; description: string; maxCapacity: number; parentId: number | null;
        location: { address: string; city: string; latitude: number; longitude: number };
        schedules?: ScheduleFormEntry[];
      } = {
        name: formData.name,
        description: formData.description || formData.address,
        maxCapacity: Number(formData.maxCapacity) || 0,
        parentId: Number(formData.parentId) || null,
        location: {
          address: formData.address || '',
          city: formData.city || 'Santa Cruz de la Sierra',
          latitude: Number(formData.latitude) || 0,
          longitude: Number(formData.longitude) || 0,
        },
      };

      const schedulesPayload = (formData.schedules ?? []).map((sch) => ({
        dayOfWeek: sch.dayOfWeek,
        opensAt: sch.isHoliday ? '00:00' : sch.opensAt,
        closesAt: sch.isHoliday ? '00:00' : sch.closesAt,
        isHoliday: sch.isHoliday || false,
      }));

      if (sucursalToEdit) {
        // ── EDITAR: datos principales ────────────────────────────────────────
        await apiClient.put(`/gyms/${sucursalToEdit.id}`, {
          name: payload.name,
          description: payload.description,
          maxCapacity: payload.maxCapacity,
          parentId: payload.parentId,
        });

        // Ubicación (intenta PUT, fallback a POST)
        if (payload.location) {
          await apiClient.put(`/gyms/${sucursalToEdit.id}/location`, payload.location)
            .catch(async () => {
              await apiClient.post(`/gyms/${sucursalToEdit.id}/location`, payload.location).catch(() => {});
            });
        }

        // Sincronizar horarios (borrar todos y recrear)
        try {
          const existingRes = await apiClient.get(`/gyms/${sucursalToEdit.id}/schedules`);
          const existing: GymScheduleDto[] = Array.isArray(existingRes.data) ? existingRes.data : [];
          await Promise.allSettled(existing.map(s => apiClient.delete(`/gyms/schedules/${s.id}`)));
        } catch (err: unknown) {
          console.warn('[Sucursal] No se pudo limpiar horarios previos:', err);
        }

        if (schedulesPayload.length > 0) {
          await Promise.allSettled(
            schedulesPayload.map((sch) =>
              apiClient.post(`/gyms/${sucursalToEdit.id}/schedules`, sch)
            )
          );
        }

        // Re-fetch completo para reflejar parentId + parent.name correctamente
        await queryClient.invalidateQueries({ queryKey: ['sucursales'] });
        toast.success(`Sucursal "${payload.name}" actualizada correctamente`);

      } else {
        // ── CREAR SUCURSAL ────────────────────────────────────────────────────
        if (schedulesPayload.length > 0) payload.schedules = schedulesPayload;
        await apiClient.post('/gyms', payload);

        // Re-fetch para obtener el ID real del servidor y el parent completo
        await queryClient.invalidateQueries({ queryKey: ['sucursales'] });
        toast.success(`Sucursal "${payload.name}" creada correctamente`);
      }

      setIsModalOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message?: string };
      console.error('[Sucursal] Error:', e?.response?.data || e?.message);
      // El interceptor de apiClient ya muestra el toast de error — no duplicar.
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section style={panelStyle} className="glass-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Gestión de Sucursales</h1>
          <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">
            {(user?.level ?? 0) >= 10
              ? 'Administra las sucursales vinculadas a cada marca principal. Cada sucursal pertenece a una marca principal.'
              : `Acceso restringido a tus sucursales (gym_id: ${user.gymId || 'N/A'}).`}
          </p>
        </div>
        {(user?.level ?? 0) >= 10 && (
          <button onClick={handleCreateSucursal} className={`${btnPrimary} whitespace-nowrap`}>
            Nueva Sucursal
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-gray-500 mt-4 mb-1">
        {loading ? 'Cargando sucursales...' : `Total de sucursales: ${branches.length}`}
      </p>
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}

      {/* ── Barra de filtros ── */}
      {!loading && !error && branches.length > 0 && (
        <div className={`${cardCls} p-4 mt-4 mb-5 flex flex-col md:flex-row flex-wrap gap-3 items-center`}>
          <div className="relative flex-1" style={{ minWidth: '200px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o dirección..."
              aria-label="Buscar por nombre o dirección"
              className={`${sharedInputCls} pl-9`}
            />
          </div>
          {/* Marca principal */}
          {parentOptions.length > 0 && (
            <div className="relative" style={{ maxWidth: '175px' }}>
              <select value={filterParent} onChange={e => setFilterParent(e.target.value)}
                aria-label="Filtrar por marca principal"
                className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
                <option value="">Todas las marcas</option>
                {parentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
            </div>
          )}
          {/* Estado */}
          <div className="relative">
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as 'all' | 'activa' | 'inactiva' | 'abierta' | 'cerrada')}
              aria-label="Filtrar por estado"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="all"     >Todos los estados</option>
              <option value="activa"  >Solo Activas</option>
              <option value="inactiva">Solo Inactivas</option>
              <option value="abierta" >Solo Abiertas</option>
              <option value="cerrada" >Solo Cerradas</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {/* Orden */}
          <div className="relative">
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'az' | 'za' | 'cap_asc' | 'cap_desc')}
              aria-label="Ordenar"
              className={`${sharedInputCls} pr-8 cursor-pointer appearance-none`}>
              <option value="az"      >Nombre A → Z</option>
              <option value="za"      >Nombre Z → A</option>
              <option value="cap_asc" >Capacidad ↑</option>
              <option value="cap_desc">Capacidad ↓</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-gray-500" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className={`${btnGhost} inline-flex items-center gap-1.5`}>
              <X size={12} />Limpiar
            </button>
          )}
        </div>
      )}
      {!loading && !error && branches.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-gray-500 mb-2">
          {filteredSucursales.length === branches.length ? `${branches.length} sucursales` : `${filteredSucursales.length} de ${branches.length} sucursales`}
        </div>
      )}

      {!loading && !error && filteredSucursales.length === 0 && (
        <div className={`${cardCls} mt-4`}>
          <EmptyState
            icon={Building2}
            title={branches.length === 0 ? 'No hay sucursales registradas' : 'Sin resultados para los filtros aplicados'}
            description={branches.length === 0
              ? 'Crea la primera sucursal con el botón de arriba.'
              : 'Prueba a ajustar o limpiar los filtros de búsqueda.'}
            action={hasFilters && branches.length > 0 && (
              <button onClick={resetFilters} className={btnGhost}>Limpiar filtros</button>
            )}
          />
        </div>
      )}

      {!loading && !error && filteredSucursales.length > 0 && (
        <div className={`overflow-hidden mt-4 ${cardCls}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: '960px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} text-left`}>ID</th>
                <th className={`${thCls} text-left`}>Sucursal</th>
                <th className={`${thCls} text-left`}>Marca Principal</th>
                <th className={`${thCls} text-left`}>Dirección</th>
                <th className={`${thCls} text-left`}>Capacidad</th>
                <th className={`${thCls} text-left`}>Estado</th>
                <th className={`${thCls} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSucursales.map((g) => (
                <tr key={g.id} className={trCls}>
                  <td className={`${tdCls} text-slate-500 dark:text-gray-500`}>{g.id}</td>
                  <td className={`${tdCls} font-semibold text-slate-900 dark:text-gray-100`}>{g.name}</td>
                  <td className={tdCls}>
                    <span className={pillCls('sky')}>
                      {g.parent?.name || (g.parentId ? parentGyms[g.parentId] : 'Sin Marca')}
                    </span>
                  </td>
                  <td className={`${tdCls} truncate`} title={g.location?.address || g.description || undefined}>
                    {g.location?.address || g.description || '-'}
                  </td>
                  <td className={tdCls}>{g.maxCapacity ?? '-'}</td>
                  <td className={tdCls}>
                    <div className="flex flex-col gap-1">
                      <span className={pillCls(g.isActive ? 'green' : 'red')}>
                        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${g.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                        {g.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                      <span className={pillCls(g.isOpen ? 'sky' : 'gray')}>
                        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${g.isOpen ? 'bg-sky-400' : 'bg-gray-400'}`} />
                        {g.isOpen ? 'Abierta' : 'Cerrada'}
                      </span>
                    </div>
                  </td>
                  <td className={`${tdCls} text-center`}>
                    <div className="flex gap-1.5 justify-center items-center">
                      <button
                        onClick={async () => {
                          try {
                            const res = await apiClient.get(`/gyms/${g.id}/schedules`);
                            setViewingSucursal({ ...g, schedules: Array.isArray(res.data) ? res.data : [] });
                          } catch {
                            setViewingSucursal(g);
                          }
                        }}
                        title="Ver detalles de la sucursal"
                        className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                      >
                        <Eye size={15} />
                      </button>
                      {(user?.level ?? 0) >= 10 && (
                        <>
                          <button
                            onClick={() => handleEditSucursal(g)}
                            title="Editar sucursal"
                            className={`${iconBtnCls} text-sky-400 hover:bg-sky-500/15 bg-sky-500/10`}
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteSucursal(g)}
                            title="Eliminar sucursal"
                            className={`${iconBtnCls} text-slate-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}


      <SucursalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        level={user.level ?? 0}
        sucursalToEdit={sucursalToEdit}
        onSave={handleSaveSucursal}
        parentGyms={parentGyms}
        existingGyms={gyms}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmSucursal}
        onClose={() => setDeleteConfirmSucursal(null)}
        onConfirm={confirmDeleteSucursal}
        title="Confirmar Eliminación"
        message={`¿Estás seguro de querer eliminar la sucursal "${deleteConfirmSucursal?.name}"? Esta acción no se puede deshacer y borrará los registros asociados permanentemente.`}
      />

      <RecordDetailModal
        isOpen={!!viewingSucursal}
        onClose={() => setViewingSucursal(null)}
        title="Detalle de la Sucursal"
      >
        <DetailField label="ID de Registro" value={viewingSucursal?.id} />
        <DetailField label="Nombre de Sucursal" value={viewingSucursal?.name} />
        
        <DetailField 
          label="Marca Principal"
          value={viewingSucursal?.parent?.name || (viewingSucursal?.parentId ? parentGyms[viewingSucursal.parentId] : 'Sin Marca Vinculada')}
        />
        <DetailField 
          label="Capacidad Máxima" 
          value={`${viewingSucursal?.maxCapacity || '0'} personas`} 
        />

        <DetailField label="Dirección Física" value={viewingSucursal?.location?.address || viewingSucursal?.description} isFullWidth />
        
        <DetailField label="Ciudad" value={viewingSucursal?.location?.city || 'Santa Cruz de la Sierra'} />
        <DetailField 
          label="Coordenadas Geográficas" 
          value={
            viewingSucursal?.location?.latitude
              ? `${viewingSucursal.location.latitude}, ${viewingSucursal.location.longitude}`
              : 'Sin coordenadas'
          } 
        />

        <DetailField
          label="Estado Administrativo"
          value={<span className={pillCls(viewingSucursal?.isActive ? 'green' : 'red')}>{viewingSucursal?.isActive ? 'ACTIVA' : 'INACTIVA'}</span>}
        />
        <DetailField
          label="Estado de Puertas"
          value={<span className={pillCls(viewingSucursal?.isOpen ? 'sky' : 'gray')}>{viewingSucursal?.isOpen ? 'ABIERTA AL PÚBLICO' : 'CERRADA'}</span>}
        />

        <DetailField
          label="Aforo en Vivo"
          value={(() => {
            const occ = viewingSucursal?.currentOccupancy ?? viewingSucursal?.aforoActual ?? 0;
            const max = viewingSucursal?.maxCapacity ?? 0;
            const pct = max > 0 ? Math.round((occ / max) * 100) : 0;
            const tone = pct >= 80 ? 'text-brand-orange' : pct >= 50 ? 'text-sky-500 dark:text-sky-400' : 'text-green-500 dark:text-green-400';
            return (
              <span className={`font-bold ${tone}`}>
                {occ} / {max} ({pct}%)
              </span>
            );
          })()}
        />

        <div className="flex flex-col gap-2 col-span-2 mt-2 bg-slate-50 dark:bg-white/[0.03] p-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
          <span className="text-xs text-slate-500 dark:text-gray-500 font-semibold uppercase tracking-wide">Horarios de Atención</span>
          <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {viewingSucursal?.schedules && viewingSucursal.schedules.length > 0 ? (
              sortSchedules(viewingSucursal.schedules as ScheduleFormEntry[]).map((sch, i) => (
                <div key={i} className={`p-2 rounded-md bg-white dark:bg-bg-deep/60 border ${sch.isHoliday ? 'border-brand-orange/40' : 'border-slate-200 dark:border-white/[0.06]'}`}>
                  <div className="text-sky-500 dark:text-sky-400 font-semibold text-xs">{sch.dayOfWeek}</div>
                  <div className={`text-sm font-mono mt-0.5 ${sch.isHoliday ? 'text-brand-orange' : 'text-slate-900 dark:text-gray-100'}`}>
                    {sch.isHoliday ? 'FERIADO' : `${sch.opensAt?.slice(0,5)} - ${sch.closesAt?.slice(0,5)}`}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400 dark:text-gray-500 italic col-span-2">No hay horarios registrados para esta sucursal.</div>
            )}
          </div>
        </div>
      </RecordDetailModal>
    </section>
  );
};

// --- MODULO DE RUTINAS ---
