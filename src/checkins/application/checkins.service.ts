import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, IsNull, In } from 'typeorm';
import { CheckIn } from '../domain/check-in.entity';
import { UserRole } from '../../roles/domain/user-role.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { Reservation } from '../../reservations/domain/reservation.entity';
import { GymGateway } from '../../notifications/infrastructure/gym.gateway';
import {
  type RequestWithUser,
} from '../../common/security/gym-scope';


@Injectable({ scope: Scope.REQUEST })
export class CheckinsService {
  constructor(
    @InjectRepository(CheckIn) private repo: Repository<CheckIn>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    @InjectRepository(Reservation) private reservationRepo: Repository<Reservation>,
    @Inject(REQUEST) private readonly request: RequestWithUser,
    @Optional() private readonly gymGateway?: GymGateway,
  ) {}

  private applyStaffOnlyFilter(qb: SelectQueryBuilder<CheckIn>): void {
    qb.andWhere("checkIn.status != 'COMPLETED'");
  }

  private async applyScopeFilter(qb: SelectQueryBuilder<CheckIn>): Promise<void> {
    const user = this.request.user;
    const level = user?.level ?? 0;

    if (level >= 10) return;

    if (level < 4) {
      if (user?.userId) {
        qb.andWhere('checkIn.user_id = :userId', { userId: user.userId });
      }
      return;
    }

    // level 4 or 5 — resolve gymId from DB (JWT may be stale)
    const callerRoles = await this.userRoleRepo.find({
      where: { userId: Number(user!.userId) },
      relations: ['role', 'gym'],
    });
    const topRole = callerRoles.sort(
      (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
    )[0];
    const callerLevel = Number(topRole?.role?.hierarchyLevel ?? level);
    const callerGymId = Number(topRole?.gym?.id ?? topRole?.gymId ?? 0);

    if (!callerGymId) {
      throw new ForbiddenException('No tienes una sucursal o marca asignada.');
    }

    if (callerLevel === 5) {
      qb.andWhere(
        '(checkIn.gym_id = :callerGymId OR gym.parent_id = :callerGymId)',
        { callerGymId },
      );
    } else {
      qb.andWhere('checkIn.gym_id = :callerGymId', { callerGymId });
    }
  }

  async createCheckIn(userId: number, gymId: number, method = 'MANUAL') {
    const assignments = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });

    const topLevel = assignments.reduce(
      (max, a) => Math.max(max, a.role?.hierarchyLevel ?? 0),
      0,
    );
    const isClient = topLevel <= 1;
    const isEligibleStaff = assignments.some((a) => {
      const lvl = a.role?.hierarchyLevel ?? 0;
      return lvl >= 2 && lvl <= 4;
    });

    if (!isClient && !isEligibleStaff) {
      throw new ForbiddenException('Nivel de rol no permite registro de ingreso.');
    }

    if (isClient) {
      // Clientes requieren reserva activa para hoy en esta sede
      const today = new Date().toISOString().slice(0, 10);
      const reservation = await this.reservationRepo.findOne({
        where: {
          userId,
          gymId,
          reservationDate: today as any,
          status: In(['CONFIRMADA', 'PENDIENTE']),
        },
      });
      if (!reservation) {
        throw new ForbiddenException(
          'El cliente no tiene una reserva activa para hoy en esta sede.',
        );
      }
    } else {
      // Staff: validar que pertenece a la sucursal
      const exactMatch = assignments.some(a => Number(a.gymId) === Number(gymId));
      if (!exactMatch) {
        const scanningGym = await this.gymRepo.findOne({
          where: { id: Number(gymId) },
          select: { id: true, name: true, parentId: true },
        });
        const parentMatch = scanningGym?.parentId != null
          ? assignments.some(a => Number(a.gymId) === scanningGym.parentId)
          : false;
        if (!parentMatch) {
          throw new ForbiddenException(
            `El personal no pertenece a la sucursal "${scanningGym?.name ?? `#${gymId}`}". No se puede registrar su ingreso aquí.`,
          );
        }
      }
    }

    const saved = await this.repo.save(
      this.repo.create({ userId, gymId, method, status: 'ACTIVO' }),
    );

    const current = await this.repo.count({
      where: { gymId, checkOutTime: IsNull(), status: 'ACTIVO' },
    });
    this.gymGateway?.emitToGym(gymId, 'aforo_updated', { gymId, current });

