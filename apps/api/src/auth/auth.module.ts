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
import { resolveJwtSecret } from './jwt-secret.util';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = resolveJwtSecret(
          config.get<string>('JWT_SECRET'),
          config.get<string>('NODE_ENV'),
        );
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
