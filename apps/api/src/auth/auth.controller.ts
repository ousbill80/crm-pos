import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { SkipPasswordCheck } from './decorators/skip-password-check.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './types';
import { CreateSensitiveChallengeDto } from './dto/create-sensitive-challenge.dto';
import { SensitiveActionChallengeService } from './sensitive-action-challenge.service';
import { TurnstileService } from './turnstile.service';

// Jest force NODE_ENV=test s'il n'est pas déjà défini : les suites e2e
// enchaînent volontairement plus de tentatives de connexion en 60s que la
// limite réelle (scénarios de verrouillage, notamment) sur un même process
// serveur. Playwright local frappe `start:dev` (NODE_ENV ≠ production) :
// même relâchement. En production la limite reste 5/60s — le verrouillage
// de compte (AuthService, 5 échecs -> 15 min) est identique partout.
const EST_ENV_TEST =
  process.env.NODE_ENV === 'test' ||
  process.env.NODE_ENV !== 'production' ||
  process.env.E2E_RELAX_AUTH_THROTTLE === '1';
const LOGIN_THROTTLE_LIMIT = EST_ENV_TEST ? 1000 : 5;
const CHANGE_PASSWORD_THROTTLE_LIMIT = EST_ENV_TEST ? 1000 : 10;
const REAUTH_THROTTLE_LIMIT = EST_ENV_TEST ? 1000 : 5;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sensitiveActions: SensitiveActionChallengeService,
    private readonly turnstile: TurnstileService,
  ) {}

  // Limite resserrée (§6.7) : ralentit le brute-force en complément du
  // verrouillage de compte (5 échecs -> 15 min) porté par AuthService.
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: 60_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    await this.turnstile.assertValid(dto.turnstileToken, req.ip);
    return this.authService.login(dto.login, dto.password);
  }

  // Reste joignable même si mustChangePassword=true : c'est le seul moyen
  // de sortir de cet état (§6.7, parcours de changement forcé).
  @Throttle({ default: { limit: CHANGE_PASSWORD_THROTTLE_LIMIT, ttl: 60_000 } })
  @SkipPasswordCheck()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.changePassword(
      user.userId,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  @Throttle({ default: { limit: REAUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('reauth/challenges')
  @HttpCode(HttpStatus.CREATED)
  createSensitiveChallenge(
    @Body() dto: CreateSensitiveChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sensitiveActions.create(user.userId, dto.password, dto.purpose);
  }

  @SkipPasswordCheck()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.userId);
  }
}
