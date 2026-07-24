import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Scope,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Reservation } from '../domain/reservation.entity';
import { UserRole } from '../../roles/domain/user-role.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { GymActivity } from '../../activities/domain/gym-activity.entity';
import { GymActivitySchedule } from '../../activities/domain/gym-activity-schedule.entity';
import { GymSchedule } from '../../gyms/domain/gym-schedule.entity';
import { User } from '../../users/domain/user.entity';
import { CheckIn } from '../../checkins/domain/check-in.entity';
import {
  getManagerGymId,
  type RequestUser,
  type RequestWithUser,
} from '../../common/security/gym-scope';
import { ACTIVE_RESERVATION_STATUSES } from '../../common/constants/reservation-status.constants';
import {
  DayOfWeek,
  aliasesForCanonicalDay,
} from '../../activities/application/dtos/create-activity-schedule.dto';
import type { CreateReservationDto } from './dtos/reservations.dto';
import { PushNotificationsService } from '../../push-notifications/application/push-notifications.service';
import { UsersService } from '../../users/application/users.service';
import { GymGateway } from '../../notifications/infrastructure/gym.gateway';

const DAY_UTC_INDEX: DayOfWeek[] = [
  DayOfWeek.DOMINGO,
  DayOfWeek.LUNES,
  DayOfWeek.MARTES,
  DayOfWeek.MIERCOLES,
  DayOfWeek.JUEVES,
  DayOfWeek.VIERNES,
  DayOfWeek.SABADO,
];

