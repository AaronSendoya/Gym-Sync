// src/config/data-source.cli.ts
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  throw new Error(
    'Falta DB_PASSWORD en .env — configúralo antes de correr comandos de TypeORM CLI.',
  );
}

// 🔹 MENSAJERÍA
import { Conversation } from '../messages/domain/conversation.entity';
import { DirectMessage } from '../messages/domain/direct-message.entity';

// 🔹 ROLES & PERMISOS
import { Role } from '../roles/domain/role.entity';
import { Permission } from '../roles/domain/permission.entity';
import { RolePermission } from '../roles/domain/role-permission.entity'; // ← ¡FALTABA!
import { UserRole } from '../roles/domain/user-role.entity';

// 🔹 USUARIOS
import { User } from '../users/domain/user.entity';
import { UserProfile } from '../users/domain/user-profile.entity';

// 🔹 GIMNASIOS
import { Gym } from '../gyms/domain/gym.entity';
import { GymLocation } from '../gyms/domain/gym-location.entity';
import { GymSchedule } from '../gyms/domain/gym-schedule.entity';
import { MachineInventory } from '../gyms/domain/machine-inventory.entity';

// 🔹 SUSCRIPCIONES
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.entity';
import { UserSubscription } from '../subscriptions/domain/user-subscription.entity';
import { SubscriptionPayment } from '../subscriptions/domain/subscription-payment.entity';

// 🔹 EJERCICIOS
import { ExerciseCatalog } from '../exercises/domain/exercise-catalog.entity';

// 🔹 ACTIVIDADES
import { GymActivity } from '../activities/domain/gym-activity.entity';
import { GymActivitySchedule } from '../activities/domain/gym-activity-schedule.entity';
import { GymActivityAttendance } from '../activities/domain/gym-activity-attendance.entity';

// 🔹 RESERVAS & WAITLIST
import { Reservation } from '../reservations/domain/reservation.entity';
import { WaitlistEntry } from '../waitlist/domain/waitlist-entry.entity';

// 🔹 CHECK-INS
import { CheckIn } from '../checkins/domain/check-in.entity';

// 🔹 RUTINAS
import { Routine } from '../routines/domain/routine.entity';
import { RoutineExercise } from '../routines/domain/routine-exercise.entity';

// 🔹 ENTRENAMIENTO
import { UserTraining } from '../training/domain/user-training.entity';
import { UserTrainingGoals } from '../training/domain/user-training-goals.entity';
import { UserTrainingPreferences } from '../training/domain/user-training-preferences.entity';
import { UserTrainingRestriction } from '../training/domain/user-training-restriction.entity';
import { EmergencyContact } from '../training/domain/emergency-contact.entity';
import { WorkoutSession } from '../training/domain/workout-session.entity';
import { WorkoutSet } from '../training/domain/workout-set.entity';

// 🔹 MÉTRICAS
import { PhysicalMetricsHistory } from '../metrics/domain/physical-metrics-history.entity';

// 🔹 NOTIFICACIONES
import { NotificationTemplate } from '../notifications/domain/notification-template.entity';
import { Notification } from '../notifications/domain/notification.entity';
import { UserNotificationPreference } from '../notifications/domain/user-notification-preference.entity';

// 🔹 SISTEMA
import { SystemSetting } from '../system/domain/system-setting.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'gymsync_db',
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',

  // 🔥 LISTA COMPLETA DE ENTIDADES (33 en total)
  entities: [
    // Roles & Permisos (4)
    Role,
    Permission,
    RolePermission,
    UserRole,

    // Usuarios (2)
    User,
    UserProfile,

    // Gimnasios (4)
    Gym,
    GymLocation,
    GymSchedule,
    MachineInventory,

    // Suscripciones (3)
    SubscriptionPlan,
    UserSubscription,
    SubscriptionPayment,

    // Ejercicios (1)
    ExerciseCatalog,

    // Actividades (3)
    GymActivity,
    GymActivitySchedule,
    GymActivityAttendance,

    // Reservas & Waitlist (2)
    Reservation,
    WaitlistEntry,

    // Check-ins (1)
    CheckIn,

    // Rutinas (2)
    Routine,
    RoutineExercise,

    // Entrenamiento (7)
    UserTraining,
    UserTrainingGoals,
    UserTrainingPreferences,
    UserTrainingRestriction,
    EmergencyContact,
    WorkoutSession,
    WorkoutSet,

    // Métricas (1)
    PhysicalMetricsHistory,

    // Notificaciones (3)
    NotificationTemplate,
    Notification,
    UserNotificationPreference,

    // Sistema (1)
    SystemSetting,

    // Mensajería (2)
    Conversation,
    DirectMessage,
  ],

  migrations: [],
  subscribers: [],
});
