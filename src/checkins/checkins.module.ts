import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckIn } from './domain/check-in.entity';
import { UserRole } from '../roles/domain/user-role.entity';
import { Gym } from '../gyms/domain/gym.entity';
import { Reservation } from '../reservations/domain/reservation.entity';
import { CheckinsService } from './application/checkins.service';
import { CheckinsController } from './infrastructure/checkins.controller';
import { CheckinsSchedulerService } from './application/checkins-scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckIn, UserRole, Gym, Reservation]),
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [CheckinsController],
  providers: [CheckinsService, CheckinsSchedulerService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
