import { create } from 'zustand';
import { Sede } from '@gymsync/core';
import { Coordenadas } from '@gymsync/core';
import { SedeConDistancia, ObtenerSedesCercanasUseCase } from '@gymsync/core';
import { CalcularRutaUseCase } from '@gymsync/core';
import { FiltrarSedesUseCase } from '@gymsync/core';
import { useFilterStore } from '../../../../app/Providers/geolocation/stores/FilterStore';

interface MapScreenState {
  // Estado
  userLocation: Coordenadas | null;
  sedesConDistancia: SedeConDistancia[];
  selectedSede: Sede | null;
  loading: boolean;
  error: string | null;
  radioKm: number;
  isListView: boolean;
  // Acciones
  setUserLocation: (location: Coordenadas) => void;
  setSedesConDistancia: (sedes: SedeConDistancia[]) => void;
  seleccionarSede: (sede: Sede) => void;
  cerrarModalSede: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setRadioKm: (radio: number) => void;
  toggleListView: () => void;
  reset: () => void;
}

export const useMapScreenStore = create<MapScreenState>((set) => ({
  // Estado inicial
  userLocation: null,
  sedesConDistancia: [],
  selectedSede: null,
  loading: false,
  error: null,
  radioKm: 10,
  isListView: false,

  // Acciones
  setUserLocation: (location) => set({ userLocation: location }),
  setSedesConDistancia: (sedes) => set({ sedesConDistancia: sedes }),
  seleccionarSede: (sede) => set({ selectedSede: sede }),
  cerrarModalSede: () => set({ selectedSede: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setRadioKm: (radio) => set({ radioKm: radio }),
  toggleListView: () => set((state) => ({ isListView: !state.isListView })),
  reset: () => set({
    userLocation: null,
    sedesConDistancia: [],
    selectedSede: null,
    loading: false,
    error: null,
    isListView: false,
  }),
}));

/**
 * Hook que conecta el store con los casos de uso.
 */
export const MapScreenController = (
  obtenerSedesUseCase: ObtenerSedesCercanasUseCase,
  calcularRutaUseCase: CalcularRutaUseCase,
  filtrarSedesUseCase: FiltrarSedesUseCase,
) => {
  const store = useMapScreenStore();

  const cargarSedesCercanas = async () => {
    store.setLoading(true);
    store.setError(null);

    try {
      const result = await obtenerSedesUseCase.execute({
        radioKm: store.radioKm,
      });

      if (result.isRight()) {
        const { sedes, ubicacion } = result.value;
        store.setSedesConDistancia(sedes);
        store.setUserLocation(ubicacion);
      } else {
        store.setError(result.value.mensajeUsuario ?? result.value.message);
      }
    } catch (err) {
      store.setError('Error de conexión al buscar sucursales cercanas.');
    } finally {
      store.setLoading(false);
    }
  };

  const comoLlegar = async (sede: Sede) => {
    try {
      await calcularRutaUseCase.execute(store.userLocation, sede);
    } catch (err) {
      console.warn('Error al abrir navegación:', (err as Error)?.message);
    }
  };

  const reintentarCarga = () => {
    cargarSedesCercanas();
  };

  const { filtros } = useFilterStore();

  // Computado: Sedes destiladas a traves de los filtros
  const sedesObj = store.sedesConDistancia.map(s => s.sede);
  const sedesFiltradasObj = filtrarSedesUseCase.execute(sedesObj, filtros);
  const sedesFiltradas = store.sedesConDistancia.filter(s => 
    sedesFiltradasObj.some((filtrada: Sede) => filtrada.id.value === s.sede.id.value)
  );

  return {
    ...store,
    sedesFiltradas,
    cargarSedesCercanas,
    comoLlegar,
    reintentarCarga,
  };
};
