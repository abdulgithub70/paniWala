import { Module } from '@nestjs/common';
import { FirebaseService } from '../auth/firebase.service';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [FirebaseService, NotificationsService],
  exports: [FirebaseService, NotificationsService],
})
export class NotificationsModule {}
