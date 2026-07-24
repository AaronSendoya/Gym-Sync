import type { IAccessApiService, AccesoQueryParams, Either } from '@gymsync/core';
import { Acceso, MetodoAcceso, TipoMetodoAcceso, EstadoAcceso, TipoEstadoAcceso, Identifier, left, right } from '@gymsync/core';
import { apiClient } from './api.config';

export class AxiosAccessApiAdapter implements IAccessApiService {
  
  async obtenerHistorialAccesos(params: AccesoQueryParams): Promise<Either<Error, { data: Acceso[], total: number }>> {
    try {
      const secureParams: Record<string, string | number> = {};
      if (typeof params.page === 'number') secureParams.page = params.page;
      if (typeof params.limit === 'number') secureParams.limit = params.limit;
      if (params.estado) secureParams.estado = params.estado;
      if (params.gymId) {
        secureParams.gym_id = params.gymId;
      }

      // Endpoint real detectado en backend: /api/checkins.
      // Se conserva fallback a /api/check-ins por compatibilidad de despliegues.
      let response;
      try {
        response = await apiClient.get('/checkins', { params: secureParams });
      } catch (error: any) {
        if (error?.response?.status !== 404) throw error;
        response = await apiClient.get('/check-ins', { params: secureParams });
      }
      
      const payload = response.data;
      const rawData = Array.isArray(payload) ? payload : (payload?.data || []);
      const total = payload?.total || rawData.length;

      // Transformación de DTOs JSON a Entidades de Dominio
      const accesos = rawData.map((item: any) => {
        const estadoDominio: TipoEstadoAcceso =
          item.status === 'DENIED' || item.status === 'DENEGADO'
            ? TipoEstadoAcceso.DENEGADO
            : TipoEstadoAcceso.AUTORIZADO;

        return new Acceso(
          Identifier.create(item.id),
          Identifier.create(item.userId),
          Identifier.create(item.gymId),
          new Date(item.checkInTime),
          new MetodoAcceso(TipoMetodoAcceso.QR), // Forzado a QR-Only según requerimiento de seguridad
          new EstadoAcceso(
            estadoDominio,
            estadoDominio === TipoEstadoAcceso.DENEGADO ? (item.rejectionReason || 'Acceso denegado por politica de validacion') : undefined
          ),
          {
            nombre: item.userProfile?.fullName || item.user?.email || `Usuario #${item.userId}`,
            email: item.userProfile?.email || item.user?.email || 'N/A',
            rol: item.userProfile?.role || item.user?.role || item.userRoles?.[0]?.role?.name || item.role || undefined,
          },
          {
            nombre: item.gym?.name || 'Sucursal Desconocida',
            direccion: item.gym?.address || item.gym?.description || 'N/A',
            coordenadas: {
              lat: item.gym?.latitude || 0,
              lng: item.gym?.longitude || 0
            }
          },
          item.actionType ?? null,
        );
      });

      return right({ data: accesos, total });

    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401) return left(new Error('ACCESO_DENEGADO: Sesión expirada o token inválido (401).'));
        if (status === 404) return left(new Error('NO_ENCONTRADO: Endpoint de check-ins no encontrado en el servidor (404).'));
        if (status >= 500) return left(new Error('ERROR_SERVIDOR: El servidor NestJS falló al procesar la solicitud (500).'));
      }
      return left(new Error(`ERROR_RED: No se pudo contactar con NestJS en http://localhost:3000. Detalles: ${error.message}`));
    }
  }
}
