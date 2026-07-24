import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * CONTRATO DE SEGURIDAD: level, gymId y brandId de RequestUser NO provienen del
 * payload del JWT. JwtStrategy.validate() los re-resuelve desde la tabla
 * user_roles en cada request. Cualquier cambio a ese contrato reabre la fuga
 * de jurisdicción por tokens obsoletos (reasignación de sede no reflejada).
 */
export type RequestUser = {
  userId: string | number;
  email: string;
  role?: string | null;
  gymId?: number | null;
  brandId?: number | null;
  level?: number;
};

export type RequestWithUser = Request & { user?: RequestUser };

/** Level 4+ (recepcionista, gerente, etc.): devuelve gymId o brandId para filtrar. Level 10+ o nivel bajo → null (sin filtro). */
export function getManagerGymId(req: RequestWithUser): number | null {
  const user = req.user;
  if (!user) return null;
  const level = user.level ?? 0;
  if (level >= 10) return null;
  if (level < 4) return null;
  if (user.gymId !== null && user.gymId !== undefined)
    return Number(user.gymId);
  if (user.brandId !== null && user.brandId !== undefined)
    return Number(user.brandId);
  throw new ForbiddenException('El usuario no tiene un gimnasio asignado');
}

/** Level 3+ staff con sede: devuelve gymId/brandId. Level 10+ o level < 3 → null (sin filtro). */
export function getStaffGymId(req: RequestWithUser): number | null {
  const user = req.user;
  if (!user) return null;
  const level = user.level ?? 0;
  if (level >= 10) return null;
  if (level < 3) return null;
  if (user.gymId !== null && user.gymId !== undefined)
    return Number(user.gymId);
  if (user.brandId !== null && user.brandId !== undefined)
    return Number(user.brandId);
  return null;
}

export function ensureManagerMatchesResourceGym(
  managerGymId: number | null,
  resourceGymId: number | null | undefined,
): void {
  if (managerGymId === null) return;
  if (resourceGymId === null || resourceGymId === undefined) {
    throw new ForbiddenException(
      'No tiene permisos para acceder a este recurso',
    );
  }
  if (Number(resourceGymId) !== managerGymId) {
    throw new ForbiddenException(
      'No tiene permisos para acceder a otra sucursal',
    );
  }
}
