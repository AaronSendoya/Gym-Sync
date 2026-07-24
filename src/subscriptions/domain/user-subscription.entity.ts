import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/domain/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Gym } from '../../gyms/domain/gym.entity';

// Garantía a nivel de BD (defensa en profundidad del lock de aplicación):
// como máximo UNA membresía vigente (activa o congelada) por cliente.
@Index('uq_active_membership_per_user', ['userId'], {
  unique: true,
  where: `"status" IN ('ACTIVA', 'ACTIVO', 'CONGELADA')`,
})
@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  @Column({ type: 'integer', name: 'plan_id' })
  planId!: number;

  @Column({ type: 'integer', name: 'home_gym_id', nullable: true })
  homeGymId!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: Date;

  @Column({ type: 'boolean', name: 'auto_renew', default: false })
  autoRenew!: boolean;

  /** Marca anti-duplicado del recordatorio de vencimiento (patrón Reservation.reminderSent). */
  @Column({ type: 'boolean', name: 'reminder_sent', default: false })
  reminderSent!: boolean;

  /** Inicio del congelamiento vigente. Al descongelar se extiende endDate por los días congelados. */
  @Column({ type: 'timestamp', name: 'frozen_at', nullable: true })
  frozenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'updated_at', nullable: true })
  updatedAt!: Date;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan!: SubscriptionPlan;

  // RESTRICT: impide borrar una sucursal con membresías inscritas — un
  // SET NULL convertiría accidentalmente esas membresías en acceso global.
  @ManyToOne(() => Gym, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'home_gym_id' })
  homeGym!: Gym;
}