@Injectable({ scope: Scope.REQUEST })
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectRepository(Reservation) private repo: Repository<Reservation>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    @InjectRepository(GymActivity)
    private activityRepo: Repository<GymActivity>,
    @InjectRepository(GymActivitySchedule)
    private scheduleRepo: Repository<GymActivitySchedule>,
    @InjectRepository(GymSchedule)
    private gymScheduleRepo: Repository<GymSchedule>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CheckIn) private checkInRepo: Repository<CheckIn>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly jwtService: JwtService,
    private readonly pushService: PushNotificationsService,
    private readonly usersService: UsersService,
    private readonly gymGateway: GymGateway,
  ) {}

  private managerGymId(): number | null {
    return getManagerGymId(this.request);
  }

  /**
   * Verifica si una reserva pertenece al territorio del usuario autenticado.
   * Consulta la BD para obtener el rol de mayor jerarquía del caller,
   * evitando falsos negativos cuando el JWT no lleva gym_id (Super Admin).
   *
   * Niveles:
   *   >= 10 (Super Admin) → acceso automático a cualquier reserva.
   *      5  (Gerente)     → reserva en su marca padre o en sucursal hija.
   *      4  (Recepcionista) → reserva en su sucursal exacta.
   *   otro               → denegado.
   */
  private async gymBelongsToManager(reservationGymId: number | null): Promise<boolean> {
    if (!reservationGymId) return false;

    const currentUser = this.getAuthUser();

    // Obtener rol de mayor jerarquía desde BD (ORDER BY evita pick de rol CLIENT en usuarios multi-rol)
    const callerDbRole = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .leftJoinAndSelect('ur.gym', 'gym')
      .where('ur.user_id = :userId', { userId: Number(currentUser.userId) })
      .orderBy('role.hierarchyLevel', 'DESC')
      .getOne();

    const callerLevel = Number(callerDbRole?.role?.hierarchyLevel ?? 0);
    const callerGymId = Number(callerDbRole?.gymId ?? 0);

    // BYPASS CRÍTICO: Super Admin tiene autorización sobre cualquier reserva
    if (callerLevel >= 10) return true;

    if (callerLevel === 5) {
      // GERENTE: la reserva debe estar en su marca (padre) o en una sucursal hija
      if (reservationGymId === callerGymId) return true;
      const targetGym = await this.gymRepo.findOne({
        where: { id: reservationGymId },
        select: { id: true, parentId: true },
      });
      return targetGym?.parentId === callerGymId;
    }

    if (callerLevel === 4) {
      // RECEPCIONISTA: solo su sucursal exacta
      return Number(reservationGymId) === callerGymId;
    }

    return false;
  }

  private async buildCrossBranchErrorMsg(reservationGymId: number | null): Promise<string> {
    const { gymId: jwtGymId, brandId: jwtBrandId } = this.getAuthUser();
    const scannerScopeId = jwtBrandId ?? jwtGymId;

    const [reservationGym, scannerGym] = await Promise.all([
      reservationGymId
        ? this.gymRepo.findOne({ where: { id: reservationGymId }, relations: ['parent'] })
        : null,
      scannerScopeId
        ? this.gymRepo.findOne({ where: { id: scannerScopeId } })
        : null,
    ]);

    const resGymName = reservationGym?.name ?? 'otra sucursal';
    const resBrandName = reservationGym?.parent?.name;
    const scannerName = scannerGym?.name ?? 'tu sucursal';

    const resLocation = resBrandName
      ? `"${resGymName}" (marca ${resBrandName})`
      : `"${resGymName}"`;

    if (jwtBrandId) {
      return `Esta reserva pertenece a la sucursal ${resLocation}. Tu marca es "${scannerName}" y solo puedes registrar ingresos de tus propias sucursales.`;
    }
    return `Esta reserva pertenece a la sucursal ${resLocation}. Tu sucursal es "${scannerName}" y solo puedes registrar ingresos de tu propia sucursal.`;
  }

  /**
   * Retorna true si la reserva ya expiró (fecha pasada, o misma fecha pero hora fin superada).
   * Usa UTC para consistencia con checkInByToken.
   */
  private isReservationExpired(r: Reservation): boolean {
    const dateStr =
      r.reservationDate instanceof Date
        ? r.reservationDate.toISOString().slice(0, 10)
        : String(r.reservationDate).slice(0, 10);

    const now = new Date();
    const botOffset = -4 * 60;
    const localMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + botOffset;
    const localDayShift = localMinutes < 0 ? -1 : localMinutes >= 1440 ? 1 : 0;

    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + localDayShift, 12));
    const todayStr = todayUTC.toISOString().slice(0, 10);

    if (dateStr < todayStr) return true;
    if (dateStr > todayStr) return false;

    if (!r.endTime) return false;
    const [eh, em] = String(r.endTime).slice(0, 5).split(':').map(Number);
    const nowLocalMins = ((localMinutes % 1440) + 1440) % 1440;
    return nowLocalMins >= eh * 60 + em;
  }

  private getAuthUser(): RequestUser {
    const user = this.request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Sesión no válida.');
    }
    return user;
  }

  private async assertTargetUserExists(userId: number): Promise<void> {
    const exists = await this.usersRepo.exist({
      where: { id: userId, isActive: true },
    });
    if (!exists) {
      throw new NotFoundException(`Usuario ${userId} no encontrado.`);
    }
  }

  private applyListScope(qb: SelectQueryBuilder<Reservation>): void {
    const { userId } = this.getAuthUser();
    const level = (this.request.user as any)?.level ?? 0;

    if (level === 3) {
      throw new ForbiddenException(
        'Los entrenadores deben usar el endpoint de asistencia por clase.',
      );
    }

    if (level >= 10) return;

    if (level >= 4) {
      const gymId = this.managerGymId();
      const auditStatuses = ['CONFIRMADA', 'COMPLETADA'];
      qb.andWhere(
        '(activity.gym_id = :gymId OR reservation.gym_id = :gymId OR gym.parent_id = :gymId)',
        { gymId },
      );
      qb.andWhere('reservation.status IN (:...auditStatuses)', {
        auditStatuses,
      });
    } else {
      qb.andWhere('reservation.user_id = :uid', { uid: Number(userId) });
    }
  }

  private async resolveScheduleGymId(
    gymActivityScheduleId: number,
  ): Promise<number> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id: gymActivityScheduleId },
      relations: ['gymActivity'],
    });
    if (!schedule?.gymActivity) {
      throw new NotFoundException(
        `Horario ${gymActivityScheduleId} no encontrado`,
      );
    }
    return schedule.gymActivity.gymId;
  }

  private toHHmm(t: string): string {
    return String(t).trim().slice(0, 5);
  }

  private deriveDayOfWeek(isoDate: string): DayOfWeek {
    const [y, m, d] = isoDate.split('-').map(Number);
    return DAY_UTC_INDEX[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  private async assertTimeWithinGymHours(
    gymId: number,
    day: DayOfWeek,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    const dayVariants = aliasesForCanonicalDay(day);
    const slots = await this.gymScheduleRepo.find({
      where: { gymId, isHoliday: false },
    });
    const sameDay = slots.filter((s) =>
      dayVariants.includes(String(s.dayOfWeek).toUpperCase()),
    );
    if (sameDay.length === 0) return;

    const start = this.toHHmm(startTime);
    const end = this.toHHmm(endTime);
    const ok = sameDay.some((row) => {
      const open = this.toHHmm(row.opensAt);
      const close = this.toHHmm(row.closesAt);
      return open <= start && close >= end;
    });

    if (!ok) {
      throw new BadRequestException(
        `El bloque ${startTime}–${endTime} está fuera del horario de apertura de la sede`,
      );
    }
  }

  /**
   * Resuelve el ID del horario de actividad a usar.
   * Flujo estándar: gymActivityScheduleId presente → úsalo directamente.
   * Flujo abierto: gymId + startTime + endTime → valida contra gym_schedules y busca
   * la primera GymActivitySchedule que cubra ese bloque ese día de la semana.
   */
  private async resolveScheduleId(dto: CreateReservationDto): Promise<number> {
    if (dto.gymActivityScheduleId != null) {
      return Number(dto.gymActivityScheduleId);
    }

    if (!dto.gymId || !dto.startTime || !dto.endTime) {
      throw new BadRequestException(
        'Proporciona gymActivityScheduleId, o los tres campos gymId + startTime + endTime para flujo abierto.',
      );
    }

    const gymIdNum = Number(dto.gymId);
    const day = this.deriveDayOfWeek(dto.reservationDate);
    await this.assertTimeWithinGymHours(
      gymIdNum,
      day,
      dto.startTime,
      dto.endTime,
    );

    const dayVariants = aliasesForCanonicalDay(day);
    const sched = await this.scheduleRepo.findOne({
      where: {
        dayOfWeek: In(dayVariants),
        startTime: LessThanOrEqual(dto.startTime),
        endTime: MoreThanOrEqual(dto.endTime),
        gymActivity: {
          gymId: gymIdNum,
          isActive: true,
        },
      },
      relations: ['gymActivity'],
    });

    if (!sched) {
      throw new NotFoundException(
        `Sin actividad programada para el bloque ${dto.startTime}–${dto.endTime} el ${day} en la sede ${dto.gymId}. ` +
          `Consulta GET /api/activities?gymId=${dto.gymId} para ver horarios disponibles.`,
      );
    }

    return sched.id;
  }

  /**
   * Flujo libre: activityId presente, sin scheduleId.
   * Salta cálculo de aforo por bloques.
   * Estado inicial: PENDIENTE.
   */
  private async createFreeAccessReservation(
    data: CreateReservationDto,
    reservationUserId: number,
    actorId: number,
  ): Promise<Reservation> {
    const activity = await this.activityRepo.findOne({
      where: { id: data.activityId, isActive: true },
    });

    if (!activity) {
      throw new NotFoundException(
        `Actividad ${data.activityId} no encontrada.`,
      );
    }

    if (!activity.isFreeAccess) {
      throw new BadRequestException(
        'Esta clase requiere un horario específico. Usa gymActivityScheduleId.',
      );
    }

    const level = (this.request.user as any)?.level ?? 0;
    if (level >= 4 && level < 10) {
      const managerGymId = this.managerGymId();
      if (Number(activity.gymId) !== Number(managerGymId)) {
        throw new ForbiddenException('La actividad pertenece a otra sucursal.');
      }
    }

    // ── Flujo libre exige tiempos explícitos del cliente ────────────────────
    if (!data.startTime || !data.endTime) {
      throw new BadRequestException(
        'Las actividades de acceso libre requieren startTime y endTime (HH:mm).',
      );
    }

    const reservationDate = this.parseReservationDateOnly(data.reservationDate);

    const saved = await this.saveFreeReservationWithLock({
      userId: reservationUserId,
      activityId: activity.id,
      gymId: activity.gymId,
      reservationDate,
      startTime: data.startTime, // tiempo elegido por el cliente
      endTime: data.endTime,
      status: 'PENDIENTE',
      createdBy: actorId,
    });
    this.logger.debug(
      `Reserva libre ${saved.id}: activity=${activity.id} gym=${activity.gymId} user=${reservationUserId}`,
    );
    return saved;
  }

  /**
   * Overlap-check + INSERT atómicos para reservas de acceso libre.
   * Lock pessimistic_write sobre la fila del usuario: un double-submit del
   * mismo usuario se serializa (el segundo request espera el commit del
   * primero y ve su reserva en el overlap-check → 409), sin bloquear a
   * otros usuarios. Cierra el TOCTOU del patrón SELECT-luego-INSERT.
   */
  private async saveFreeReservationWithLock(fields: {
    userId: number;
    activityId: number;
    gymId: Reservation['gymId'];
    reservationDate: Reservation['reservationDate'];
    startTime: string;
    endTime: string;
    status: Reservation['status'];
    createdBy: number;
    qrToken?: string;
  }): Promise<Reservation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        fields.userId,
      ]);

      const overlap = await queryRunner.manager
        .createQueryBuilder(Reservation, 'r')
        .where('r.userId = :uid', { uid: fields.userId })
        .andWhere('r.activityId = :aid', { aid: fields.activityId })
        .andWhere('r.reservation_date = :d', { d: fields.reservationDate })
        .andWhere('r.status IN (:...st)', { st: [...ACTIVE_RESERVATION_STATUSES] })
        .andWhere('r.start_time < :end', { end: fields.endTime })
        .andWhere('r.end_time > :start', { start: fields.startTime })
        .getExists();
      if (overlap) {
        throw new ConflictException(
          'Ya tienes una reserva en ese horario para esta actividad.',
        );
      }

      const saved = await queryRunner.manager.save(
        Reservation,
        queryRunner.manager.create(Reservation, {
          userId: fields.userId,
          gymActivityScheduleId: null,
          gymId: fields.gymId,
          activityId: fields.activityId,
          reservationDate: fields.reservationDate,
          startTime: fields.startTime,
          endTime: fields.endTime,
          status: fields.status,
          createdBy: fields.createdBy,
          ...(fields.qrToken ? { qrToken: fields.qrToken } : {}),
        }),
      );

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Punto de entrada único para crear reservas.
   * LÍNEA 1: si llega activityId → flujo libre, return inmediato.
   * Solo baja al flujo de horarios si activityId es nulo.
   */
  async createReservation(data: CreateReservationDto): Promise<Reservation> {
    const { userId } = this.getAuthUser();
    const actorId = Number(userId);
    const level = (this.request.user as any)?.level ?? 0;

    // ── RBAC ────────────────────────────────────────────────────────────────
    if (level >= 10 || level === 3) {
      throw new ForbiddenException('Tu rol no permite crear reservas.');
    }

    // ── Resolver usuario objetivo ───────────────────────────────────────────
    let reservationUserId: number;
    if (level >= 4) {
      if (data.targetUserId == null) {
        throw new BadRequestException(
          'targetUserId es obligatorio para crear reservas como staff.',
        );
      }
      reservationUserId = Number(data.targetUserId);
      await this.assertTargetUserExists(reservationUserId);
    } else if (level < 3) {
      reservationUserId = actorId;
    } else {
      throw new ForbiddenException('Tu rol no permite crear reservas.');
    }

    // ════════════════════════════════════════════════════════════════════════
    // BLOQUE CORTANTE — FLUJO LIBRE
    // Condición: activityId presente. Return absoluto. No cae abajo.
    // ════════════════════════════════════════════════════════════════════════
    const rawActivityId = data.activityId;
    if (rawActivityId !== undefined && rawActivityId !== null) {
      const actId = Number(rawActivityId);

      const activity = await this.activityRepo.findOne({
        where: { id: actId, isActive: true },
      });
      if (!activity) {
        throw new NotFoundException(`Actividad ${actId} no encontrada.`);
      }
      if (!activity.isFreeAccess) {
        throw new BadRequestException(
          'Esta clase requiere gymActivityScheduleId (no es de acceso libre).',
        );
      }

      if (level >= 4 && level < 10) {
        const mg = this.managerGymId();
        if (Number(activity.gymId) !== Number(mg)) {
          throw new ForbiddenException(
            'La actividad pertenece a otra sucursal.',
          );
        }
      }

      if (!data.startTime || !data.endTime) {
        throw new BadRequestException(
          'Acceso libre requiere startTime y endTime (HH:mm).',
        );
      }

      // ── Enforce max duration for free-access activities ───────────────
      if (activity.defaultDurationMin && activity.defaultDurationMin > 0) {
        const toMins = (t: string) => {
          const [h, m] = t.slice(0, 5).split(':').map(Number);
          return h * 60 + m;
        };
        const diff = toMins(data.endTime) - toMins(data.startTime);
        if (diff <= 0) {
          throw new BadRequestException(
            'La hora de fin debe ser posterior a la hora de inicio.',
          );
        }
        if (diff > activity.defaultDurationMin) {
          throw new BadRequestException(
            'El tiempo seleccionado supera la duración máxima permitida para este servicio.',
          );
        }
      }

      const reservationDate = this.parseReservationDateOnly(
        data.reservationDate,
      );

      const saved = await this.saveFreeReservationWithLock({
        userId: reservationUserId,
        activityId: activity.id,
        gymId: activity.gymId,
        reservationDate,
        startTime: data.startTime,
        endTime: data.endTime,
        status: 'CONFIRMADA',
        createdBy: actorId,
        qrToken: randomUUID(),
      });

      this.logger.debug(
        `[FREE] Reserva ${saved.id} activity=${activity.id} gym=${activity.gymId} user=${reservationUserId}`,
      );
      // Fire-and-forget: no bloquea la respuesta al cliente
      this.notifyGymManagers(activity.gymId, saved.id).catch(() => void 0);
      return saved; // ← RETURN ABSOLUTO — nada más ejecuta
    }
    // ════════════════════════════════════════════════════════════════════════
    // FIN BLOQUE CORTANTE
    // Solo llega aquí si activityId era nulo → flujo estándar con horario
    // ════════════════════════════════════════════════════════════════════════

    const scheduleId = await this.resolveScheduleId(data);

    if (level >= 4 && level < 10) {
      const mg = this.managerGymId();
      const gid = await this.resolveScheduleGymId(scheduleId);
      if (gid !== mg) {
        throw new ForbiddenException(
          'No puede crear reservas en otra sucursal.',
        );
      }
    }

    const status = data.status ?? 'CONFIRMADA';
    return this.createReservationWithLock(
      scheduleId,
      reservationUserId,
      data.reservationDate,
      status,
      actorId,
    );
  }

  /**
   * Motor transaccional: bloquea la fila del horario, cuenta cupos activos y persiste la reserva sin race conditions de aforo.
   */
  async createReservationWithLock(
    scheduleId: number,
    userId: number,
    reservationDateRaw: string,
    status = 'CONFIRMADA',
    createdBy?: number,
  ): Promise<Reservation> {
    const reservationDate = this.parseReservationDateOnly(reservationDateRaw);
    const createdById = createdBy ?? userId;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const schedule = await queryRunner.manager.findOne(GymActivitySchedule, {
        where: { id: scheduleId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });

      if (!schedule) {
        throw new NotFoundException(`Horario ${scheduleId} no encontrado`);
      }

      const scheduleWithActivity = await queryRunner.manager.findOne(
        GymActivitySchedule,
        {
          where: { id: scheduleId },
          relations: ['gymActivity'],
        },
      );

      if (!scheduleWithActivity?.gymActivity) {
        throw new NotFoundException(
          `Actividad del horario ${scheduleId} no encontrada`,
        );
      }

      const dup = await queryRunner.manager.exists(Reservation, {
        where: {
          userId,
          gymActivityScheduleId: scheduleId,
          reservationDate,
          status: In([...ACTIVE_RESERVATION_STATUSES]),
        },
      });
      if (dup) {
        throw new ConflictException(
          'Ya tienes una reserva activa para este horario y fecha',
        );
      }

      const activeCount = await queryRunner.manager.count(Reservation, {
        where: {
          gymActivityScheduleId: scheduleId,
          reservationDate,
          status: In([...ACTIVE_RESERVATION_STATUSES]),
        },
      });

      if (activeCount >= schedule.maxAttendees) {
        throw new ConflictException('Cupo agotado. Intenta con otro horario.');
      }

      // Tiempos de BD — el cliente no los dicta; se copian del Schedule exacto
      const entity = queryRunner.manager.create(Reservation, {
        userId,
        gymActivityScheduleId: scheduleId,
        gymId: scheduleWithActivity.gymActivity.gymId,
        activityId: scheduleWithActivity.gymActivity.id,
        reservationDate,
        startTime: String(schedule.startTime).slice(0, 5), // HH:mm desde BD
        endTime: String(schedule.endTime).slice(0, 5),
        status,
        createdBy: createdById,
        qrToken: randomUUID(),
      });
      const saved = await queryRunner.manager.save(entity);

      await queryRunner.commitTransaction();
      this.logger.debug(
        `Reserva ${saved.id} schedule=${scheduleId} ${schedule.startTime}-${schedule.endTime} fecha=${reservationDateRaw}`,
      );
      // Fire-and-forget: no bloquea la respuesta al cliente
      if (saved.gymId) {
        this.notifyGymManagers(saved.gymId, saved.id).catch(() => void 0);
      }
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Error al procesar la reserva', {
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      await queryRunner.release();
    }
  }

  /** Mediodía UTC: inmune a cualquier zona horaria (UTC±12 nunca cruza de día). */
  private parseReservationDateOnly(isoDate: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
    if (!m) {
      throw new BadRequestException(
        'reservationDate debe tener formato YYYY-MM-DD',
      );
    }
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  }

  async findAll(opts: {
    date?: string;
    status?: string;
    page: number;
    limit: number;
    gymId?: number;
  }) {
    const { date, status, page, limit } = opts;
    const level = (this.request.user as any)?.level ?? 0;

    const qb = this.repo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('reservation.gym', 'gym')
      .leftJoinAndSelect('gym.parent', 'gymBrand')
      .leftJoinAndSelect('reservation.activity', 'freeActivity')
      .addSelect('freeActivity.name')
      .leftJoinAndSelect('reservation.gymActivitySchedule', 'schedule')
      .leftJoinAndSelect('schedule.gymActivity', 'activity')
      .addSelect('activity.name')
      .leftJoinAndSelect('schedule.instructor', 'schedInstructor')
      .leftJoinAndSelect('schedInstructor.profile', 'schedInstructorProfile')
      .orderBy('reservation.reservationDate', 'DESC')
      .addOrderBy('reservation.createdAt', 'DESC');

    // ── Filtro de fecha ───────────────────────────────────────────────────────
    if (date) {
      const m = /^\d{4}-\d{2}-\d{2}$/.exec(date.trim());
      if (m) {
        qb.andWhere('reservation.reservationDate = :date', {
          date: date.trim(),
        });
      }
    }

    // ── Filtro de estado ──────────────────────────────────────────────────────
    if (status) {
      qb.andWhere('reservation.status = :status', {
        status: status.toUpperCase(),
      });
    } else if (level >= 10 || level < 4) {
      qb.andWhere('reservation.status != :cancelled', {
        cancelled: 'CANCELLED',
      });
    }

    // Filtro por gymId si se provee
    if (opts.gymId) {
      qb.andWhere('(activity.gym_id = :gymId OR reservation.gym_id = :gymId)', {
        gymId: opts.gymId,
      });
    }

    // ── Scope por rol ─────────────────────────────────────────────────────────
    this.applyListScope(qb);

    // ── Paginación ────────────────────────────────────────────────────────────
    qb.offset((page - 1) * limit).limit(limit);

    const records = await qb.getMany();
    return records.map((r) => this.mapReservation(r));
  }
  private mapReservation(r: Reservation, gerentePhoneMap?: Map<number, string | null>) {
    let reservationDateStr = r.reservationDate as any;
    if (reservationDateStr instanceof Date) {
      reservationDateStr = reservationDateStr.toISOString().split('T')[0];
    } else if (typeof reservationDateStr === 'string') {
      reservationDateStr = reservationDateStr.split('T')[0];
    }

    const firstName = r.user?.profile?.firstName ?? '';
    const lastName = r.user?.profile?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    // Estado computado: CONFIRMADA + expirada → CADUCADA (sin mutación en BD)
    const effectiveStatus =
      r.status === 'CONFIRMADA' && this.isReservationExpired(r) ? 'CADUCADA' : r.status;

    const isPaid = ['COMPLETADA', 'USADA', 'USED'].includes(effectiveStatus);

    const brandId = r.gym?.parent?.id ?? null;
    const gerentePhone = brandId !== null ? (gerentePhoneMap?.get(brandId) ?? null) : null;
    const instructorPhone = r.gymActivitySchedule?.instructor?.profile?.phone ?? null;

    return {
      id: r.id,
      userId: r.userId ?? r.user?.id,
      reservationDate: reservationDateStr,
      startTime: r.startTime,
      endTime: r.endTime,
      status: effectiveStatus,
      isPaid,
      gerentePhone,
      instructorPhone,
      qrToken: r.qrToken,
      createdAt: r.createdAt,
      cancelledAt: r.cancelledAt,
      user: r.user
        ? {
            id: r.user.id,
            email: r.user.email,
            profile: r.user.profile
              ? {
                  fullName,
                  ci: r.user.profile.ci ?? null,
                }
              : null,
          }
        : null,
      gym: r.gym
        ? {
            id: r.gym.id,
            name: r.gym.name,
            brand: r.gym.parent
              ? { id: r.gym.parent.id, name: r.gym.parent.name }
              : null,
          }
        : null,
      freeActivity: r.activity
        ? {
            id: r.activity.id,
            name: r.activity.name,
            gymId: r.activity.gymId,
          }
        : null,
      gymActivitySchedule: r.gymActivitySchedule
        ? {
            id: r.gymActivitySchedule.id,
            dayOfWeek: r.gymActivitySchedule.dayOfWeek,
            startTime: r.gymActivitySchedule.startTime,
            endTime: r.gymActivitySchedule.endTime,
            instructor: r.gymActivitySchedule.instructor
              ? {
                  id: r.gymActivitySchedule.instructor.id,
                  email: r.gymActivitySchedule.instructor.email,
                  profile: r.gymActivitySchedule.instructor.profile
                    ? {
                        firstName:
                          r.gymActivitySchedule.instructor.profile.firstName,
                        lastName:
                          r.gymActivitySchedule.instructor.profile.lastName,
                      }
                    : null,
                }
              : null,
            gymActivity: r.gymActivitySchedule.gymActivity
              ? {
                  id: r.gymActivitySchedule.gymActivity.id,
                  name: r.gymActivitySchedule.gymActivity.name,
                  gymId: r.gymActivitySchedule.gymActivity.gymId,
                }
              : null,
          }
        : null,
    };
  }

  async findByUser(userId: number, date?: string) {
    const { userId: authUserId } = this.getAuthUser();
    const level = (this.request.user as any)?.level ?? 0;

    if (level === 3) {
      throw new ForbiddenException(
        'Los entrenadores deben usar el endpoint de asistencia por clase.',
      );
    }

    if (level < 3) {
      userId = Number(authUserId);
    } else if (level < 4) {
      throw new ForbiddenException('No tiene permisos para listar reservas.');
    }

    const qb = this.repo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('reservation.gym', 'gym')
      .leftJoinAndSelect('gym.location', 'gymLocation')
      .leftJoinAndSelect('gym.parent', 'gymBrand')
      .leftJoinAndSelect('reservation.activity', 'freeActivity')
      .addSelect('freeActivity.name')
      .leftJoinAndSelect('reservation.gymActivitySchedule', 'schedule')
      .leftJoinAndSelect('schedule.gymActivity', 'activity')
      .addSelect('activity.name')
      .leftJoinAndSelect('schedule.instructor', 'schedInstructor')
      .leftJoinAndSelect('schedInstructor.profile', 'schedInstructorProfile')
      .andWhere('reservation.userId = :userId', { userId })
      .orderBy('reservation.reservationDate', 'DESC');

    if (date) {
      const m = /^\d{4}-\d{2}-\d{2}$/.exec(date.trim());
      if (m) {
        qb.andWhere('reservation.reservationDate = :date', {
          date: date.trim(),
        });
      }
    }

    if (level >= 4 && level < 10) {
      const gymId = this.managerGymId();
      qb.andWhere(
        '(activity.gym_id = :gymId OR reservation.gym_id = :gymId OR gym.parent_id = :gymId)',
        { gymId },
      );
    }

    const records = await qb.getMany();

    const brandIds = [
      ...new Set(
        records
          .map(r => r.gym?.parent?.id ?? null)
          .filter((id): id is number => id !== null),
      ),
    ];
    const gerentePhoneMap = await this.getGerentePhonesForBrands(brandIds);

    return records.map(r => this.mapReservation(r, gerentePhoneMap));
  }

  private async getGerentePhonesForBrands(
    brandIds: number[],
  ): Promise<Map<number, string | null>> {
    if (!brandIds.length) return new Map();

    const rows = await this.dataSource
      .createQueryBuilder()
      .select('ur.gym_id', 'brandId')
      .addSelect('p.phone', 'phone')
      .from('user_roles', 'ur')
      .innerJoin('roles', 'r', 'ur.role_id = r.id')
      .innerJoin('user_profiles', 'p', 'p.user_id = ur.user_id')
      .where('ur.gym_id IN (:...brandIds)', { brandIds })
      .andWhere('r.hierarchy_level = :level', { level: 5 })
      .getRawMany<{ brandId: string; phone: string | null }>();

    const map = new Map<number, string | null>();
    for (const row of rows) {
      const id = Number(row.brandId);
      if (!map.has(id)) {
        map.set(id, row.phone ?? null);
      }
    }
    return map;
  }

  async findOne(id: number) {
    const qb = this.repo
      .createQueryBuilder('reservation')
      // Usuario
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      // Sede + marca padre
      .leftJoinAndSelect('reservation.gym', 'gym')
      .leftJoinAndSelect('gym.parent', 'gymBrand')
      // Flujo libre
      .leftJoinAndSelect('reservation.activity', 'freeActivity')
      .addSelect('freeActivity.name')
      // Flujo programado
      .leftJoinAndSelect('reservation.gymActivitySchedule', 'schedule')
      .leftJoinAndSelect('schedule.gymActivity', 'activity') // alias requerido por applyListScope
      .addSelect('activity.name')
      .leftJoinAndSelect('schedule.instructor', 'schedInstructor')
      .leftJoinAndSelect('schedInstructor.profile', 'schedInstructorProfile')
      .where('reservation.id = :id', { id });

    this.applyListScope(qb);

    const r = await qb.getOne();
    if (r) return this.mapReservation(r);

    const level = (this.request.user as any)?.level ?? 0;
    const exists = await this.repo.exist({ where: { id } });
    if (exists && level < 10) {
      throw new ForbiddenException(
        'No tiene permisos para acceder a esta reserva.',
      );
    }

    throw new NotFoundException(`Reserva ${id} no encontrada`);
  }

  async findByToken(token: string) {
    const qb = this.repo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('reservation.gym', 'gym')
      .leftJoinAndSelect('reservation.activity', 'freeActivity')
      .addSelect('freeActivity.name')
      .leftJoinAndSelect('reservation.gymActivitySchedule', 'schedule')
      .leftJoinAndSelect('schedule.gymActivity', 'activity')
      .addSelect('activity.name')
      .leftJoinAndSelect('schedule.instructor', 'schedInstructor')
      .leftJoinAndSelect('schedInstructor.profile', 'schedInstructorProfile')
      .where('reservation.qrToken = :token', { token });

    const r = await qb.getOne();
    if (!r)
      throw new NotFoundException('Token QR inválido o reserva no encontrada');

    const level = (this.request.user as any)?.level ?? 0;
    if (level >= 4 && level < 10) {
      const reservationGymId = r.gymId ?? r.gymActivitySchedule?.gymActivity?.gymId ?? null;
      const hasAccess = await this.gymBelongsToManager(reservationGymId);
      if (!hasAccess) {
        const msg = await this.buildCrossBranchErrorMsg(reservationGymId);
        throw new ForbiddenException(msg);
      }
    } else if (level < 4) {
      throw new ForbiddenException(
        'No tiene permisos para validar reservas por token.',
      );
    }

    return this.mapReservation(r);
  }

  /**
   * Valida QR y marca ingreso físico.
   * Solo GERENTE (misma sede) o SUPER_ADMIN.
   * Reserva debe estar en estado CONFIRMADA → pasa a COMPLETADA.
   * Registra fila en check_ins.
   */
  async checkInReservation(
    reservationId: number,
  ): Promise<{ reservation: Reservation; checkIn: CheckIn }> {
    const { userId, gymId: tokenGymId } = this.getAuthUser();
    const level = (this.request.user as any)?.level ?? 0;

    if (level < 4) {
      throw new ForbiddenException(
        'Nivel jerárquico insuficiente para registrar ingresos.',
      );
    }

    const reservation = await this.repo.findOne({
      where: { id: reservationId },
      relations: [
        'gymActivitySchedule',
        'gymActivitySchedule.gymActivity',
        'activity',
      ],
    });

    if (!reservation) {
      throw new NotFoundException(`Reserva ${reservationId} no encontrada.`);
    }

    if (level >= 4 && level < 10) {
      const reservationGymId =
        reservation.gymId ??
        reservation.gymActivitySchedule?.gymActivity?.gymId ??
        null;
      const hasAccess = await this.gymBelongsToManager(reservationGymId);
      if (!hasAccess) {
        const msg = await this.buildCrossBranchErrorMsg(reservationGymId);
        throw new ForbiddenException(msg);
      }
    }

    // Solo se puede hacer check-in de reservas confirmadas
    if (reservation.status !== 'CONFIRMADA') {
      throw new BadRequestException(
        `La reserva tiene estado '${reservation.status}'. Solo se puede hacer check-in de reservas CONFIRMADA.`,
      );
    }

    // Mutación de estado
    reservation.status = 'COMPLETADA';

    // Gymid para el check_in: usa el de la reserva o el del token (GERENTE)
    const gymIdForCheckIn =
      reservation.gymActivitySchedule?.gymActivity?.gymId ?? Number(tokenGymId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedReservation = await queryRunner.manager.save(
        Reservation,
        reservation,
      );

      const checkIn = queryRunner.manager.create(CheckIn, {
        userId: reservation.userId,
        gymId: gymIdForCheckIn,
        method: 'QR',
        status: 'COMPLETED',
        checkInTime: new Date(),
      });
      const savedCheckIn = await queryRunner.manager.save(CheckIn, checkIn);

      await queryRunner.commitTransaction();

      // Fire-and-forget: confirmar ingreso al cliente (user no cargado en esta ruta)
      this.usersRepo
        .findOne({ where: { id: reservation.userId }, select: ['id', 'pushToken'] })
        .then((owner) => {
          if (!owner?.pushToken) return;
          const actName =
            reservation.activity?.name ??
            reservation.gymActivitySchedule?.gymActivity?.name ??
            'tu clase';
          return this.pushService.sendPushMessage(
            owner.pushToken,
            'Ingreso registrado',
            `Tu ingreso a ${actName} fue registrado. Disfruta tu entrenamiento.`,
            { type: 'CHECKIN_CONFIRMED', reservationId: savedReservation.id },
          );
        })
        .catch((e) => this.logger.error('[push] Error en push de check-in:', e));

      this.logger.debug(
        `Check-in QR: reserva=${reservationId} user=${reservation.userId} gym=${gymIdForCheckIn} by=${userId}`,
      );

      return { reservation: savedReservation, checkIn: savedCheckIn };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Error al procesar el check-in', {
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check-in seguro por JWT efímero del QR.
   * Orden estricto:
   *   1. verify() → lanza automáticamente si el JWT expiró o es inválido
   *   2. Extraer sub (reservationId) del payload
   *   3. Validar fecha: la reserva debe ser HOY (UTC)
   *   4. Abrir transacción + pessimistic_write por ID
   *   5. Validación de sucursal dentro del lock
   *   6. Estado CONFIRMADA dentro del lock
   *   7. Mutación atómica → COMPLETADA + CheckIn
   */
  async checkInByToken(
    token: string,
    forceCheckIn = false,
  ): Promise<{ reservation: Reservation; checkIn: CheckIn }> {
    const { userId, gymId: tokenGymId } = this.getAuthUser();
    const level = (this.request.user as any)?.level ?? 0;

    if (level < 4) {
      throw new ForbiddenException(
        'No tienes permisos para registrar ingresos.',
      );
    }

    let payload: { sub: number; gymId: number; type?: string };
    try {
      payload = this.jwtService.verify<{
        sub: number;
        gymId: number;
        type?: string;
      }>(token);
    } catch {
      throw new BadRequestException(
        'El código QR es inválido o ha expirado. El cliente debe generar uno nuevo desde la app.',
      );
    }

    if (payload.type !== 'QR_CHECK_IN') {
      throw new BadRequestException('Este código QR no corresponde a una reserva.');
    }

    const reservationId = Number(payload.sub);

    const BOT_OFFSET = -4;
    const now = new Date();
    const localMs = now.getTime() + BOT_OFFSET * 3600_000;
    const local = new Date(localMs);
    const todayLocal = local.toISOString().slice(0, 10);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const locked = await queryRunner.manager.findOne(Reservation, {
        where: { id: reservationId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!locked) {
        throw new NotFoundException('La reserva asociada a este QR no existe o fue eliminada.');
      }

      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id: locked.id },
        relations: ['gymActivitySchedule', 'gymActivitySchedule.gymActivity', 'user', 'user.profile'],
      });

      if (!reservation) {
        throw new NotFoundException('La reserva asociada a este QR no existe.');
      }

      const reservationDateStr =
        reservation.reservationDate instanceof Date
          ? reservation.reservationDate.toISOString().slice(0, 10)
          : String(reservation.reservationDate).slice(0, 10);

      const clientName = reservation.user?.profile
        ? `${reservation.user.profile.firstName ?? ''} ${reservation.user.profile.lastName ?? ''}`.trim()
        : `Usuario #${reservation.userId}`;
      const startTime = reservation.startTime ? String(reservation.startTime).substring(0, 5) : '';
      const endTime = reservation.endTime ? String(reservation.endTime).substring(0, 5) : '';
      const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : '';

      if (level >= 4 && level < 10) {
        const reservationGymId =
          reservation.gymId ??
          reservation.gymActivitySchedule?.gymActivity?.gymId ??
          null;
        const hasAccess = await this.gymBelongsToManager(reservationGymId);
        if (!hasAccess) {
          const msg = await this.buildCrossBranchErrorMsg(reservationGymId);
          throw new ForbiddenException({ code: 'TERRITORY_VIOLATION', message: msg });
        }
      }

      if (reservationDateStr < todayLocal) {
        throw new BadRequestException(
          `Esta reserva era para el ${reservationDateStr}${timeRange ? ` (${timeRange})` : ''} y ya expiró. No se puede hacer check-in de reservas pasadas.`,
        );
      }

      if (reservationDateStr > todayLocal && !forceCheckIn) {
        throw new ConflictException({
          message: `Esta reserva es para el ${reservationDateStr}${timeRange ? ` (${timeRange})` : ''}.`,
          code: 'FUTURE_RESERVATION_WARNING',
        });
      }

      const statusMap: Record<string, string> = {
        COMPLETADA: `El cliente ${clientName} ya completó el check-in de esta reserva.`,
        USADA: `Esta reserva ya fue utilizada por ${clientName}.`,
        CANCELADA: `Esta reserva fue cancelada por ${clientName}.`,
        CANCELLED: `Esta reserva fue cancelada.`,
      };
      if (reservation.status !== 'CONFIRMADA') {
        const msg = statusMap[reservation.status] ?? `Esta reserva tiene estado "${reservation.status}" y no se puede procesar.`;
        throw new BadRequestException(msg);
      }

      // ── 8. Mutación atómica ────────────────────────────────────────────────
      reservation.status = 'COMPLETADA';
      const savedReservation = await queryRunner.manager.save(
        Reservation,
        reservation,
      );

      const gymIdForCheckIn =
        reservation.gymId ??
        reservation.gymActivitySchedule?.gymActivity?.gymId ??
        Number(tokenGymId);

      const checkIn = queryRunner.manager.create(CheckIn, {
        userId: reservation.userId,
        gymId: gymIdForCheckIn,
        method: 'QR',
        status: 'COMPLETED',
        checkInTime: new Date(),
      });
      const savedCheckIn = await queryRunner.manager.save(CheckIn, checkIn);

      await queryRunner.commitTransaction();

      // Fire-and-forget: confirmar ingreso al cliente (user cargado con la relación)
      const pushToken = reservation.user?.pushToken;
      if (pushToken) {
        const actName = reservation.gymActivitySchedule?.gymActivity?.name ?? 'tu clase';
        this.pushService
          .sendPushMessage(
            pushToken,
            'Ingreso registrado',
            `Tu ingreso a ${actName} fue registrado. Disfruta tu entrenamiento.`,
            { type: 'CHECKIN_CONFIRMED', reservationId: savedReservation.id },
          )
          .catch((e) => this.logger.error('[push] Error en push de check-in QR:', e));
      }

      this.logger.debug(
        `[QR-JWT] Check-in: reserva=${reservation.id} user=${reservation.userId} gym=${gymIdForCheckIn} by=${userId}`,
      );

      return { reservation: savedReservation, checkIn: savedCheckIn };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Error al procesar el check-in', {
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Genera un JWT efímero (3 min) para el QR de check-in.
   * Solo el dueño de la reserva puede pedirlo y solo si está CONFIRMADA.
   */
  async getQrToken(reservationId: number): Promise<{ qrToken: string }> {
    const { userId } = this.getAuthUser();

    const reservation = await this.repo.findOne({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reserva ${reservationId} no encontrada.`);
    }
    if (Number(reservation.userId) !== Number(userId)) {
      throw new ForbiddenException(
        'Solo puedes obtener el QR de tus propias reservas.',
      );
    }
    if (reservation.status !== 'CONFIRMADA') {
      throw new BadRequestException(
        `La reserva tiene estado '${reservation.status}'. Solo reservas CONFIRMADA generan QR.`,
      );
    }

    const qrToken = this.jwtService.sign(
      { sub: reservation.id, gymId: reservation.gymId, type: 'QR_CHECK_IN' },
      { expiresIn: '3m' }, // ← expira en 3 minutos exactos
    );

    return { qrToken };
  }

  /**
   * Busca gerentes con pushToken asignados al gymId y les envía
   * una notificación Expo. Fire-and-forget: nunca bloquea la respuesta.
   */
  private async notifyGymManagers(
    gymId: number,
    reservationId?: number,
  ): Promise<void> {
    try {
      const tokens = await this.usersService.getManagerPushTokens(gymId);
      if (tokens.length > 0) {
        this.pushService
          .sendPushBatch(
            tokens,
            'Nueva Reserva',
            'Tienes una nueva reserva confirmada en tu sucursal.',
          )
          .catch(() => {});
        this.logger.debug(
          `[PUSH] batch de ${tokens.length} gerente(s) en gym=${gymId}`,
        );
      }

      // Emisión en tiempo real para la Web
      this.gymGateway.emitToGym(gymId, 'new_reservation', {
        message: 'Tienes una nueva reserva confirmada',
        reservationId,
        gymId,
      });
    } catch (err) {
      this.logger.warn(
        `[PUSH] Error notificando gerentes de gym=${gymId}: ${String(err)}`,
      );
    }
  }

  async bulkUpdateStatus(
    ids: number[],
    status: 'COMPLETADA' | 'FALTO',
  ): Promise<void> {
    const mg = this.managerGymId();
    const qb = this.repo
      .createQueryBuilder()
      .update(Reservation)
      .set({ status })
      .where('id IN (:...ids)', { ids });
    if (mg !== null) {
      qb.andWhere('gym_id = :gymId', { gymId: mg });
    }
    await qb.execute();
  }

  async createWalkIn(userId: number, scheduleId: number): Promise<Reservation> {
    const { userId: actorId } = this.getAuthUser();
    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId },
      relations: ['gymActivity'],
    });
    if (!schedule)
      throw new NotFoundException(`Horario ${scheduleId} no encontrado.`);

    const mg = this.managerGymId();
    if (mg !== null && schedule.gymActivity.gymId !== mg) {
      throw new ForbiddenException('El horario pertenece a otra sucursal.');
    }

    const today = new Date().toISOString().split('T')[0];

    const entity = this.repo.create({
      userId,
      gymActivityScheduleId: scheduleId,
      gymId: schedule.gymActivity.gymId,
      activityId: schedule.gymActivity.id,
      reservationDate: this.parseReservationDateOnly(today),
      startTime: String(schedule.startTime).slice(0, 5),
      endTime: String(schedule.endTime).slice(0, 5),
      status: 'COMPLETADA',
      createdBy: Number(actorId),
      qrToken: randomUUID(),
    });

    return this.repo.save(entity);
  }

  async cancel(id: number) {
    const { userId } = this.getAuthUser();
    const level = (this.request.user as any)?.level ?? 0;
    const r = await this.repo.findOne({
      where: { id },
      relations: ['gymActivitySchedule', 'gymActivitySchedule.gymActivity'],
    });

    if (!r) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }

    if (level < 4) {
      if (r.userId !== Number(userId)) {
        throw new ForbiddenException('No puedes cancelar reservas ajenas.');
      }
    } else if (level >= 4 && level < 10) {
      const reservationGymId =
        r.gymId ?? r.gymActivitySchedule?.gymActivity?.gymId ?? null;
      const hasAccess = await this.gymBelongsToManager(reservationGymId);
      if (!hasAccess) {
        const msg = await this.buildCrossBranchErrorMsg(reservationGymId);
        throw new ForbiddenException(msg);
      }
    }

    r.status = 'CANCELLED';
    r.cancelledAt = new Date();
    const saved = await this.repo.save(r);

    // Fire-and-forget: alertar al propietario de la reserva
    this.usersRepo
      .findOne({ where: { id: r.userId }, select: ['id', 'pushToken'] })
      .then((owner) => {
        if (!owner?.pushToken) return;
        const actName = r.gymActivitySchedule?.gymActivity?.name ?? 'la actividad';
        return this.pushService.sendPushMessage(
          owner.pushToken,
          'Reserva cancelada',
          `Tu reserva para ${actName} ha sido cancelada.`,
          { type: 'RESERVATION_CANCELLED', reservationId: saved.id },
        );
      })
      .catch((e) => this.logger.error('[push] Error en cancelación:', e));

    // Reload full relations for mapped response
    return this.findOne(saved.id);
  }
  async confirm(id: number) {
    const level = (this.request.user as any)?.level ?? 0;

    if (level < 4) {
      throw new ForbiddenException('Nivel jerárquico insuficiente para confirmar ingresos.');
    }

    const r = await this.repo.findOne({
      where: { id },
      relations: ['gymActivitySchedule', 'gymActivitySchedule.gymActivity'],
    });

    if (!r) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }

    if (level >= 4 && level < 10) {
      const reservationGymId = r.gymId ?? r.gymActivitySchedule?.gymActivity?.gymId ?? null;
      const hasAccess = await this.gymBelongsToManager(reservationGymId);
      if (!hasAccess) {
        const msg = await this.buildCrossBranchErrorMsg(reservationGymId);
        throw new ForbiddenException(msg);
      }
    }

    if (r.status === 'COMPLETADA' || r.status === 'CANCELADA') {
      throw new BadRequestException(`La reserva ya se encuentra ${r.status}`);
    }

    r.status = 'COMPLETADA';
    const saved = await this.repo.save(r);

    // Fire-and-forget: notificar al cliente que su asistencia fue registrada
    this.usersRepo
      .findOne({ where: { id: r.userId }, select: ['id', 'pushToken'] })
      .then((owner) => {
        if (!owner?.pushToken) return;
        const actName = r.gymActivitySchedule?.gymActivity?.name ?? 'la actividad';
        return this.pushService.sendPushMessage(
          owner.pushToken,
          'Asistencia registrada',
          `Tu asistencia a ${actName} fue registrada.`,
          { type: 'RESERVATION_COMPLETED', reservationId: saved.id },
        );
      })
      .catch((e) => this.logger.error('[push] Error en push de confirmación:', e));

    return this.findOne(saved.id);
  }
}
