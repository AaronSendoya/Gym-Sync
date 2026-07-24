import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Routine } from '../../routines/domain/routine.entity';
import { User } from '../../users/domain/user.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { WorkoutSet } from './workout-set.entity';

// Garantía a nivel de BD (defensa en profundidad del lock de aplicación):
// como máximo UNA sesión activa (finished_at IS NULL) por usuario y rutina.
// No afecta sesiones freestyle (routine_id NULL no participa en unicidad).
@Index('uq_active_session_per_user_routine', ['userId', 'routineId'], {
  unique: true,
  where: '"finished_at" IS NULL AND "routine_id" IS NOT NULL',
})
@Entity('workout_sessions')
export class WorkoutSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', name: 'routine_id', nullable: true })
  routineId!: number | null;

  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  @Column({ type: 'integer', name: 'gym_id', nullable: true })
  gymId!: number | null;

  @Column({ type: 'varchar', length: 50, name: 'sport_type', nullable: true })
  sportType!: string | null;

  @Column({ type: 'timestamp', name: 'started_at', default: () => 'now()' })
  startedAt!: Date;

  @Column({ type: 'timestamp', name: 'finished_at', nullable: true })
  finishedAt!: Date;

  @Column({ type: 'varchar', length: 20, default: 'IN_PROGRESS' })
  status!: string;

  @Column({ type: 'integer', name: 'duration_seconds', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'integer', name: 'calories_burned', nullable: true })
  caloriesBurned!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string;

  // ── Relations ─────────────────────────────────────
  @ManyToOne(() => Routine, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'routine_id' })
  routine!: Routine | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Gym, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym | null;

  @OneToMany(() => WorkoutSet, (ws) => ws.session, { cascade: true })
  sets!: WorkoutSet[];
}
