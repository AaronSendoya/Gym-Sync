import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserSubscription } from '../domain/user-subscription.entity';
import { User } from '../../users/domain/user.entity';
import { ACTIVE_MEMBERSHIP_STATUSES } from './dtos/subscriptions.dto';
import { PushNotificationsService } from '../../push-notifications/application/push-notifications.service';

type ExpiredEntry = {
  subscriptionId: number;
  gymId: number | null;
  gymName: string | null;
  brandId: number | null;
  brandName: string | null;
};

/**
 * Expiración automática de membresías. Sin esto, la regla "una activa a la
 * vez" bloquearía al cliente con una fila vencida que nadie marcó VENCIDA.
 *
 * Dos causas de vencimiento:
 *  1. Por fecha: end_date quedó en el pasado.
 *  2. Por sesiones: el cliente consumió todas las sesiones incluidas del plan
 *     (conteo de check-ins reales dentro de la vigencia).
 *
 * Al final del ciclo, notifica por push (resumen diario, no una por cliente)
 * al staff territorialmente responsable de cada vencimiento: Recepcionista
 * (nivel 4) de la sucursal exacta, Gerente (nivel 5) de la marca — igual
 * criterio de territorio que gym-scope.ts/subscriptions.service.ts.
 */
@Injectable()
export class MembershipExpirationService {
  private readonly logger = new Logger(MembershipExpirationService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly subsRepo: Repository<UserSubscription>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly pushSvc: PushNotificationsService,
  ) {}

