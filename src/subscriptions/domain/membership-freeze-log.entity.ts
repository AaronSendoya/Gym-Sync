import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/domain/user.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { UserSubscription } from './user-subscription.entity';

/**
 * Historial PERMANENTE de congelamientos/descongelamientos de membresía —
 * independiente del registro de la membresía misma (`user_subscriptions`).
 * `user_subscriptions.frozenAt` solo guarda el congelamiento VIGENTE (se
 * borra al descongelar); esta tabla acumula cada evento para control
 * administrativo, incluso si la suscripción luego cambia de estado o el
 * congelamiento ya terminó. `subscriptionId` es nullable con SET NULL: el
 * registro del evento sobrevive aunque la suscripción de origen desaparezca.
 */
@Entity('membership_freeze_logs')
export class MembershipFreezeLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', name: 'subscription_id', nullable: true })
  subscriptionId!: number | null;

  @Index('idx_membership_freeze_logs_user_id')
  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  /** Sucursal de la membresía al momento del evento — base del filtro territorial. */
  @Index('idx_membership_freeze_logs_gym_id')
  @Column({ type: 'integer', name: 'home_gym_id', nullable: true })
  homeGymId!: number | null;

  @Column({ type: 'integer', name: 'performed_by_user_id', nullable: true })
  performedByUserId!: number | null;

  @Column({ type: 'varchar', length: 12 })
  action!: 'CONGELAR' | 'DESCONGELAR';

  @Index('idx_membership_freeze_logs_occurred_at')
  @Column({ type: 'timestamp', name: 'occurred_at', default: () => 'now()' })
  occurredAt!: Date;

  /** Solo en DESCONGELAR: días que estuvo congelada, sumados al vencimiento. */
  @Column({ type: 'integer', name: 'days_frozen', nullable: true })
  daysFrozen!: number | null;

  @Column({ type: 'date', name: 'previous_end_date', nullable: true })
  previousEndDate!: string | null;

  @Column({ type: 'date', name: 'new_end_date', nullable: true })
  newEndDate!: string | null;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by_user_id' })
  performedBy!: User | null;

  @ManyToOne(() => Gym, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'home_gym_id' })
  homeGym!: Gym | null;

  @ManyToOne(() => UserSubscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: UserSubscription | null;
}
