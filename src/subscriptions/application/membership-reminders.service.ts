import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription } from '../domain/user-subscription.entity';
import { ACTIVE_MEMBERSHIP_STATUSES } from './dtos/subscriptions.dto';
import { PushNotificationsService } from '../../push-notifications/application/push-notifications.service';

/** Días de anticipación con los que se avisa el vencimiento. */
const REMINDER_DAYS_BEFORE = 3;

/**
 * Recordatorio de vencimiento de membresía — calcado del patrón de
 * reservation-reminders.service.ts (cron + push + flag anti-duplicado).
 */
@Injectable()
export class MembershipRemindersService {
  private readonly logger = new Logger(MembershipRemindersService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly subsRepo: Repository<UserSubscription>,
    private readonly pushService: PushNotificationsService,
  ) {}

  @Cron('0 10 * * *') // diario, 10:00 — horario amable para notificar
  async handleExpiryReminders(): Promise<void> {
    try {
      const candidates = await this.subsRepo
        .createQueryBuilder('sub')
        .innerJoinAndSelect('sub.user', 'u')
        .leftJoinAndSelect('sub.plan', 'plan')
        .where('sub.status IN (:...st)', { st: [...ACTIVE_MEMBERSHIP_STATUSES] })
        .andWhere('sub.reminder_sent = false')
        .andWhere('sub.end_date >= CURRENT_DATE')
        .andWhere(`sub.end_date <= CURRENT_DATE + INTERVAL '${REMINDER_DAYS_BEFORE} days'`)
        .getMany();

      if (candidates.length === 0) return;

      this.logger.log(`[reminders] ${candidates.length} membresía(s) por vencer...`);

      for (const sub of candidates) {
        try {
          const pushToken = sub.user?.pushToken;
          if (pushToken) {
            const dateStr = String(sub.endDate).split('T')[0];
            const planName = sub.plan?.name ?? 'tu membresía';
            await this.pushService.sendPushMessage(
              pushToken,
              'Tu membresía está por vencer',
              `${planName} vence el ${dateStr}. Acércate a tu sucursal para renovarla.`,
              { type: 'MEMBERSHIP_EXPIRY_REMINDER', subscriptionId: sub.id },
            );
          }

          // Marcar SIEMPRE (haya o no push token) para no reintentar eternamente
          sub.reminderSent = true;
          await this.subsRepo.save(sub);
          this.logger.log(`[reminders] Recordatorio procesado para suscripción #${sub.id}`);
        } catch (err) {
          this.logger.error(`[reminders] Error en suscripción #${sub.id}:`, err);
        }
      }
    } catch (err) {
      this.logger.error('[reminders] Error en el ciclo de recordatorios:', err);
    }
  }
}
