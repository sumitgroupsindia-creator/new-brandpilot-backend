import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, PasswordService, SessionService],
  controllers: [AuthController],
  exports: [AuthService, PasswordService, SessionService, JwtModule],
})
export class AuthModule {}
