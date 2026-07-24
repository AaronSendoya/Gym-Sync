import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Scope,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, DeepPartial, IsNull } from 'typeorm';
import { User } from '../../users/domain/user.entity';
import { UserTraining } from '../domain/user-training.entity';
import { UserTrainingGoals } from '../domain/user-training-goals.entity';
import { UserTrainingPreferences } from '../domain/user-training-preferences.entity';
import { UserTrainingRestriction } from '../domain/user-training-restriction.entity';
import { EmergencyContact } from '../domain/emergency-contact.entity';
import { WorkoutSession } from '../domain/workout-session.entity';
import { WorkoutSet } from '../domain/workout-set.entity';
import { UserSubscription } from '../../subscriptions/domain/user-subscription.entity';
import { Routine } from '../../routines/domain/routine.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { GymGateway } from '../../notifications/infrastructure/gym.gateway';
import {
  getManagerGymId,
  type RequestWithUser,
} from '../../common/security/gym-scope';

@Injectable({ scope: Scope.REQUEST })
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    @InjectRepository(UserTraining) private utRepo: Repository<UserTraining>,
    @InjectRepository(UserTrainingGoals)
    private goalsRepo: Repository<UserTrainingGoals>,
    @InjectRepository(UserTrainingPreferences)
    private prefsRepo: Repository<UserTrainingPreferences>,
    @InjectRepository(UserTrainingRestriction)
    private restRepo: Repository<UserTrainingRestriction>,
    @InjectRepository(EmergencyContact)
    private ecRepo: Repository<EmergencyContact>,
    @InjectRepository(WorkoutSession)
    private sessionsRepo: Repository<WorkoutSession>,
    @InjectRepository(WorkoutSet) private setsRepo: Repository<WorkoutSet>,
    @InjectRepository(UserSubscription)
    private subsRepo: Repository<UserSubscription>,
    @InjectRepository(Routine) private routinesRepo: Repository<Routine>,
    @InjectRepository(Gym) private gymsRepo: Repository<Gym>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly gateway: GymGateway,
    @Inject(REQUEST) private readonly request: RequestWithUser,
  ) {}

  private managerGymId(): number | null {
    return getManagerGymId(this.request);
  }

  private async emitSessionUpdateToTrainer(session: ReturnType<typeof this.mapSession>) {
    if (!session.routineId) return;
    const routine = await this.routinesRepo.findOne({
      where: { id: session.routineId },
      select: ['trainerId'],
    });
    if (routine?.trainerId) {
      this.gateway.emitToUser(routine.trainerId, 'routine_session_update', session);
    }
  }

  /** Mapea una WorkoutSession a un objeto plano seguro para serialización HTTP. */
  private mapSession(s: WorkoutSession) {
    // ── Campos de sede ────────────────────────────────────────────────────────
    const rawGymName = s.gym?.name ?? null;
    const rawBrandName = s.gym?.parent?.name ?? null;
    const locationText = rawGymName
      ? rawBrandName && rawBrandName !== rawGymName
        ? `${rawBrandName} - ${rawGymName}`
        : rawGymName
      : 'Sede no registrada';

    // ── Sets mapeados ─────────────────────────────────────────────────────────
    const mappedSets = (s.sets ?? []).map((ws) => {
      const catalogExercise =
        ws.exercise ?? ws.routineExercise?.exercise ?? null;
      return {
        id: ws.id,
        setNumber: ws.setNumber,
        repsCompleted: ws.repsCompleted,
        weightUsedKg: ws.weightUsedKg !== null ? Number(ws.weightUsedKg) : null,
        durationSeconds: ws.durationSeconds,
        distanceMeters: ws.distanceMeters,
        restTakenSeconds: ws.restTakenSeconds,
        ratingPerceivedExertion: ws.ratingPerceivedExertion,
        completedAt: ws.completedAt,
        exerciseName: catalogExercise?.name ?? null,
        exercise: catalogExercise
          ? {
              id: catalogExercise.id,
              name: catalogExercise.name,
              muscleGroup: catalogExercise.muscleGroup,
              equipmentRequired: catalogExercise.equipmentRequired ?? null,
            }
          : null,
        routineExercise: ws.routineExercise
          ? {
              id: ws.routineExercise.id,
              orderPosition: ws.routineExercise.orderPosition,
              setsRecommended: ws.routineExercise.setsRecommended,
              repsRecommended: ws.routineExercise.repsRecommended,
              weightRecommendedKg:
                ws.routineExercise.weightRecommendedKg ?? null,
            }
          : null,
      };
    });

    // ── activityText: primer ejercicio real → rutina → deporte ───────────────
    const firstSet = mappedSets[0] ?? null;
    const freeExerciseName = firstSet?.exercise?.name ?? null;
    const routineExerciseName = firstSet?.routineExercise
      ? (s.sets?.[0]?.routineExercise?.exercise?.name ?? null)
      : null;
    const activityText =
      freeExerciseName ??
      routineExerciseName ??
      s.routine?.name ??
      s.sportType ??
      'Actividad Desconocida';

    return {
      id: s.id,
      userId: s.userId,
      gymId: s.gymId,
      gymName: rawGymName,
      brandName: rawBrandName,
      locationText,
      activityText,
      routineName: s.routine?.name ?? null,
      gym: s.gym
        ? {
            id: s.gym.id,
            name: s.gym.name,
            parentId: s.gym.parentId ?? null,
            brand: s.gym.parent
              ? { id: s.gym.parent.id, name: s.gym.parent.name }
              : null,
          }
        : null,
      routineId: s.routineId,
      trainerId: s.routine?.trainerId ?? null,
      trainerName: s.routine?.trainer?.profile
        ? `${(s.routine.trainer.profile as any).firstName} ${(s.routine.trainer.profile as any).lastName}`.trim()
        : null,
      routine: s.routine
        ? {
            id: s.routine.id,
            name: s.routine.name,
            description: s.routine.description ?? null,
            difficultyLevel: s.routine.difficultyLevel ?? null,
            exercises: (s.routine.exercises ?? []).map((re) => ({
              id: re.id,
              orderPosition: re.orderPosition,
              setsRecommended: re.setsRecommended,
              repsRecommended: re.repsRecommended,
              weightRecommendedKg: re.weightRecommendedKg ?? null,
              exercise: re.exercise
                ? {
                    id: re.exercise.id,
                    name: re.exercise.name,
                    muscleGroup: re.exercise.muscleGroup,
                    equipmentRequired: re.exercise.equipmentRequired ?? null,
                  }
                : null,
            })),
          }
        : null,
      sportType: s.sportType,
      status: s.status,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      durationSeconds: s.durationSeconds,
      caloriesBurned: s.caloriesBurned,
      notes: s.notes,
      sets: mappedSets,
    };
  }

  // ── User Training Profile ────────────────────────
  async createTrainingProfile(userId: number, goals?: any, prefs?: any) {
    const ut = await this.utRepo.save(this.utRepo.create({ userId }));
    if (goals)
      await this.goalsRepo.save(
        this.goalsRepo.create({ ...goals, userTrainingId: ut.id }),
      );
    if (prefs)
      await this.prefsRepo.save(
        this.prefsRepo.create({ ...prefs, userTrainingId: ut.id }),
      );
    return this.getTrainingProfile(userId);
  }
  async getTrainingProfile(userId: number) {
    const ut = await this.utRepo.findOne({
      where: { userId },
      relations: ['goals', 'preferences'],
    });
    if (!ut)
      throw new NotFoundException(
        `Perfil de entrenamiento no encontrado para usuario ${userId}`,
      );
    return ut;
  }

  // ── Restrictions ─────────────────────────────────
  createRestriction(data: Partial<UserTrainingRestriction>) {
    return this.restRepo.save(this.restRepo.create(data));
  }
  findRestriction(userId: number) {
    return this.restRepo.findOne({ where: { userId } });
  }

  // ── Emergency Contacts ───────────────────────────
  createEmergencyContact(data: Partial<EmergencyContact>) {
    return this.ecRepo.save(this.ecRepo.create(data));
  }
  findEmergencyContacts(userId: number) {
    return this.ecRepo.find({ where: { userId } });
  }
  removeEmergencyContact(id: number) {
    return this.ecRepo.delete(id);
  }

  // ── Workout Sessions ─────────────────────────────
  async saveCompletedSession(userId: number, data: any) {
    if ((!data.sets || data.sets.length === 0) && data.durationSeconds < 60) {
      throw new BadRequestException(
        'No se puede guardar una sesión de menos de 1 minuto sin series registradas.',
      );
    }

    const mg = this.managerGymId();

    let gymId: number | null = null;
    if (mg !== null) {
      gymId = mg;
    } else if (data.gymId) {
      const gym = await this.gymsRepo.findOne({ where: { id: Number(data.gymId) } });
      gymId = gym ? gym.id : null;
    }
    if (!gymId) {
      // 'ACTIVA' es el estado estándar; 'ACTIVO' tolera datos legados
      const sub = await this.subsRepo.findOne({
        where: { userId, status: In(['ACTIVA', 'ACTIVO']) },
        order: { createdAt: 'DESC' },
      });
      gymId = sub?.homeGymId ?? null;
    }

    const now = new Date();
    const session = await this.sessionsRepo.save(
      this.sessionsRepo.create({
        userId,
        gymId,
        routineId: data.routineId ?? null,
        sportType: data.sportType ?? null,
        durationSeconds: data.durationSeconds ?? null,
        caloriesBurned: data.caloriesBurned ?? null,
        notes: data.notes ?? null,
        status: 'FINISHED',
        startedAt: now,
        finishedAt: now,
      }),
    );

    if (data.sets?.length) {
      const requestedExerciseIds = [
        ...new Set(
          (data.sets as any[])
            .map((s) => s.exerciseId)
            .filter((id): id is number => typeof id === 'number' && id > 0),
        ),
      ];

      const validExerciseIds = new Set<number>();
      if (requestedExerciseIds.length > 0) {
        const rows: { id: number }[] = await this.setsRepo.manager.query(
          `SELECT id FROM exercises WHERE id = ANY($1::int[])`,
          [requestedExerciseIds],
        );
        rows.forEach((r) => validExerciseIds.add(r.id));

        const invalid = requestedExerciseIds.filter(
          (id) => !validExerciseIds.has(id),
        );
        if (invalid.length > 0) {
          this.logger.warn(
            `exerciseId(s) not found in catalog, saved as null: ${invalid.join(', ')}`,
          );
        }
      }

      const items = (data.sets as any[]).map((s) =>
        this.setsRepo.create({
          sessionId: session.id,
          setNumber: s.setNumber,
          routineExerciseId: s.routineExerciseId ?? null,
          exerciseId:
            s.exerciseId && validExerciseIds.has(s.exerciseId)
              ? s.exerciseId
              : null,
          weightUsedKg: s.weightUsedKg ?? null,
          repsCompleted: s.repsCompleted ?? null,
          durationSeconds: s.durationSeconds ?? null,
          distanceMeters: s.distanceMeters ?? null,
          restTakenSeconds: s.restTakenSeconds ?? null,
          ratingPerceivedExertion: s.ratingPerceivedExertion ?? null,
          metadata: s.metadata ?? null,
        } as DeepPartial<WorkoutSet>),
      );
      await this.setsRepo.save(items);
    }

    return this.findOneSession(session.id);
  }

  async createSession(data: any) {
    const mg = this.managerGymId();
    const { sets, ...sData } = data;

    if ((!sets || sets.length === 0) && sData.durationSeconds < 60) {
      throw new BadRequestException(
        'No se puede guardar una sesión de menos de 1 minuto sin series registradas.',
      );
    }

    const targetUserId = Number(sData.userId ?? this.request.user?.userId ?? 0);

    const sessionData: DeepPartial<WorkoutSession> = { ...sData };

    if (mg !== null) {
      if (
        sessionData.gymId !== undefined &&
        sessionData.gymId !== null &&
        Number(sessionData.gymId) !== mg
      ) {
        throw new ForbiddenException(
          'No puede registrar sesiones para otra sucursal',
        );
      }
      sessionData.gymId = mg;
    } else if (sessionData.gymId) {
      const gym = await this.gymsRepo.findOne({ where: { id: Number(sessionData.gymId) } });
      if (!gym) sessionData.gymId = null;
    }

    // Validación de sesión duplicada + INSERT en una sola transacción con lock
    // pessimistic_write sobre la fila del usuario: dos requests concurrentes
    // (doble tap) se serializan aquí — la segunda ve la sesión de la primera
    // y recibe 409, en vez de que ambas pasen el check antes de insertar (TOCTOU).
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let sessionId: number;
    try {
      if (targetUserId) {
        await queryRunner.manager.findOne(User, {
          where: { id: targetUserId },
          select: { id: true },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (targetUserId && sData.routineId) {
        const activeSession = await queryRunner.manager.findOne(WorkoutSession, {
          where: {
            userId: targetUserId,
            routineId: Number(sData.routineId),
            finishedAt: IsNull(),
          },
        });
        if (activeSession) {
          throw new ConflictException(
            'Ya tienes una sesión activa para esta rutina. Finalízala antes de iniciar una nueva.',
          );
        }
      }

      const session = await queryRunner.manager.save(
        WorkoutSession,
        queryRunner.manager.create(WorkoutSession, sessionData),
      );
      sessionId = session.id;

      if (sets?.length) {
        const items = sets.map((s: any) =>
          queryRunner.manager.create(WorkoutSet, {
            sessionId: session.id,
            setNumber: s.setNumber,
            routineExerciseId: s.routineExerciseId ?? null,
            exerciseId: s.exerciseId ?? null,
            weightUsedKg: s.weightUsedKg ?? null,
            repsCompleted: s.repsCompleted ?? null,
            durationSeconds: s.durationSeconds ?? null,
            distanceMeters: s.distanceMeters ?? null,
            restTakenSeconds: s.restTakenSeconds ?? null,
            ratingPerceivedExertion: s.ratingPerceivedExertion ?? null,
            metadata: s.metadata ?? null,
          } as DeepPartial<WorkoutSet>),
        );
        await queryRunner.manager.save(WorkoutSet, items);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const mapped = await this.findOneSession(sessionId);
    this.emitSessionUpdateToTrainer(mapped as any).catch(() => {});
    return mapped;
  }

  async findAllSessions(userId: number, take = 50, skip = 0) {
    const mg = this.managerGymId();
    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.routine', 'routine')
      .leftJoinAndSelect('routine.exercises', 'routineExercises')
      .leftJoinAndSelect('routineExercises.exercise', 'catalogExercise')
      .leftJoinAndSelect('routine.trainer', 'trainerUser')
      .leftJoinAndSelect('trainerUser.profile', 'trainerProfile')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('session.gym', 'gym')
      .leftJoinAndSelect('gym.parent', 'brand')
      .leftJoinAndSelect('session.sets', 'sets')
      .leftJoinAndSelect('sets.exercise', 'freeExercise')
      .leftJoinAndSelect('sets.routineExercise', 'routineExercise')
      .leftJoinAndSelect('routineExercise.exercise', 'exercise')
      .where('session.user_id = :userId', { userId })
      .orderBy('session.startedAt', 'DESC')
      .take(take)
      .skip(skip);

    if (mg !== null) {
      qb.andWhere('session.gym_id = :gymId', { gymId: mg });
    }

    const sessions = await qb.getMany();

    return sessions.map((s) => this.mapSession(s));
  }

  async findSessionsByUser(userId: number, routineId?: number) {
    const mg = this.managerGymId();
    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.routine', 'routine')
      .leftJoinAndSelect('routine.exercises', 'routineExercises')
      .leftJoinAndSelect('routineExercises.exercise', 'catalogExercise')
      .leftJoinAndSelect('routine.trainer', 'trainerUser')
      .leftJoinAndSelect('trainerUser.profile', 'trainerProfile')
      .leftJoinAndSelect('session.gym', 'gym')
      .leftJoinAndSelect('gym.parent', 'brand')
      .leftJoinAndSelect('session.sets', 'sets')
      .leftJoinAndSelect('sets.exercise', 'freeExercise')
      .leftJoinAndSelect('sets.routineExercise', 'routineExercise')
      .leftJoinAndSelect('routineExercise.exercise', 'exercise')
      .where('session.user_id = :userId', { userId })
      .orderBy('session.started_at', 'DESC');

    if (routineId !== undefined) {
      qb.andWhere('session.routine_id = :routineId', { routineId });
    }

    if (mg !== null) {
      qb.andWhere('session.gym_id = :gymId', { gymId: mg });
    }

    const sessions = await qb.getMany();
    return sessions.map((s) => this.mapSession(s));
  }

  /** Carga la entidad pura WorkoutSession para operaciones de escritura (save/delete). */
  private async findRawSession(id: number): Promise<WorkoutSession> {
    const mg = this.managerGymId();
    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .where('session.id = :id', { id });

    if (mg !== null) {
      qb.andWhere('session.gym_id = :gymId', { gymId: mg });
    }

    const s = await qb.getOne();
    if (s) return s;

    if (mg !== null) {
      const exists = await this.sessionsRepo.exist({ where: { id } });
      if (exists)
        throw new ForbiddenException(
          'No tiene permisos para acceder a esta sesión',
        );
    }

    throw new NotFoundException(`Sesión ${id} no encontrada`);
  }

  async findOneSession(id: number) {
    const mg = this.managerGymId();
    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.routine', 'routine')
      .leftJoinAndSelect('routine.exercises', 'routineExercises')
      .leftJoinAndSelect('routineExercises.exercise', 'catalogExercise')
      .leftJoinAndSelect('routine.trainer', 'trainerUser')
      .leftJoinAndSelect('trainerUser.profile', 'trainerProfile')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('session.gym', 'gym')
      .leftJoinAndSelect('gym.parent', 'brand')
      .leftJoinAndSelect('session.sets', 'sets')
      .leftJoinAndSelect('sets.exercise', 'freeExercise')
      .leftJoinAndSelect('sets.routineExercise', 'routineExercise')
      .leftJoinAndSelect('routineExercise.exercise', 'exercise')
      .where('session.id = :id', { id });

    if (mg !== null) {
      qb.andWhere('session.gym_id = :gymId', { gymId: mg });
    }

    const s = await qb.getOne();
    if (s) return this.mapSession(s);

    if (mg !== null) {
      const exists = await this.sessionsRepo.exist({ where: { id } });
      if (exists)
        throw new ForbiddenException(
          'No tiene permisos para acceder a esta sesión',
        );
    }

    throw new NotFoundException(`Sesión ${id} no encontrada`);
  }

  async updateSession(id: number, data: any) {
    // Usa la entidad pura para poder hacer save() sin propiedades extra
    const s = await this.findRawSession(id);
    const mg = this.managerGymId();

    if (
      mg !== null &&
      data.gymId !== undefined &&
      data.gymId !== null &&
      Number(data.gymId) !== mg
    ) {
      throw new ForbiddenException('No puede mover la sesión a otra sucursal');
    }

    if ((data.status === 'COMPLETED' || data.status === 'PARTIAL') && !s.finishedAt) {
      s.finishedAt = new Date();
    }
    Object.assign(s, data);
    await this.sessionsRepo.save(s);
    const mapped = await this.findOneSession(id);
    this.emitSessionUpdateToTrainer(mapped as any).catch(() => {});
    return mapped;
  }

  async addSet(sessionId: number, data: any) {
    await this.findRawSession(sessionId); // solo verifica permisos, no necesita joins
    return this.setsRepo.save(this.setsRepo.create({ ...data, sessionId }));
  }

  async removeSession(id: number) {
    await this.findRawSession(id); // solo verifica permisos
    return this.sessionsRepo.delete(id);
  }

  // ── Strength Records (para gráfico de hipertrofia) ──────────────────────────
  /**
   * Devuelve los récords de fuerza del usuario agrupados por ejercicio.
   * Formato de respuesta:
   * [
   *   {
   *     exerciseId: number,
   *     exerciseName: string,
   *     muscleGroup: string,
   *     history: [{ date: 'YYYY-MM-DD', maxWeightKg: number, totalSets: number }]
   *   }
   * ]
   */
  async getStrengthRecords(userId: number) {
    const sessions = await this.sessionsRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.sets', 'sets')
      .leftJoinAndSelect('sets.exercise', 'freeExercise')
      .leftJoinAndSelect('sets.routineExercise', 'routineExercise')
      .leftJoinAndSelect('routineExercise.exercise', 'exercise')
      .where('session.user_id = :userId', { userId })
      .andWhere('sets.weight_used_kg IS NOT NULL')
      .orderBy('session.startedAt', 'ASC')
      .getMany();

    // Agrupar por ejercicio
    const byExercise = new Map<
      number,
      {
        exerciseId: number;
        exerciseName: string;
        muscleGroup: string;
        history: { date: string; maxWeightKg: number; totalSets: number }[];
      }
    >();

    for (const session of sessions) {
      if (!session.sets?.length) continue;

      // Agrupar series de esta sesión por ejercicio
      const perExerciseInSession = new Map<
        number,
        { maxWeight: number; count: number }
      >();

      for (const set of session.sets) {
        const exercise = set.exercise ?? set.routineExercise?.exercise;
        if (!exercise || set.weightUsedKg == null) continue;

        const weight = Number(set.weightUsedKg);
        const existing = perExerciseInSession.get(exercise.id);
        if (!existing) {
          perExerciseInSession.set(exercise.id, {
            maxWeight: weight,
            count: 1,
          });
        } else {
          existing.maxWeight = Math.max(existing.maxWeight, weight);
          existing.count++;
        }

        // Inicializar entrada global del ejercicio si no existe
        if (!byExercise.has(exercise.id)) {
          byExercise.set(exercise.id, {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            muscleGroup: exercise.muscleGroup,
            history: [],
          });
        }
      }

      // Añadir punto de datos por sesión a cada ejercicio
      const sessionDate = (
        session.startedAt ??
        session.finishedAt ??
        new Date()
      )
        .toISOString()
        .slice(0, 10); // 'YYYY-MM-DD'

      for (const [exerciseId, stats] of perExerciseInSession) {
        byExercise.get(exerciseId)!.history.push({
          date: sessionDate,
          maxWeightKg: stats.maxWeight,
          totalSets: stats.count,
        });
      }
    }

    return Array.from(byExercise.values());
  }
}
