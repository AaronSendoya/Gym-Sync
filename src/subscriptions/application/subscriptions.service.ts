import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { SubscriptionPlan } from '../domain/subscription-plan.entity';
import { UserSubscription } from '../domain/user-subscription.entity';
import { SubscriptionPayment } from '../domain/subscription-payment.entity';
import { MembershipFreezeLog } from '../domain/membership-freeze-log.entity';
import {
  ACTIVE_MEMBERSHIP_STATUSES,
  BLOCKING_MEMBERSHIP_STATUSES,
} from './dtos/subscriptions.dto';
import {
  getManagerGymId,
  type RequestWithUser,
} from '../../common/security/gym-scope';
import { GymGateway } from '../../notifications/infrastructure/gym.gateway';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normaliza un valor de columna 'date'/'timestamp' a 'YYYY-MM-DD', sin
 * importar si el driver de TypeORM lo devolvió como string ISO (con 'T') o
 * como objeto Date nativo — ambos ocurren según la ruta de query usada
 * (`String(dateObj)` da "Sun Jul 12 2026 00:00:00 GMT-0400..." SIN 'T', lo
 * que rompía `.split('T')[0]` y terminaba en Invalid Date al pasarlo a
 * addDaysISO). Un Date se lee por componentes LOCALES: el parser de pg para
 * columnas DATE construye `new Date(year, month-1, day)` en hora local, así
 * que getFullYear/getMonth/getDate recuperan el Y-M-D exacto sin desfase.
 */
function dateOnlyStr(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).split('T')[0];
}

/** 'YYYY-MM-DD' de hoy en hora LOCAL — nunca vía toISOString(), que puede
 * adelantar un día cerca de medianoche en zonas horarias negativas (ej.
 * Bolivia UTC-4: 21:00 local del 17 ya es 01:00 UTC del 18). */
function todayStr(): string {
  return dateOnlyStr(new Date());
}

/** Valida 'YYYY-MM-DD' y devuelve la fecha, o null si es inválida. */
function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Diferencia en días CALENDARIO entre dos fechas 'YYYY-MM-DD', ignorando la
 * hora del día. Ancla ambas fechas al mediodía (mismo patrón que addDaysISO)
 * para que un cambio de horario de verano no corra el resultado un día.
 * Ej: congelar el 16/ene y descongelar el 30/ene → 14, sin importar si
 * fueron a las 08:00 o a las 23:00 — el conteo es por día, no por hora.
 */
function dateOnlyDiffDays(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T12:00:00`);
  const to = new Date(`${toDateStr}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Parsea 'YYYY-MM'. Devuelve { year, monthIdx (0-based) } o null si inválido. */
function parseYearMonth(value: string | undefined): { year: number; monthIdx: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, monthIdx: m - 1 };
}

