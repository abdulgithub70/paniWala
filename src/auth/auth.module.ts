import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MeController } from './me.controller';
import { RolesGuard } from './roles.guard';

// FirebaseService now lives in NotificationsModule (shared with push), so it is imported, not provided here.
@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
