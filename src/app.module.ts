import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { join } from 'path';
import { JwtAuthGuard } from './auth/infrastructure/guards/jwt-auth.guard';
import { validateEnv } from './config/env.validation';

// ── Domain Modules (Estructura Modular por Dominios) ─────────
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { GymsModule } from './gyms/gyms.module';
import { ActivitiesModule } from './activities/activities.module';
import { ExercisesModule } from './exercises/exercises.module';
import { RoutinesModule } from './routines/routines.module';
import { TrainingModule } from './training/training.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ReservationsModule } from './reservations/reservations.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { CheckinsModule } from './checkins/checkins.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SystemModule } from './system/system.module';
import { StaffModule } from './staff/staff.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { VisitsModule } from './visits/visits.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  providers: [
    // ThrottlerGuard primero: bloquea fuerza bruta antes de llegar al guard de auth
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Guard JWT aplicado globalmente — todos los endpoints requieren token
    // excepto los marcados con @Public() (login, register, forgot-password, etc.)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  imports: [
    // ── Configuration ──────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),

    // ── Rate Limiting ───────────────────────────────────────────
    // Límite global generoso; auth endpoints lo sobreescriben con @Throttle()
    ThrottlerModule.forRoot([{
      ttl: 60000,   // ventana de 60 s (ms)
      limit: 120,   // 120 req/min por IP (2 req/s — suficiente para uso normal)
    }]),

    ScheduleModule.forRoot(),

    CacheModule.register({ isGlobal: true, ttl: 43200, max: 100 }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST'),
        port: cfg.get<number>('DB_PORT'),
        username: cfg.get<string>('DB_USERNAME'),
        password: cfg.get<string>('DB_PASSWORD'),
        database: cfg.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: cfg.get('NODE_ENV') !== 'production',
        dropSchema: cfg.get('NODE_ENV') !== 'production' && cfg.get<string>('DROP_SCHEMA') === 'true',
        // En producción no hay synchronize — el esquema lo crean/evolucionan las migraciones
        // versionadas en src/migrations, aplicadas automáticamente al arrancar (ver migrationsRun).
        migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
        migrationsRun: cfg.get('NODE_ENV') === 'production',
        logging: cfg.get('NODE_ENV') === 'production'
          ? ['error', 'migration', 'warn']
          : ['query', 'error', 'warn'],
        maxQueryExecutionTime: cfg.get('NODE_ENV') === 'production' ? 3000 : 1000,
      }),
    }),

    // ── Feature Modules (33 tablas, 15 módulos) ────────────────
    AuthModule,
    UsersModule,
    RolesModule,
    GymsModule,
    ActivitiesModule,
    ExercisesModule,
    RoutinesModule,
    TrainingModule,
    SubscriptionsModule,
    ReservationsModule,
    WaitlistModule,
    CheckinsModule,
    MetricsModule,
    NotificationsModule,
    SystemModule,
    StaffModule,
    DashboardModule,
    VisitsModule,
    MessagesModule,
  ],
})
export class AppModule {}
