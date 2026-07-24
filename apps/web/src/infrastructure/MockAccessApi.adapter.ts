import type { 
  IAccessApiService, 
  AccesoQueryParams,
  Either
} from '@gymsync/core';
import { 
  Acceso,
  MetodoAcceso, 
  TipoMetodoAcceso,
  EstadoAcceso, 
  TipoEstadoAcceso,
  Identifier,
  right 
} from '@gymsync/core';

// Datos Mock (Simulando tablas de DB: gyms, user_profiles)
const GYMS_DB = [
  { id: 'g1', nombre: 'Smart Fit', direccion: 'Av. Banzer 4to Anillo', lat: -17.75, lng: -63.17 },
  { id: 'g2', nombre: 'Premier', direccion: 'Equipetrol Norte', lat: -17.76, lng: -63.18 },
  { id: 'g3', nombre: 'Bio Fitness', direccion: 'Doble Vía a La Guardia', lat: -17.80, lng: -63.19 },
  { id: 'g4', nombre: 'Reyes Gym', direccion: 'Plan 3000', lat: -17.81, lng: -63.15 },
  { id: 'g5', nombre: 'Megatlon', direccion: 'Av. Cristo Redentor', lat: -17.73, lng: -63.16 },
  { id: 'g6', nombre: 'Bodytech', direccion: 'Urubó', lat: -17.74, lng: -63.20 },
  { id: 'g7', nombre: 'Energy Club', direccion: 'Av. Busch', lat: -17.77, lng: -63.19 },
  { id: 'g8', nombre: 'Fitness 24/7', direccion: 'Av. Santos Dumont', lat: -17.82, lng: -63.18 },
  { id: 'g9', nombre: 'Iron Gym', direccion: 'Villa 1ro de Mayo', lat: -17.79, lng: -63.14 },
  { id: 'g10', nombre: 'Power Club', direccion: 'Av. Piraí', lat: -17.78, lng: -63.20 }
];

const USERS_DB = [
  { id: 'u1', nombre: 'Ana García', email: 'ana@ejemplo.com', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
  { id: 'u2', nombre: 'Carlos Ruiz', email: 'carlos@ejemplo.com', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
  { id: 'u3', nombre: 'Maria Silva', email: 'maria@ejemplo.com', avatar: 'https://i.pravatar.cc/150?u=a048581f4e29026701d' },
  { id: 'u4', nombre: 'Juan Pérez', email: 'juan@ejemplo.com', avatar: 'https://i.pravatar.cc/150?u=a04258114e29026702d' },
  { id: 'u5', nombre: 'Lucia López', email: 'lucia@ejemplo.com', avatar: 'https://i.pravatar.cc/150?u=a04258114e29026302d' }
];

export class MockAccessApiAdapter implements IAccessApiService {
  private checkInsTableMock: Acceso[] = [];

  constructor() {
    this.generarMockData();
  }

  private generarMockData() {
    for (let i = 0; i < 200; i++) {
      const isAuthorized = Math.random() > 0.2; // 80% autorizados
      const user = USERS_DB[Math.floor(Math.random() * USERS_DB.length)];
      const gym = GYMS_DB[Math.floor(Math.random() * GYMS_DB.length)];

      this.checkInsTableMock.push(new Acceso(
        Identifier.create(`chk-${i}`),
        Identifier.create(user.id),
        Identifier.create(gym.id),
        new Date(Date.now() - Math.floor(Math.random() * 86400000 * 7)), // Últimos 7 días
        new MetodoAcceso(Math.random() > 0.7 ? TipoMetodoAcceso.QR : (Math.random() > 0.5 ? TipoMetodoAcceso.BIOMETRIA : TipoMetodoAcceso.PIN)),
        new EstadoAcceso(
          isAuthorized ? TipoEstadoAcceso.AUTORIZADO : TipoEstadoAcceso.DENEGADO,
          isAuthorized ? undefined : 'Membresía caducada o sucursal incorrecta'
        ),
        { nombre: user.nombre, email: user.email, avatarUrl: user.avatar },
        { nombre: gym.nombre, direccion: gym.direccion, coordenadas: { lat: gym.lat, lng: gym.lng } }
      ));
    }
    // Ordenar descendente por check_in_time
    this.checkInsTableMock.sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
  }

  async obtenerHistorialAccesos(params: AccesoQueryParams): Promise<Either<Error, { data: Acceso[], total: number }>> {
    let filtrados = this.checkInsTableMock;

    // Filtro por Gym (obligatorio si es GERENTE según caso de uso)
    if (params.gymId) {
      filtrados = filtrados.filter(a => a.gymId.value === params.gymId);
    }
    
    // Filtro por Estado
    if (params.estado) {
      filtrados = filtrados.filter(a => a.status.estado === params.estado);
    }

    const total = filtrados.length;
    
    // Paginación
    const limit = params.limit || 20;
    const page = params.page || 1;
    const startIndex = (page - 1) * limit;
    
    filtrados = filtrados.slice(startIndex, startIndex + limit);

    return right({ data: filtrados, total });
  }
}