    return saved;
  }

  // ── Jurisdiction helpers ────────────────────────────────────────────────────

  private getBrandId(gym: Gym): number {
    // Branch → its parentId is the brand root; brand root → its own id
    return gym.parentId ?? gym.id;
  }

  /**
   * Validates that the scanner has jurisdiction over the target.
   * Returns the effective gymId to use when creating a check-in record.
   *
   * Level 4 (Recepcionista): exact same branch required.
   * Level 5+ (Gerente): same brand root required (resolves branch → parent).
   */
  private validateJurisdiction(
    scannerTopRole: UserRole,
    targetRoles: UserRole[],
  ): number {
    const scannerLevel = Number(scannerTopRole.role?.hierarchyLevel ?? 0);
    const scannerGym   = scannerTopRole.gym;

    if (!scannerGym) {
      throw new ForbiddenException('No tienes una sucursal o marca asignada.');
    }

    if (scannerLevel === 4) {
      const matching = targetRoles.find(
        tr => tr.gym && Number(tr.gym.id) === Number(scannerGym.id),
      );
      if (!matching) {
        throw new ForbiddenException(
          `El personal no pertenece a la sucursal "${scannerGym.name ?? `#${scannerGym.id}`}".`,
        );
      }
      return Number(scannerGym.id);
    }

    if (scannerLevel >= 5) {
      const scannerBrandId = this.getBrandId(scannerGym);
      const matching = targetRoles.find(
        tr => tr.gym && this.getBrandId(tr.gym) === scannerBrandId,
      );
      if (!matching) {
        throw new ForbiddenException(
          'El personal no pertenece a tu marca. Sin permisos para registrar su ingreso.',
        );
      }
      // Check-in is recorded at the target's own assigned branch, not the brand root
      return Number(matching.gym!.id);
    }

    throw new ForbiddenException('Tu rol no tiene permisos para escanear personal.');
  }

  private async loadScannerTopRole(): Promise<UserRole> {
    const caller = this.request.user!;
    const roles = await this.userRoleRepo.find({
      where: { userId: Number(caller.userId) },
      relations: ['role', 'gym'],
    });
    const top = roles.sort(
      (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
    )[0];
    if (!top?.gym) {
      throw new ForbiddenException('No tienes una sucursal o marca asignada.');
    }
    return top;
  }

  // ── Scan-preview & register ─────────────────────────────────────────────────

  async scanPreview(token: string): Promise<{ id: number; fullName: string; role: string; branchName: string }> {
    const targetUserId = parseInt(token, 10);
    if (isNaN(targetUserId) || targetUserId <= 0 || String(targetUserId) !== token.trim()) {
      throw new ForbiddenException('Código QR no válido.');
    }

    const scannerRole = await this.loadScannerTopRole();

    const targetRoles = await this.userRoleRepo.find({
      where: { userId: targetUserId },
      relations: ['role', 'gym', 'user', 'user.profile'],
    });

    if (!targetRoles.length) {
      throw new NotFoundException('Usuario no encontrado o sin rol asignado.');
    }

    const isEligibleStaff = targetRoles.some(a => {
      const lvl = a.role?.hierarchyLevel ?? 0;
      return lvl >= 2 && lvl <= 4;
    });
    if (!isEligibleStaff) {
      throw new ForbiddenException('Solo personal autorizado puede registrar ingreso.');
    }

    this.validateJurisdiction(scannerRole, targetRoles);

    const topTargetRole = targetRoles.sort(
      (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
    )[0];
    const user      = topTargetRole.user;
    const firstName = user?.profile?.firstName ?? '';
    const lastName  = user?.profile?.lastName  ?? '';
    const fullName  = `${firstName} ${lastName}`.trim() || `Usuario #${targetUserId}`;
    const role      = topTargetRole.role?.name?.toUpperCase() ?? 'PERSONAL';
    const branchName = topTargetRole.gym?.name ?? 'Sin sucursal';

    return { id: targetUserId, fullName, role, branchName };
  }

  async registerAttendance(targetUserId: number, action: 'IN' | 'OUT') {
    const scannerRole = await this.loadScannerTopRole();

    const targetRoles = await this.userRoleRepo.find({
      where: { userId: targetUserId },
      relations: ['role', 'gym'],
    });

    if (!targetRoles.length) {
      throw new NotFoundException('Usuario no encontrado o sin rol asignado.');
    }

    const isEligibleStaff = targetRoles.some(a => {
      const lvl = a.role?.hierarchyLevel ?? 0;
      return lvl >= 2 && lvl <= 4;
    });
    if (!isEligibleStaff) {
      throw new ForbiddenException('Solo personal autorizado puede registrar ingreso.');
    }

    const effectiveGymId = this.validateJurisdiction(scannerRole, targetRoles);

    const now = new Date();
    await this.repo.save(
      this.repo.create({
        userId: targetUserId,
        gymId: effectiveGymId,
        method: 'QR',
        status: 'AUTORIZADO',
        actionType: action,
        checkInTime: now,
        checkOutTime: action === 'OUT' ? now : undefined,
      }),
    );

    this.gymGateway?.emitToGym(effectiveGymId, 'aforo_updated', { gymId: effectiveGymId, action });

    return { message: `Registro de ${action === 'IN' ? 'Ingreso' : 'Salida'} exitoso` };
  }

  private mapCheckIn(c: CheckIn) {
    const firstName = c.user?.profile?.firstName ?? '';
    const lastName = c.user?.profile?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Usuario Desconocido';
    const email = c.user?.email ?? '';

    let role = 'CLIENTE';
    if (c.user?.userRoles && c.user.userRoles.length > 0) {
      const primaryRole = c.user.userRoles.find((ur) => ur.role?.name)?.role
        ?.name;
      if (primaryRole) {
        role = primaryRole.toUpperCase();
      }
    }

    return {
      id: c.id,
      userId: c.userId ?? c.user?.id,
      gymId: c.gymId ?? c.gym?.id,
      checkInTime: c.checkInTime,
      checkOutTime: c.checkOutTime,
      status: c.status,
      rejectionReason: null,
      method: c.method ?? 'MANUAL',
      actionType: c.actionType ?? null,
      userProfile: {
        fullName,
        email,
        role,
      },
      gym: c.gym ?? null,
    };
  }

  async findAllHistory() {
    const qb = this.repo
      .createQueryBuilder('checkIn')
      .leftJoinAndSelect('checkIn.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userRoles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('checkIn.gym', 'gym')
      .orderBy('checkIn.checkInTime', 'DESC');

    this.applyStaffOnlyFilter(qb);
    await this.applyScopeFilter(qb);

    const records = await qb.getMany();

    return records.map((c) => {
      const mapped = this.mapCheckIn(c);
      return {
        ...mapped,
        userName: c.user ? c.user.email : 'Usuario Desconocido',
        gymName: c.gym?.name ?? 'Sede no asignada',
      };
    });
  }

  async findAll() {
    const qb = this.repo
      .createQueryBuilder('checkIn')
      .leftJoinAndSelect('checkIn.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userRoles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('checkIn.gym', 'gym')
      .orderBy('checkIn.checkInTime', 'DESC');
    this.applyStaffOnlyFilter(qb);
    await this.applyScopeFilter(qb);
    const records = await qb.getMany();
    return records.map((c) => this.mapCheckIn(c));
  }

  async findByUser(userId: number) {
    const qb = this.repo
      .createQueryBuilder('checkIn')
      .leftJoinAndSelect('checkIn.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userRoles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('checkIn.gym', 'gym')
      .where('checkIn.user_id = :userId', { userId })
      .orderBy('checkIn.checkInTime', 'DESC');
    await this.applyScopeFilter(qb);
    const records = await qb.getMany();
    return records.map((c) => this.mapCheckIn(c));
  }

  async findByGym(gymId: number) {
    const qb = this.repo
      .createQueryBuilder('checkIn')
      .leftJoinAndSelect('checkIn.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userRoles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('checkIn.gym', 'gym')
      .where('checkIn.gym_id = :gymId', { gymId })
      .orderBy('checkIn.checkInTime', 'DESC');
    this.applyStaffOnlyFilter(qb);
    await this.applyScopeFilter(qb);
    const records = await qb.getMany();
    return records.map((c) => this.mapCheckIn(c));
  }

  async findOne(id: number) {
    const qb = this.repo
      .createQueryBuilder('checkIn')
      .leftJoinAndSelect('checkIn.user', 'user')
      .leftJoinAndSelect('checkIn.gym', 'gym')
      .where('checkIn.id = :id', { id });
    await this.applyScopeFilter(qb);
    const c = await qb.getOne();
    if (!c) throw new NotFoundException(`Check-in ${id} no encontrado`);
    return c;
  }

  async checkOut(id: number) {
    const c = await this.findOne(id);
    c.checkOutTime = new Date();
    c.status = 'COMPLETADO';
    const saved = await this.repo.save(c);

    const gymId = c.gymId ?? c.gym?.id;
    if (gymId) {
      const current = await this.repo.count({
        where: { gymId, checkOutTime: IsNull(), status: 'ACTIVO' },
      });
      this.gymGateway?.emitToGym(gymId, 'aforo_updated', { gymId, current });
    }

    return saved;
  }
}