  @Cron('0 3 * * *') // diario, 03:00
  async expireMemberships(): Promise<void> {
    const newlyExpired: ExpiredEntry[] = [];

    try {
      // ── 1. Vencidas por fecha ─────────────────────────────────────────────
      // Se selecciona primero (en vez de un UPDATE masivo) para poder armar el
      // resumen de notificaciones con la sucursal/marca de cada fila afectada.
      // El filtro de fecha se resuelve en SQL (CURRENT_DATE) para evitar el
      // desfase de comparar en JS con la zona horaria del proceso Node.
      const expiredByDate = await this.subsRepo
        .createQueryBuilder('sub')
        .leftJoinAndSelect('sub.homeGym', 'homeGym')
        .leftJoinAndSelect('homeGym.parent', 'brand')
        .where('sub.status IN (:...st)', { st: [...ACTIVE_MEMBERSHIP_STATUSES] })
        .andWhere('sub.end_date < CURRENT_DATE')
        .getMany();

      for (const sub of expiredByDate) {
        sub.status = 'VENCIDA';
        newlyExpired.push(this.toExpiredEntry(sub));
      }
      if (expiredByDate.length) {
        await this.subsRepo.save(expiredByDate);
        this.logger.log(`[expiration] ${expiredByDate.length} membresía(s) vencida(s) por fecha.`);
      }

      // ── 2. Vencidas por sesiones agotadas ────────────────────────────────
      const candidates = await this.subsRepo.find({
        where: { status: In([...ACTIVE_MEMBERSHIP_STATUSES]) },
        relations: ['plan', 'homeGym', 'homeGym.parent'],
      });

      for (const sub of candidates) {
        try {
          const included = sub.plan?.sessionsIncluded;
          if (included == null) continue;

          const params: any[] = [sub.userId, sub.startDate, sub.endDate];
          let gymFilter = '';
          if (sub.homeGymId != null) {
            params.push(sub.homeGymId);
            // Scope MARCA: las sesiones se consumen en cualquier sucursal de la marca
            gymFilter = sub.plan?.scope === 'MARCA'
              ? `AND gym_id IN (
                   SELECT g2.id FROM gyms g2
                   WHERE g2.id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $4)
                      OR g2.parent_id = (SELECT COALESCE(g3.parent_id, g3.id) FROM gyms g3 WHERE g3.id = $4)
                 )`
              : 'AND gym_id = $4';
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
          const used = Number(rows?.[0]?.c ?? 0);

          if (used >= Number(included)) {
            sub.status = 'VENCIDA';
            await this.subsRepo.save(sub);
            newlyExpired.push(this.toExpiredEntry(sub));
            this.logger.log(
              `[expiration] Suscripción #${sub.id} vencida por sesiones agotadas (${used}/${included}).`,
            );
          }
        } catch (err) {
          this.logger.error(`[expiration] Error evaluando suscripción #${sub.id}:`, err);
        }
      }

      await this.notifyStaffOfExpirations(newlyExpired);
    } catch (err) {
      this.logger.error('[expiration] Error en el ciclo de expiración:', err);
    }
  }

  private toExpiredEntry(sub: UserSubscription): ExpiredEntry {
    return {
      subscriptionId: sub.id,
      gymId: sub.homeGym?.id ?? sub.homeGymId ?? null,
      gymName: sub.homeGym?.name ?? null,
      brandId: sub.homeGym?.parent?.id ?? null,
      brandName: sub.homeGym?.parent?.name ?? null,
    };
  }

  /**
   * Resumen diario (no un push por cliente): agrupa los vencimientos de hoy
   * por sucursal y por marca, y envía UNA notificación por grupo al staff
   * territorialmente responsable — Recepcionista ve solo su sucursal exacta,
   * Gerente ve el agregado de toda su marca (todas las sucursales hijas).
   */
  private async notifyStaffOfExpirations(entries: ExpiredEntry[]): Promise<void> {
    if (!entries.length) return;

    const bySucursal = new Map<number, { name: string; count: number }>();
    const byMarca = new Map<number, { name: string; count: number }>();

    for (const e of entries) {
      if (e.gymId != null) {
        const cur = bySucursal.get(e.gymId) ?? { name: e.gymName ?? `Sucursal #${e.gymId}`, count: 0 };
        cur.count += 1;
        bySucursal.set(e.gymId, cur);
      }
      if (e.brandId != null) {
        const cur = byMarca.get(e.brandId) ?? { name: e.brandName ?? `Marca #${e.brandId}`, count: 0 };
        cur.count += 1;
        byMarca.set(e.brandId, cur);
      } else if (e.gymId != null) {
        this.logger.warn(
          `[expiration] Sucursal #${e.gymId} sin marca (parent) asignada — se omite la notificación a nivel Gerente para esta suscripción.`,
        );
      }
    }

    for (const [gymId, info] of bySucursal) {
      try {
        const tokens = await this.getStaffPushTokens(gymId, 4);
        if (!tokens.length) continue;
        await this.pushSvc.sendPushBatch(
          tokens,
          'Membresías vencidas',
          `${info.count} membresía${info.count === 1 ? '' : 's'} vencieron hoy en ${info.name}.`,
          { type: 'MEMBERSHIP_EXPIRED_DIGEST', scope: 'SUCURSAL', gymId, count: info.count },
        );
      } catch (err) {
        this.logger.error(`[expiration] Error notificando Recepcionista(s) de sucursal #${gymId}:`, err);
      }
    }

    for (const [brandId, info] of byMarca) {
      try {
        const tokens = await this.getStaffPushTokens(brandId, 5);
        if (!tokens.length) continue;
        await this.pushSvc.sendPushBatch(
          tokens,
          'Membresías vencidas',
          `${info.count} membresía${info.count === 1 ? '' : 's'} vencieron hoy en la marca ${info.name}.`,
          { type: 'MEMBERSHIP_EXPIRED_DIGEST', scope: 'MARCA', brandId, count: info.count },
        );
      } catch (err) {
        this.logger.error(`[expiration] Error notificando Gerente(s) de marca #${brandId}:`, err);
      }
    }
  }

  /** Push tokens del staff de un hierarchy_level exacto, asignado exactamente a ese gymId (mismo patrón que UsersService.getManagerPushTokens). */
  private async getStaffPushTokens(gymId: number, hierarchyLevel: number): Promise<string[]> {
    const staff = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.userRoles', 'ur', 'ur.gym_id = :gymId', { gymId })
      .innerJoin('ur.role', 'r', 'r.hierarchy_level = :level', { level: hierarchyLevel })
      .where('u.is_active = true')
      .andWhere('u.push_token IS NOT NULL')
      .select(['u.id', 'u.pushToken'])
      .getMany();
    return staff.map((s) => s.pushToken as string).filter(Boolean);
  }
}
