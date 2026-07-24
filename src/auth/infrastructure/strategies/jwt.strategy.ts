import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { UserRole } from '../../../roles/domain/user-role.entity';
import { User } from '../../../users/domain/user.entity';

export interface JwtPayload {
  sub: number;
  email: string;
  role?: string | null;
  gymId?: number | null;
  brandId?: number | null;
  level?: number;
}

const cookieExtractor = (req: Request): string | null => {
  try {
    return req?.cookies?.access_token ?? null;
  } catch {
    return null;
  }
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    // Verificar que el usuario aún existe y está activo en la BD.
    // Esto invalida JWTs de cuentas eliminadas o desactivadas antes de que expiren.
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'isActive'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Esta cuenta ya no está disponible.');
    }

    // El JWT solo transporta identidad (sub/email). level, gymId y brandId se
    // re-resuelven desde user_roles en CADA request: una reasignación de sede o
    // cambio de rol surte efecto de inmediato, sin esperar a que expire el token.
    const assignments = await this.userRolesRepo.find({
      where: { userId: payload.sub },
      relations: ['role', 'gym'],
    });

    const sorted = [...assignments].sort(
      (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
    );
    const top = sorted[0];
    const level = top?.role?.hierarchyLevel ?? 0;
    const roleName = top?.role?.name ?? payload.role ?? null;

    let gymId: number | null = null;
    let brandId: number | null = null;

    if (level >= 10) {
      // Super Admin: territorio global, sin filtro.
    } else if (level === 5) {
      // Gerente: brandId si su asignación es un gym raíz (marca), gymId si es sucursal.
      const gerenteRoles = sorted.filter((a) => a.role?.hierarchyLevel === 5);
      const assignment =
        gerenteRoles.find((a) => a.gymId !== null && a.gymId !== undefined) ??
        gerenteRoles[0];
      const resolvedGymId = assignment?.gymId ?? null;
      if (resolvedGymId !== null && resolvedGymId !== undefined) {
        if (assignment?.gym && assignment.gym.parentId === null) {
          brandId = Number(resolvedGymId);
        } else {
          gymId = Number(resolvedGymId);
        }
      }
    } else {
      gymId = top?.gymId !== null && top?.gymId !== undefined ? Number(top.gymId) : null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: roleName,
      gymId,
      brandId,
      level,
    };
  }
}
