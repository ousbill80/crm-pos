import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { SkipPasswordCheck } from './decorators/skip-password-check.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './types';

// Jest force NODE_ENV=test s'il n'est pas déjà défini : les suites e2e
// enchaînent volontairement plus de tentatives de connexion en 60s que la
// limite réelle (scénarios de verrouillage, notamment) sur un même process
// serveur. On desserre donc la limite en environnement de test uniquement —
// la logique de verrouillage de compte (AuthService, 5 échecs -> 15 min)
// reste, elle, strictement identique en test et en production.
const EST_ENV_TEST = process.env.NODE_ENV === 'test';
const LOGIN_THROTTLE_LIMIT = EST_ENV_TEST ? 1000 : 5;
const CHANGE_PASSWORD_THROTTLE_LIMIT = EST_ENV_TEST ? 1000 : 10;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Limite resserrée (§6.7) : ralentit le brute-force en complément du
  // verrouillage de compte (5 échecs -> 15 min) porté par AuthService.
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: 60_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
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

  @SkipPasswordCheck()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.userId);
  }
}
