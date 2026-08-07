import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPlan } from './domain/subscription-plan.entity';
import { UserSubscription } from './domain/user-subscription.entity';
import { SubscriptionPayment } from './domain/subscription-payment.entity';
import { MembershipCheckIn } from './domain/membership-check-in.entity';
import { MembershipFreezeLog } from './domain/membership-freeze-log.entity';
import { User } from '../users/domain/user.entity';
import { SubscriptionsService } from './application/subscriptions.service';
import { MembershipExpirationService } from './application/membership-expiration.service';
import { MembershipRemindersService } from './application/membership-reminders.service';
import { SubscriptionsController } from './infrastructure/subscriptions.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      SubscriptionPayment,
      MembershipCheckIn,
      MembershipFreezeLog,
      User,
    ]),
    PushNotificationsModule,
    NotificationsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    MembershipExpirationService,
    MembershipRemindersService,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
