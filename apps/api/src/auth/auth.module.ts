import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { SensitiveActionChallengeService } from './sensitive-action-challenge.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET doit être défini (voir apps/api/.env)');
        }
        // Aligné sur la fenêtre d'autonomie POS hors ligne de 24 h (§6.7).
        // Une durée différente recréerait une session locale impossible à
        // synchroniser à la reconnexion.
        return { secret, signOptions: { expiresIn: '24h' } };
      },
    }),
  ],
  providers: [
    AuthService,
    SensitiveActionChallengeService,
    TurnstileService,
    JwtStrategy,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, SensitiveActionChallengeService, JwtModule],
})
export class AuthModule {}
