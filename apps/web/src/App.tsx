import React, { useEffect, useState } from 'react';
import { WebGeolocationAdapter } from './infrastructure/WebGeolocation.adapter';
import { ObtenerSedesCercanasUseCase, Sede, Coordenadas, Aforo, HorariosSede, Identifier, right } from '@gymsync/core';
import type { ISedesApiService, Either } from '@gymsync/core';
import { PerfilManager } from './components/PerfilManager/PerfilManager';
import { AuditoriaView } from './components/Auditoria/AuditoriaView';
import { ReservasView } from './components/Reservas/ReservasView';
import './App.css';

type ActiveTab = 'SEDES' | 'PERFIL' | 'AUDITORIA' | 'RESERVAS';

// Mock de Sedes inyectado puramente para la demo Visual de la Web
class WebMockSedesApi implements ISedesApiService {
  async obtenerSedes(): Promise<Either<Error, Sede[]>> {
    const sedes = [
      Sede.create({
        id: Identifier.create('web-1'),
        nombre: 'GymSync Web HQ',
        direccion: 'Av. Silicon Valley, Cyberspace',
        coordenadas: Coordenadas.create({ latitude: -17.76, longitude: -63.19 }),
        aforo: Aforo.create({ maximo: 200, actual: 40 }),
        horarios: HorariosSede.create({ lunes: { apertura: '05:00', cierre: '23:00' } }),
        servicios: ['Musculación', 'Spinning'],
        beneficios: ['WiFi 6', 'Sauna'],
        telefono: '777-1234'
      }),
      Sede.create({
        id: Identifier.create('web-2'),
        nombre: 'Iron Forge (Browser)',
        direccion: '127.0.0.1 Localhost',
        coordenadas: Coordenadas.create({ latitude: -17.80, longitude: -63.18 }),
        aforo: Aforo.create({ maximo: 50, actual: 48 }),
        horarios: HorariosSede.create({ lunes: { apertura: '06:00', cierre: '22:00' } }),
        servicios: ['Crossfit'],
        beneficios: ['Duchas'],
        telefono: '777-0000'
      })
    ];
    return right(sedes);
  }
  async obtenerSedePorId(): Promise<Either<Error, Sede>> {
    throw new Error('No implementado');
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('SEDES');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sedes, setSedes] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<any>(null);

  useEffect(() => {
    async function init() {
      try {
        const geoAdapter = new WebGeolocationAdapter();
        const apiAdapter = new WebMockSedesApi();
        const useCase = new ObtenerSedesCercanasUseCase(geoAdapter, apiAdapter);

        await geoAdapter.solicitarPermiso();
        const locationResult = await geoAdapter.obtenerUbicacionActual();
        if (locationResult.isRight()) {
          setUserLocation(locationResult.value);
        }

        // Core invocado:
        const result = await useCase.execute({ radioKm: 50 });
        if (result.isRight()) {
          setSedes(result.value);
        } else {
          setError('No pudimos calcular las sucursales cercanas');
        }
      } catch (err: any) {
        setError(err.message || 'Error inicializando Geolocation');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  return (
    <div className="gymsync-web-container">
      <header className="web-header">
        <h1>GymSync <span>Web Terminal</span></h1>
        <p>Monorepo híbrido consumiendo lógica Core en React DOM</p>
      </header>

      <nav className="web-nav">
        <button
          className={`nav-tab ${activeTab === 'SEDES' ? 'active' : ''}`}
          onClick={() => setActiveTab('SEDES')}
        >
          Sucursales Cercanas
        </button>
        <button
          className={`nav-tab ${activeTab === 'PERFIL' ? 'active' : ''}`}
          onClick={() => setActiveTab('PERFIL')}
        >
          👤 Gestor de Perfiles
        </button>
        <button
          className={`nav-tab ${activeTab === 'AUDITORIA' ? 'active' : ''}`}
          onClick={() => setActiveTab('AUDITORIA')}
        >
          🛡️ Auditoría
        </button>
        <button
          className={`nav-tab ${activeTab === 'RESERVAS' ? 'active' : ''}`}
          onClick={() => setActiveTab('RESERVAS')}
        >
          📅 Reservas
        </button>
      </nav>

      <main className="web-main">
        {activeTab === 'AUDITORIA' ? (
          <AuditoriaView />
        ) : activeTab === 'RESERVAS' ? (
          <ReservasView />
        ) : activeTab === 'PERFIL' ? (
          <PerfilManager />
        ) : (
          <>
            {loading && <div className="loader">Sincronizando coordenadas globales...</div>}
            {error && <div className="error-box">🚨 {error}</div>}

            {!loading && !error && userLocation && (
              <>
                <div className="status-badge">📍 Coordenadas de red detectadas: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}</div>
                <div className="catalog-grid">
                  {sedes.map(({ sede, distancia }) => (
                    <div key={sede.id.value} className="sede-card">
                      <div className="card-header">
                        <h2>{sede.nombre}</h2>
                        <span className={`aforo-badge ${sede.aforo.porcentajeOcupacion > 80 ? 'high' : 'normal'}`}>
                          {sede.aforo.porcentajeOcupacion}% Ocupado
                        </span>
                      </div>
                      <p className="address">{sede.direccion}</p>
                      <div className="distance">
                        🚀 A tan solo <strong>{distancia.formateada}</strong> de tu ubicación
                      </div>
                      <div className="services">
                        {sede.servicios.map((s: string) => <span key={s} className="tag">{s}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
