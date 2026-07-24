import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Gym } from '../../gyms/domain/gym.entity';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id!: number;

  // Sin unique global: cada sucursal maneja sus propios planes y los nombres
  // pueden repetirse entre sucursales (ej. "Mensualidad Regular").
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Sucursal dueña del plan. NULL = plan GLOBAL de la red (solo Super Admin
   * los crea). Recepcionista gestiona los de su sucursal; Gerente los de
   * todas las sucursales de su marca.
   */
  @Column({ type: 'integer', name: 'gym_id', nullable: true })
  gymId!: number | null;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_monthly' })
  priceMonthly!: number;

  /** Planes por fecha: días calendario de vigencia (ej. 30). Null en planes por sesiones. */
  @Column({ type: 'integer', name: 'duration_days', nullable: true })
  durationDays!: number | null;

  /**
   * Planes por sesiones (ej. "Plan Ejecutivo: 30 sesiones en 60 días"):
   * cantidad de ingresos reales (check-ins) incluidos. Null = plan por fecha.
   */
  @Column({ type: 'integer', name: 'sessions_included', nullable: true })
  sessionsIncluded!: number | null;

  /** Ventana de días para consumir las sesiones incluidas. Null en planes por fecha. */
  @Column({ type: 'integer', name: 'window_days', nullable: true })
  windowDays!: number | null;

  /**
   * Alcance de acceso: SUCURSAL = solo la sucursal de inscripción (home_gym);
   * MARCA = cualquier sucursal de la misma marca (plan VIP). El vínculo
   * territorial del cliente sigue siendo la membresía, nunca user_roles.
   */
  @Column({ type: 'varchar', length: 20, default: 'SUCURSAL' })
  scope!: 'SUCURSAL' | 'MARCA';

  @Column({ type: 'integer', name: 'max_gyms_access', nullable: true })
  maxGymsAccess!: number;

  @Column({ type: 'jsonb', nullable: true })
  features!: any;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => Gym, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym | null;
}
