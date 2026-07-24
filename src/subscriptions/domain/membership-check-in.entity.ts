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
 * Check-in de MEMBRESÍA — independiente de `check_ins` (reservas de clase /
 * ingreso por recepción con QR). Esta tabla es la base para el futuro sistema
 * de reconocimiento facial: hoy está vacía a propósito (no existe todavía
 * ningún endpoint que escriba aquí). El calendario visual del carnet de
 * membresía consulta ESTA tabla, nunca `check_ins`, para no mezclar dos
 * conceptos de negocio distintos.
 */
@Entity('membership_checkins')
export class MembershipCheckIn {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('idx_membership_checkins_user_id')
  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  @Column({ type: 'integer', name: 'subscription_id', nullable: true })
  subscriptionId!: number | null;

  @Index('idx_membership_checkins_gym_id')
  @Column({ type: 'integer', name: 'gym_id' })
  gymId!: number;

  @Column({ type: 'timestamp', name: 'checked_in_at', default: () => 'now()' })
  checkedInAt!: Date;

  /** Origen del registro. Hoy solo existe como placeholder — se popula cuando exista el ingreso real. */
  @Column({ type: 'varchar', length: 20, default: 'FACIAL' })
  method!: string;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Gym, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @ManyToOne(() => UserSubscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: UserSubscription | null;
}
