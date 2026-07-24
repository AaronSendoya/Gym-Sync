import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserSubscription } from './user-subscription.entity';

@Entity('subscription_payments')
export class SubscriptionPayment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', name: 'subscription_id' })
  subscriptionId!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency!: string | null;

  @CreateDateColumn({ name: 'payment_date' })
  paymentDate!: Date;

  @Column({ type: 'varchar', length: 30, nullable: true })
  method!: string;

  @Column({ type: 'varchar', length: 60, name: 'transaction_reference', nullable: true })
  transactionReference!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PAGADO' })
  status!: string;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => UserSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: UserSubscription;
}
