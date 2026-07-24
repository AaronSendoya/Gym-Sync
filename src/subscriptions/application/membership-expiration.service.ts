import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserSubscription } from '../domain/user-subscription.entity';
import { ACTIVE_MEMBERSHIP_STATUSES } from './dtos/subscriptions.dto';

/**
 * Expiración automática de membresías. Sin esto, la regla "una activa a la
 * vez" bloquearía al cliente con una fila vencida que nadie marcó VENCIDA.
 *
 * Dos causas de vencimiento:
 *  1. Por fecha: end_date quedó en el pasado.
 *  2. Por sesiones: el cliente consumió todas las sesiones incluidas del plan
 *     (conteo de check-ins reales dentro de la vigencia).
 */
@Injectable()
export class MembershipExpirationService {
  private readonly logger = new Logger(MembershipExpirationService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly subsRepo: Repository<UserSubscription>,
  ) {}

  @Cron('0 3 * * *') // diario, 03:00
  async expireMemberships(): Promise<void> {
    try {
      // ── 1. Vencidas por fecha (un solo UPDATE) ────────────────────────────
      const byDate = await this.subsRepo
        .createQueryBuilder()
        .update(UserSubscription)
        .set({ status: 'VENCIDA' })
        .where('status IN (:...st)', { st: [...ACTIVE_MEMBERSHIP_STATUSES] })
        .andWhere('end_date < CURRENT_DATE')
        .execute();

      if (byDate.affected) {
        this.logger.log(`[expiration] ${byDate.affected} membresía(s) vencida(s) por fecha.`);
      }

      // ── 2. Vencidas por sesiones agotadas ────────────────────────────────
      const candidates = await this.subsRepo.find({
        where: { status: In([...ACTIVE_MEMBERSHIP_STATUSES]) },
        relations: ['plan'],
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
            this.logger.log(
              `[expiration] Suscripción #${sub.id} vencida por sesiones agotadas (${used}/${included}).`,
            );
          }
        } catch (err) {
          this.logger.error(`[expiration] Error evaluando suscripción #${sub.id}:`, err);
        }
      }
    } catch (err) {
      this.logger.error('[expiration] Error en el ciclo de expiración:', err);
    }
  }
}