@Injectable({ scope: Scope.REQUEST })
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private plansRepo: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private subsRepo: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPayment)
    private paymentsRepo: Repository<SubscriptionPayment>,
    @InjectRepository(MembershipFreezeLog)
    private freezeLogsRepo: Repository<MembershipFreezeLog>,
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly gateway: GymGateway,
  ) {}

  private managerGymId(): number | null {
    return getManagerGymId(this.request);
  }

  private callerLevel(): number {
    return Number(this.request.user?.level ?? 0);
  }

  /**
   * Estado EFECTIVO para lectura, sin esperar al cron nocturno (03:00): si la
   * fila dice ACTIVA/ACTIVO pero endDate ya pasó, se muestra VENCIDA aunque
   * la columna en BD todavía no se haya actualizado. Solo compara fecha (sin
   * costo de query adicional) — el vencimiento por sesiones agotadas se
   * refleja en las vistas que ya calculan sessionsUsed (findMyActive,
   * getCheckinCalendar) y se auto-sana al intentar inscribir una nueva
   * (createSubscription). CONGELADA nunca se recalcula aquí: el congelamiento
   * pausa el reloj a propósito.
   */
  private effectiveStatus(status: string, endDate: string | Date): string {
    if (status !== 'ACTIVA' && status !== 'ACTIVO') return status;
    return dateOnlyStr(endDate) < todayStr() ? 'VENCIDA' : status;
  }

  /**
   * Variante de effectiveStatus() que TAMBIÉN cubre planes por sesiones: una
   * fila puede seguir dentro de su windowDays (no vencida por fecha) pero ya
   * sin sesiones disponibles — sin este chequeo, listas como Inscripciones o
   * el calendario de check-in mostraban "ACTIVA" para una membresía que en
   * la práctica ya no deja entrar (validateMembershipForCheckIn si la
   * bloquea), confundiendo al staff al intentar operar sobre ella (ej.
   * "Congelar" rechazándola como vencida sin que la tabla lo anticipara).
   * Solo consulta check-ins (computeSessionsUsed) cuando hace falta: filas ya
   * no-ACTIVA por fecha, o de plan por fecha (sin sessionsIncluded), no
   * pagan ese costo extra.
   */
  private async effectiveStatusWithSessions(sub: UserSubscription): Promise<string> {
    const base = this.effectiveStatus(sub.status, sub.endDate);
    if (base !== 'ACTIVA' && base !== 'ACTIVO') return base;
    if (sub.plan?.sessionsIncluded == null) return base;
    const used = await this.computeSessionsUsed(sub);
    return used >= Number(sub.plan.sessionsIncluded) ? 'VENCIDA' : base;
  }

  /**
   * Verifica si un gymId pertenece al territorio del caller (mismo criterio
   * que activities.service.ts::gymInTerritory, para que "Marca" signifique
   * lo mismo en todo el sistema):
   * - Super Admin (mg=null): siempre true.
   * - Gerente (level 5, mg=brandId): gymId === brandId  O  gym.parentId === brandId.
   * - Recepcionista (level 4, mg=gymId): igualdad estricta.
   */
  private async gymInTerritory(gymId: number): Promise<boolean> {
    const mg = this.managerGymId();
    if (mg === null) return true;
    if (Number(gymId) === mg) return true;
    if (this.callerLevel() === 5) {
      const rows: { parent_id: number | null }[] = await this.subsRepo.manager.query(
        'SELECT parent_id FROM gyms WHERE id = $1',
        [Number(gymId)],
      );
      return rows?.[0]?.parent_id === mg;
    }
    return false;
  }

  /**
   * Aplica el filtro territorial a una query de UserSubscription que ya
   * tiene 'sub.homeGym' unido con alias 'homeGym' (Gerente necesita el join
   * para el OR-parentId; Recepcionista compara directo sobre la FK).
   */
  private applyTerritoryFilter(qb: SelectQueryBuilder<UserSubscription>): void {
    const mg = this.managerGymId();
    if (mg === null) return; // Super Admin: sin filtro
    if (this.callerLevel() === 5) {
      qb.andWhere('(sub.home_gym_id = :callerGymId OR homeGym.parent_id = :callerGymId)', {
        callerGymId: mg,
      });
    } else {
      qb.andWhere('sub.home_gym_id = :callerGymId', { callerGymId: mg });
    }
  }

  /** Un plan es por fecha (durationDays) O por sesiones (sessionsIncluded + windowDays), nunca ambos ni ninguno. */
  private assertPlanShape(data: Partial<SubscriptionPlan>): void {
    const byDate = data.durationDays != null;
    const bySessions = data.sessionsIncluded != null;
    if (byDate === bySessions) {
      throw new BadRequestException(
        'El plan debe ser por fecha (durationDays) o por sesiones (sessionsIncluded), exactamente uno de los dos.',
      );
    }
    if (bySessions && data.windowDays == null) {
      throw new BadRequestException(
        'Los planes por sesiones requieren windowDays (ventana en días para consumirlas).',
      );
    }
  }

  /**
   * Autoriza gestión (crear/editar) de un plan según su sucursal dueña:
   *  - gymId null (plan GLOBAL): solo Super Admin.
   *  - gymId sucursal: debe pertenecer al territorio del caller.
   */
  private async assertCanManagePlanGym(gymId: number | null): Promise<void> {
    const mg = this.managerGymId();
    if (gymId === null) {
      if (mg !== null) {
        throw new ForbiddenException(
          'Solo el administrador de la red gestiona planes globales.',
        );
      }
      return;
    }
    if (!(await this.gymInTerritory(Number(gymId)))) {
      throw new ForbiddenException(
        'La sucursal del plan no pertenece a tu territorio.',
      );
    }
  }

  async createPlan(data: Partial<SubscriptionPlan>) {
    const mg = this.managerGymId();
    const level = this.callerLevel();
    const merged = { ...data };

    // Alcance de acceso (scope): Recepcionista NO tiene autoridad sobre otras
    // sucursales de su marca — no puede otorgar acceso MARCA (VIP multi-sede)
    // sin importar lo que envíe el body. Server-side, no solo UI oculta.
    if (level === 4) {
      merged.scope = 'SUCURSAL';
    }

    // Sucursal dueña según nivel (mismo criterio que inscripciones):
    //  - Recepcionista (4): SIEMPRE su sucursal.
    //  - Gerente (5): obligatoria y de su marca.
    //  - Super Admin: la que envíe, u omitida = plan GLOBAL de la red.
    if (level === 4) {
      merged.gymId = mg;
    } else if (level === 5) {
      if (merged.gymId === undefined || merged.gymId === null) {
        throw new BadRequestException(
          'Debes seleccionar la sucursal dueña del plan.',
        );
      }
      if (!(await this.gymInTerritory(Number(merged.gymId)))) {
        throw new ForbiddenException(
          'La sucursal seleccionada no pertenece a tu marca.',
        );
      }
    } else {
      merged.gymId = merged.gymId ?? null; // Super Admin: null = global
    }

    this.assertPlanShape(merged);
    return this.plansRepo.save(this.plansRepo.create(merged));
  }

  async updatePlan(id: number, data: Partial<SubscriptionPlan>) {
    const plan = await this.findOnePlan(id);

    // El plan actual debe estar bajo mi jurisdicción...
    await this.assertCanManagePlanGym(plan.gymId ?? null);
    // ...y si intenta moverlo de sucursal, la nueva también.
    if (data.gymId !== undefined) {
      await this.assertCanManagePlanGym(data.gymId ?? null);
    }

    // Recepcionista no puede escalar un plan existente a alcance MARCA.
    if (this.callerLevel() === 4) {
      data.scope = 'SUCURSAL';
    }

    const merged = { ...plan, ...data };
    this.assertPlanShape(merged);
    Object.assign(plan, data);
    return this.plansRepo.save(plan);
  }

  async deletePlan(id: number) {
    const plan = await this.findOnePlan(id);
    await this.assertCanManagePlanGym(plan.gymId ?? null);

    // FK RESTRICT en user_subscriptions.plan_id: si algún cliente lo usó
    // (activo o histórico) el plan no se puede borrar sin romper integridad.
    const inUse = await this.subsRepo.count({ where: { planId: id } });
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar: ${inUse} inscripción(es) ya usan este plan. Solo se puede eliminar un plan sin inscripciones asociadas.`,
      );
    }

    await this.plansRepo.remove(plan);
    return { success: true };
  }

  /**
   * Catálogo visible por territorio: los GLOBALES (gym_id null) para todos;
   * Gerente además los de las sucursales de su marca; Recepcionista los de
   * su sucursal. Super Admin ve todo.
   *
   * Paginación OPCIONAL: sin `params.limit`, devuelve el array completo (uso
   * de InscribirTab, que necesita el catálogo entero para filtrar en cliente
   * por sucursal elegida). Con `params.limit`, devuelve `{data, meta}` — uso
   * de Gestión de Planes (tabla paginada, mismo patrón que Inscripciones).
   */
  findAllPlans(params: { limit?: number; offset?: number; search?: string } = {}) {
    const mg = this.managerGymId();
    const qb = this.plansRepo
      .createQueryBuilder('plan')
      .leftJoinAndSelect('plan.gym', 'gym')
      .orderBy('plan.id', 'ASC');

    if (mg !== null) {
      if (this.callerLevel() === 5) {
        qb.where('(plan.gym_id IS NULL OR plan.gym_id = :mg OR gym.parent_id = :mg)', { mg });
      } else {
        qb.where('(plan.gym_id IS NULL OR plan.gym_id = :mg)', { mg });
      }
    }

    if (params.search?.trim()) {
      qb.andWhere('plan.name ILIKE :search', { search: `%${params.search.trim()}%` });
    }

    if (params.limit == null) {
      return qb.getMany();
    }

    const take = Math.min(Math.max(Number(params.limit) || 20, 1), 200);
    const skip = Math.max(Number(params.offset) || 0, 0);
    return qb
      .take(take)
      .skip(skip)
      .getManyAndCount()
      .then(([data, total]) => ({ data, meta: { total, limit: take, offset: skip } }));
  }

  async findOnePlan(id: number) {
    const p = await this.plansRepo.findOne({ where: { id }, relations: ['gym'] });
    if (!p) throw new NotFoundException(`Plan ${id} no encontrado`);
    return p;
  }

  async createSubscription(data: any) {
    const mg = this.managerGymId();
    const merged = { ...data };

    if (mg !== null) {
      if (this.callerLevel() === 5) {
        // Gerente: debe elegir una sucursal de su marca (igual que activities.service.createActivity).
        if (!merged.homeGymId) {
          throw new BadRequestException(
            'Debes seleccionar una sucursal para inscribir la membresía.',
          );
        }
        if (!(await this.gymInTerritory(Number(merged.homeGymId)))) {
          throw new ForbiddenException(
            'La sucursal seleccionada no pertenece a tu marca.',
          );
        }
      } else {
        // Recepcionista (level 4): siempre fuerza su propia sucursal.
        merged.homeGymId = mg;
      }
    }

    // El plan debe ser usable en la sucursal de inscripción: global (sin
    // sucursal dueña) o propio de esa sucursal. Un plan de la sucursal A no
    // se vende en la sucursal B.
    const plan = await this.plansRepo.findOne({ where: { id: Number(merged.planId) } });
    if (!plan) throw new NotFoundException(`Plan ${merged.planId} no encontrado`);
    if (
      plan.gymId !== null &&
      merged.homeGymId != null &&
      Number(plan.gymId) !== Number(merged.homeGymId)
    ) {
      throw new BadRequestException(
        'El plan seleccionado pertenece a otra sucursal. Elige un plan de la sucursal de inscripción o un plan global.',
      );
    }

    // Fechas: el VENCIMIENTO lo calcula SIEMPRE el servidor desde el plan —
    // nunca se confía en un endDate enviado por el cliente (membresía eterna).
    if (!parseDateOnly(merged.startDate)) {
      throw new BadRequestException('startDate inválida. Formato requerido: YYYY-MM-DD.');
    }
    const vigenciaDias = plan.durationDays ?? plan.windowDays;
    if (vigenciaDias == null || vigenciaDias < 1) {
      throw new BadRequestException('El plan no define una duración válida.');
    }
    merged.endDate = addDaysISO(String(merged.startDate), Number(vigenciaDias));
    // Toda membresía nace ACTIVA — nunca se confía en un status enviado por
    // el cliente. CONGELADA solo es válido vía updateSubscription (que además
    // setea frozenAt); aceptarlo aquí crearía una fila CONGELADA sin frozenAt,
    // rompiendo silenciosamente el cálculo de días al descongelar.
    merged.status = 'ACTIVA';

    // Regla de negocio: UNA membresía vigente (activa o congelada) a la vez.
    // Check + INSERT atómicos con lock sobre la fila del usuario (anti-TOCTOU,
    // mismo patrón que workout_sessions); el índice único parcial
    // uq_active_membership_per_user es la red de seguridad a nivel de BD.
    return this.subsRepo.manager.transaction(async (em) => {
      await em.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        Number(merged.userId),
      ]);

      const existing = await em.findOne(UserSubscription, {
        where: {
          userId: Number(merged.userId),
        },
        relations: ['plan'],
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        let isBlocking = [...BLOCKING_MEMBERSHIP_STATUSES].includes(existing.status as any);

        if (isBlocking && (existing.status === 'ACTIVA' || existing.status === 'ACTIVO')) {
          let expired = dateOnlyStr(existing.endDate) < todayStr();
          if (!expired && existing.plan?.sessionsIncluded != null) {
            const used = await this.computeSessionsUsed(existing);
            expired = used >= Number(existing.plan.sessionsIncluded);
          }
          if (expired) {
            existing.status = 'VENCIDA';
            isBlocking = false;
          }
        }

        if (isBlocking) {
          throw new ConflictException(
            existing.status === 'CONGELADA'
              ? 'El cliente tiene una membresía congelada. Descongélala o cancélala antes de inscribir una nueva.'
              : 'El cliente ya tiene una membresía activa. Cancélala o espera a que venza antes de inscribir una nueva.',
          );
        }

        // Reutilizar el registro existente
        existing.planId = Number(merged.planId);
        existing.homeGymId = (merged.homeGymId != null ? Number(merged.homeGymId) : null) as any;
        existing.startDate = merged.startDate;
        existing.endDate = merged.endDate;
        existing.status = merged.status ?? 'ACTIVA';
        existing.autoRenew = merged.autoRenew ?? false;
        existing.reminderSent = false;
        existing.frozenAt = null;

        return em.save(UserSubscription, existing);
      }

      return em.save(em.create(UserSubscription, merged));
    });
  }

  /**
   * Sesiones reales consumidas: check-ins del usuario dentro de la vigencia.
   * Scope SUCURSAL: solo cuentan ingresos en la sucursal de inscripción.
   * Scope MARCA: cuentan ingresos en cualquier sucursal de la misma marca.
   */
  async computeSessionsUsed(sub: UserSubscription): Promise<number> {
    try {
      const params: any[] = [sub.userId, sub.startDate, sub.endDate];
      let gymFilter = '';
      if (sub.homeGymId != null) {
        params.push(sub.homeGymId);
        if (sub.plan?.scope === 'MARCA') {
          // Sucursales de la marca a la que pertenece la sucursal de inscripción
          gymFilter = `AND gym_id IN (
            SELECT g2.id FROM gyms g2
            WHERE g2.id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $4)
               OR g2.parent_id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $4)
          )`;
        } else {
          gymFilter = 'AND gym_id = $4';
        }
      }
      const rows: { c: string }[] = await this.subsRepo.manager.query(
        `SELECT COUNT(*) AS c
         FROM check_ins
         WHERE user_id = $1
           AND check_in_time >= $2::date
           AND check_in_time < ($3::date + INTERVAL '1 day')
           ${gymFilter}`,
        params,
      );
      return Number(rows?.[0]?.c ?? 0);
    } catch {
      // El conteo es informativo: un fallo no debe tumbar el endpoint
      return 0;
    }
  }

  /**
   * Calendario mensual de check-ins de la membresía de un cliente — tarjeta
   * visual tipo "carnet de gimnasio". Devuelve la grilla del mes solicitado
   * (o el actual) con la cantidad real de días (28-31) y qué días el cliente
   * registró al menos un ingreso.
   *
   * Territorio: reutiliza findByUser (Recepcionista/Gerente solo ven clientes
   * con membresía en su territorio — mismo criterio que la lista de Usuarios).
   * Devuelve null si el cliente no tiene ninguna membresía (nunca 403/404:
   * el botón "info" vive en una fila que el caller ya puede ver).
   */
  async getCheckinCalendar(userId: number, monthParam?: string) {
    const subs = await this.findByUser(userId);
    if (subs.length === 0) return null;

    const sub =
      subs.find((s) => (BLOCKING_MEMBERSHIP_STATUSES as readonly string[]).includes(s.status)) ??
      [...subs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    const now = new Date();
    const parsed = parseYearMonth(monthParam);
    const year = parsed?.year ?? now.getFullYear();
    const monthIdx = parsed?.monthIdx ?? now.getMonth(); // 0-based
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const monthStart = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;

    let checkedInDays: number[] = [];
    try {
      const params: any[] = [Number(sub.userId), monthStart];
      let gymFilter = '';
      if (sub.homeGymId != null) {
        params.push(sub.homeGymId);
        gymFilter =
          sub.plan?.scope === 'MARCA'
            ? `AND gym_id IN (
                 SELECT g2.id FROM gyms g2
                 WHERE g2.id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $3)
                    OR g2.parent_id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $3)
               )`
            : 'AND gym_id = $3';
      }
      // membership_checkins — INDEPENDIENTE de check_ins (reservas/recepción).
      // Hoy siempre vacía: sin endpoint de escritura todavía (llegará con el
      // reconocimiento facial). El calendario no debe mezclar ambos conceptos.
      const rows: { day: number }[] = await this.subsRepo.manager.query(
        `SELECT DISTINCT EXTRACT(DAY FROM checked_in_at)::int AS day
         FROM membership_checkins
         WHERE user_id = $1
           AND checked_in_at >= $2::date
           AND checked_in_at < ($2::date + INTERVAL '1 month')
           ${gymFilter}
         ORDER BY day`,
        params,
      );
      checkedInDays = rows.map((r) => r.day);
    } catch {
      // La grilla se muestra igual sin marcas si la consulta de check-ins falla
      checkedInDays = [];
    }

    const isCurrentMonth = year === now.getFullYear() && monthIdx === now.getMonth();

    return {
      subscriptionId: sub.id,
      userId: sub.userId,
      clientName: `${sub.user?.profile?.firstName ?? ''} ${sub.user?.profile?.lastName ?? ''}`.trim() || sub.user?.email || null,
      planName: sub.plan?.name ?? 'Plan',
      // SESIONES → rojo (plan ejecutivo/especial). FECHA → naranja (regular).
      planKind: sub.plan?.sessionsIncluded != null ? 'SESIONES' : 'FECHA',
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      homeGymName: sub.homeGym?.name ?? null,
      year,
      month: monthIdx + 1,
      daysInMonth,
      checkedInDays,
      todayDay: isCurrentMonth ? now.getDate() : null,
    };
  }

  /**
   * Valida si un cliente puede ingresar a una sucursal por su MEMBRESÍA
   * (usado por el check-in, además de la vía de reserva de clase).
   *  - Debe existir suscripción ACTIVA vigente por fecha.
   *  - Scope SUCURSAL: la sucursal debe ser la de inscripción.
   *  - Scope MARCA: la sucursal debe pertenecer a la misma marca.
   *  - Plan por sesiones: deben quedar sesiones disponibles.
   */
  async validateMembershipForCheckIn(
    userId: number,
    gymId: number,
  ): Promise<{ allowed: boolean; reason: string }> {
    const sub = await this.subsRepo.findOne({
      where: { userId, status: In([...ACTIVE_MEMBERSHIP_STATUSES]) },
      relations: ['plan', 'homeGym'],
      order: { createdAt: 'DESC' },
    });

    if (!sub) {
      return {
        allowed: false,
        reason: 'El cliente no tiene una reserva activa para hoy ni una membresía vigente.',
      };
    }

    const today = todayStr();
    const startStr = dateOnlyStr(sub.startDate);
    const endStr = dateOnlyStr(sub.endDate);
    if (startStr > today) {
      return {
        allowed: false,
        reason: `La membresía del cliente inicia el ${startStr}. Aún no está vigente.`,
      };
    }
    if (endStr < today) {
      return {
        allowed: false,
        reason: 'La membresía del cliente está vencida. Debe renovarla en recepción.',
      };
    }

    // ── Cobertura territorial según scope del plan ─────────────────────────
    if (sub.homeGymId != null) {
      if (sub.plan?.scope === 'MARCA') {
        const rows: { same: boolean }[] = await this.subsRepo.manager.query(
          `SELECT (
             (SELECT COALESCE(g.parent_id, g.id) FROM gyms g WHERE g.id = $1) =
             (SELECT COALESCE(g.parent_id, g.id) FROM gyms g WHERE g.id = $2)
           ) AS same`,
          [Number(gymId), Number(sub.homeGymId)],
        );
        if (!rows?.[0]?.same) {
          return {
            allowed: false,
            reason: 'La membresía del cliente pertenece a otra marca. No es válida en esta sucursal.',
          };
        }
      } else if (Number(sub.homeGymId) !== Number(gymId)) {
        return {
          allowed: false,
          reason: `La membresía del cliente solo es válida en ${sub.homeGym?.name ?? 'su sucursal de inscripción'}.`,
        };
      }
    }

    // ── Planes por sesiones: verificar saldo ───────────────────────────────
    if (sub.plan?.sessionsIncluded != null) {
      const used = await this.computeSessionsUsed(sub);
      if (used >= Number(sub.plan.sessionsIncluded)) {
        return {
          allowed: false,
          reason: 'El cliente agotó las sesiones de su plan. Debe renovarlo en recepción.',
        };
      }
    }

    return { allowed: true, reason: '' };
  }

  /**
   * Membresía activa del propio caller, enriquecida para la app móvil.
   * Devuelve null (200) si no tiene — el mobile muestra su estado vacío.
   */
  async findMyActive(userId: number) {
    const sub = await this.subsRepo.findOne({
      where: { userId, status: In([...ACTIVE_MEMBERSHIP_STATUSES]) },
      relations: ['plan', 'homeGym', 'homeGym.parent'],
      order: { createdAt: 'DESC' },
    });
    if (!sub) return null;

    // Conteo por fecha CALENDARIO, no por hora exacta — mismo criterio que
    // dateOnlyDiffDays en el resto del módulo (congelar/descongelar). El
    // cálculo anterior (Date con hora exacta + padding a las 23:59:59 del
    // vencimiento + Math.ceil) inflaba el conteo hasta en 1 día según la
    // hora del día en que se consultara: un plan de 30 días mostraba "31
    // días restantes" el mismo día de la inscripción.
    const daysRemaining = Math.max(0, dateOnlyDiffDays(todayStr(), dateOnlyStr(sub.endDate)));

    const bySessions = sub.plan?.sessionsIncluded != null;
    const sessionsUsed = bySessions ? await this.computeSessionsUsed(sub) : null;

    // Estado efectivo completo: sessionsUsed ya se calculó arriba sin costo
    // extra, así que aquí sí se refleja también el vencimiento por sesiones
    // agotadas (no solo por fecha), sin esperar al cron nocturno.
    let effectiveStatus = this.effectiveStatus(sub.status, sub.endDate);
    if (
      effectiveStatus !== 'VENCIDA' &&
      bySessions &&
      sessionsUsed !== null &&
      sessionsUsed >= Number(sub.plan!.sessionsIncluded)
    ) {
      effectiveStatus = 'VENCIDA';
    }

    return {
      id: sub.id,
      status: effectiveStatus,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysRemaining,
      homeGymName: sub.homeGym?.name ?? null,
      brandName: sub.homeGym?.parent?.name ?? sub.homeGym?.name ?? null,
      plan: {
        id: sub.plan?.id ?? sub.planId,
        name: sub.plan?.name ?? 'Plan',
        priceMonthly: sub.plan?.priceMonthly != null ? Number(sub.plan.priceMonthly) : null,
        durationDays: sub.plan?.durationDays ?? null,
        sessionsIncluded: sub.plan?.sessionsIncluded ?? null,
        windowDays: sub.plan?.windowDays ?? null,
        scope: sub.plan?.scope ?? 'SUCURSAL',
      },
      sessionsUsed,
      sessionsRemaining:
        bySessions && sessionsUsed !== null
          ? Math.max(0, Number(sub.plan!.sessionsIncluded) - sessionsUsed)
          : null,
    };
  }

  async findAllSubscriptions(params: {
    limit?: number;
    offset?: number;
    search?: string;
    gymId?: number;
    date?: string;
    status?: string;
  } = {}) {
    const take = Math.min(Math.max(Number(params.limit) || 100, 1), 200);
    const skip = Math.max(Number(params.offset) || 0, 0);

    const qb = this.subsRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoinAndSelect('sub.homeGym', 'homeGym')
      .leftJoinAndSelect('homeGym.parent', 'brand')
      .orderBy('sub.createdAt', 'DESC')
      .take(take)
      .skip(skip);

    this.applyTerritoryFilter(qb);

    if (params.search?.trim()) {
      qb.andWhere(
        "(CONCAT(profile.first_name, ' ', profile.last_name) ILIKE :search OR user.email ILIKE :search)",
        { search: `%${params.search.trim()}%` },
      );
    }
    if (params.gymId) {
      qb.andWhere('sub.home_gym_id = :gymId', { gymId: Number(params.gymId) });
    }
    if (params.date && parseDateOnly(params.date)) {
      qb.andWhere('sub.start_date <= :date AND sub.end_date >= :date', { date: params.date });
    }
    if (params.status?.trim()) {
      qb.andWhere('sub.status = :status', { status: params.status.trim() });
    }

    const [data, total] = await qb.getManyAndCount();
    // Estado efectivo por fecha Y sesiones agotadas, sin esperar al cron
    // nocturno — ver effectiveStatusWithSessions(). En paralelo: solo paga el
    // costo de computeSessionsUsed() para filas ACTIVA de plan por sesiones,
    // el resto resuelve sin query extra. Mutación segura: instancias recién
    // materializadas por esta query, nunca se guardan de nuevo en este método.
    await Promise.all(
      data.map(async (sub) => {
        sub.status = await this.effectiveStatusWithSessions(sub);
      }),
    );
    return { data, meta: { total, limit: take, offset: skip } };
  }

  async findByUser(userId: number) {
    const callerLevel = this.callerLevel();
    const callerId = Number(this.request.user?.userId ?? 0);

    const qb = this.subsRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.user', 'subUser')
      .leftJoinAndSelect('subUser.profile', 'subUserProfile')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoinAndSelect('sub.homeGym', 'homeGym')
      .where('sub.user_id = :userId', { userId });

    // Staff administrativo: limitado a su territorio (marca + sucursales
    // hijas para Gerente). El propio cliente siempre puede consultarse a sí
    // mismo (membresía transversal).
    if (callerLevel >= 4 && callerLevel < 10) {
      this.applyTerritoryFilter(qb);
    } else if (callerLevel < 4 && callerId !== Number(userId)) {
      throw new ForbiddenException('Solo puedes consultar tus propias suscripciones.');
    }

    const list = await qb.getMany();
    // effectiveStatusWithSessions: mismo motivo que findAllSubscriptions —
    // getCheckinCalendar depende de este status para elegir la fila
    // bloqueante, así que también debe reflejar sesiones agotadas.
    await Promise.all(
      list.map(async (sub) => {
        sub.status = await this.effectiveStatusWithSessions(sub);
      }),
    );
    return list;
  }

  /**
   * Nombre del plan bloqueante (ACTIVA/ACTIVO/CONGELADA) de cada userId dado,
   * o null si no tiene ninguno. Usado por el buscador de "Inscribir Cliente"
   * para avisar antes de intentar inscribir a alguien que ya tiene membresía
   * — sin esto el staff solo se entera al chocar con el 409 de
   * uq_active_membership_per_user. Global a propósito (no territorial): el
   * índice único que evita duplicados es global, así que el aviso debe serlo
   * también sin importar en qué sucursal esté la membresía existente.
   */
  async findActivePlanNamesByUserIds(userIds: number[]): Promise<Record<number, string | null>> {
    const result: Record<number, string | null> = {};
    userIds.forEach((id) => { result[id] = null; });
    if (userIds.length === 0) return result;

    const rows = await this.subsRepo
      .createQueryBuilder('sub')
      .innerJoin('sub.plan', 'plan')
      .select('sub.user_id', 'userId')
      .addSelect('plan.name', 'planName')
      .where('sub.user_id IN (:...userIds)', { userIds })
      .andWhere('sub.status IN (:...st)', { st: [...BLOCKING_MEMBERSHIP_STATUSES] })
      .getRawMany<{ userId: number; planName: string }>();

    rows.forEach((r) => { result[Number(r.userId)] = r.planName; });
    return result;
  }

  async findOneSubscription(id: number) {
    const mg = this.managerGymId();

    const qb = this.subsRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.user', 'user')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoinAndSelect('sub.homeGym', 'homeGym')
      .where('sub.id = :id', { id });

    this.applyTerritoryFilter(qb);

    const s = await qb.getOne();
    if (s) return s;

    if (mg !== null) {
      const exists = await this.subsRepo.exist({ where: { id } });
      if (exists)
        throw new ForbiddenException(
          'No tiene permisos para acceder a esta suscripción',
        );
    }

    throw new NotFoundException(`Suscripción ${id} no encontrada`);
  }

  async updateSubscription(id: number, data: any) {
    // findOneSubscription ya aplica el filtro territorial (marca+hijas para
    // Gerente) y lanza 403/404 si la suscripción está fuera de alcance.
    const s = await this.findOneSubscription(id);

    if (data?.homeGymId !== undefined && data?.homeGymId !== null) {
      if (!(await this.gymInTerritory(Number(data.homeGymId)))) {
        throw new ForbiddenException(
          'No puede mover la suscripción a una sucursal fuera de su territorio.',
        );
      }
    }

    const prevStatus = s.status;
    const prevEndDate = dateOnlyStr(s.endDate);

    // Congelar: registrar el inicio del congelamiento. Solo permitido desde
    // ACTIVA y EN VIGENCIA — ni la UI (el botón solo aparece en filas
    // ACTIVA/CONGELADA) ni el status crudo en BD alcanzan por sí solos: una
    // fila puede seguir marcada 'ACTIVA' en BD aunque ya venció por fecha o
    // agotó sus sesiones (el cron nocturno todavía no la pasó a VENCIDA), y
    // sin este chequeo se podía "congelar" una membresía muerta vía llamada
    // directa a la API, reviviéndola con una fecha de vencimiento absurda al
    // descongelar. Mismo criterio de vencimiento que createSubscription.
    const isFreezing = data?.status === 'CONGELADA' && prevStatus !== 'CONGELADA';
    if (isFreezing) {
      if (prevStatus !== 'ACTIVA' && prevStatus !== 'ACTIVO') {
        throw new BadRequestException(
          `Solo se puede congelar una membresía ACTIVA. Esta membresía está ${prevStatus.toLowerCase()}.`,
        );
      }
      let expired = dateOnlyStr(s.endDate) < todayStr();
      if (!expired && s.plan?.sessionsIncluded != null) {
        const used = await this.computeSessionsUsed(s);
        expired = used >= Number(s.plan.sessionsIncluded);
      }
      if (expired) {
        throw new BadRequestException(
          'No se puede congelar: la membresía ya está vencida (fuera de vigencia).',
        );
      }
      s.frozenAt = new Date();
    }

    Object.assign(s, data);

    // Descongelar (CONGELADA → ACTIVA): extender el vencimiento por los días
    // congelados — el propósito comercial de congelar. Solo si el caller no
    // envió un endDate explícito (ese manda).
    //
    // Cálculo por FECHA CALENDARIO, no por hora exacta: congelar el 16/ene y
    // descongelar el 30/ene siempre da 14 días, sin importar la hora del día
    // en que se presionó cada botón. dateOnlyDiffDays ancla ambas fechas al
    // mediodía (como parseDateOnly/addDaysISO) para evitar que un cambio de
    // horario de verano corra el resultado un día.
    const isUnfreezing = prevStatus === 'CONGELADA' && data?.status === 'ACTIVA';
    let frozenDays: number | null = null;
    if (isUnfreezing && s.frozenAt && data?.endDate === undefined) {
      const frozenDateStr = dateOnlyStr(s.frozenAt);
      frozenDays = Math.max(0, dateOnlyDiffDays(frozenDateStr, todayStr()));
      s.endDate = addDaysISO(prevEndDate, frozenDays) as any;
    }
    if (data?.status === 'ACTIVA') {
      s.frozenAt = null;
    }

    // Renovación/extensión: si el vencimiento cambió, el recordatorio previo
    // ya no aplica — rearmar el flag para que el cron vuelva a avisar.
    const newEndDate = dateOnlyStr(s.endDate);
    if (newEndDate !== prevEndDate) {
      s.reminderSent = false;
    }

    // Reactivación (→ ACTIVA desde un estado no vigente) + guardado: mismo
    // patrón anti-TOCTOU que createSubscription (lock sobre la fila del
    // usuario). Sin esto, dos PUT concurrentes reactivando DOS suscripciones
    // distintas del mismo cliente podían pasar ambas el chequeo de unicidad
    // antes de que cualquiera guardara, dejando dos membresías vigentes — el
    // índice único parcial de BD lo hubiera bloqueado igual, pero como un 500
    // crudo en vez de un 409 claro (ver http-exception.filter.ts).
    const isReactivating =
      data?.status === 'ACTIVA' && !BLOCKING_MEMBERSHIP_STATUSES.includes(prevStatus as any);
    const saved = await this.subsRepo.manager.transaction(async (em) => {
      await em.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [Number(s.userId)]);

      if (isReactivating) {
        const other = await em
          .createQueryBuilder(UserSubscription, 'sub')
          .where('sub.user_id = :uid', { uid: s.userId })
          .andWhere('sub.id != :id', { id: s.id })
          .andWhere('sub.status IN (:...st)', { st: [...BLOCKING_MEMBERSHIP_STATUSES] })
          .getExists();
        if (other) {
          throw new ConflictException(
            'El cliente ya tiene otra membresía vigente. No se puede reactivar esta.',
          );
        }
      }

      return em.save(UserSubscription, s);
    });

    // Historial PERMANENTE de congelamientos — independiente de la fila de
    // la membresía (que solo guarda el congelamiento vigente en frozenAt, y
    // se borra al descongelar). No debe bloquear la operación principal si
    // falla: es un registro de auditoría, no una regla de negocio.
    if (isFreezing || isUnfreezing) {
      try {
        await this.freezeLogsRepo.save(
          this.freezeLogsRepo.create({
            subscriptionId: saved.id,
            userId: saved.userId,
            homeGymId: saved.homeGymId ?? null,
            performedByUserId: Number(this.request.user?.userId) || null,
            action: isFreezing ? 'CONGELAR' : 'DESCONGELAR',
            daysFrozen: frozenDays,
            previousEndDate: isUnfreezing ? prevEndDate : null,
            newEndDate: isUnfreezing ? newEndDate : null,
          }),
        );
      } catch {
        // No propagar: el congelamiento/descongelamiento ya se guardó.
      }

      // Tiempo real: el cliente puede tener la pantalla "Mi Membresía" abierta
      // en ese momento — sin este evento, solo vería el cambio al hacer pull
      // to refresh o al reabrir la pantalla (staleTime 5 min). Mismo patrón
      // que las notificaciones de asesorías (StaffService.notifyAdvisoryChange).
      try {
        this.gateway.emitToUser(saved.userId, 'membership_status_changed', {
          subscriptionId: saved.id,
          status: saved.status,
        });
      } catch {
        // No propagar: el WS es una mejora de UX, no una regla de negocio.
      }
    }

    return saved;
  }

  /**
   * Historial permanente de congelamientos/descongelamientos, filtrado por
   * territorio (mismo criterio que el resto del módulo): Recepcionista su
   * sucursal, Gerente marca+hijas, Super Admin todo.
   */
  async findFreezeLogs(params: { limit?: number; offset?: number; search?: string } = {}) {
    const take = Math.min(Math.max(Number(params.limit) || 100, 1), 200);
    const skip = Math.max(Number(params.offset) || 0, 0);

    const qb = this.freezeLogsRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('log.performedBy', 'performedBy')
      .leftJoinAndSelect('performedBy.profile', 'performedByProfile')
      .leftJoinAndSelect('log.homeGym', 'homeGym')
      .orderBy('log.occurredAt', 'DESC')
      .take(take)
      .skip(skip);

    const mg = this.managerGymId();
    if (mg !== null) {
      if (this.callerLevel() === 5) {
        qb.andWhere('(log.home_gym_id = :callerGymId OR homeGym.parent_id = :callerGymId)', {
          callerGymId: mg,
        });
      } else {
        qb.andWhere('log.home_gym_id = :callerGymId', { callerGymId: mg });
      }
    }

    // Búsqueda por nombre/email — del cliente afectado O de quién realizó la acción.
    if (params.search?.trim()) {
      qb.andWhere(
        `(CONCAT(profile.first_name, ' ', profile.last_name) ILIKE :search
          OR user.email ILIKE :search
          OR CONCAT(performedByProfile.first_name, ' ', performedByProfile.last_name) ILIKE :search
          OR performedBy.email ILIKE :search)`,
        { search: `%${params.search.trim()}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, limit: take, offset: skip } };
  }

  async createPayment(data: any) {
    // Valida existencia Y territorio del caller — findOneSubscription lanza
    // 403/404 si la suscripción no está bajo su jurisdicción (anti-IDOR,
    // misma protección que findPaymentsBySubscription).
    await this.findOneSubscription(Number(data.subscriptionId));

    // Mapeo DTO → entidad: el DTO expone paymentMethod; la columna es method.
    return this.paymentsRepo.save(
      this.paymentsRepo.create({
        subscriptionId: Number(data.subscriptionId),
        amount: data.amount,
        currency: data.currency ?? 'BOB',
        method: data.paymentMethod ?? data.method ?? null,
        transactionReference: data.transactionReference ?? null,
        status: data.status ?? 'PAGADO',
      }),
    );
  }

  async findPaymentsBySubscription(subscriptionId: number) {
    await this.findOneSubscription(subscriptionId);
    return this.paymentsRepo.find({
      where: { subscriptionId },
      order: { paymentDate: 'DESC' },
      take: 50,
    });
  }
}
