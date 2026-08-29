import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(120)
  login: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  /** Jeton Cloudflare Turnstile (obligatoire si TURNSTILE_SECRET_KEY est défini). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}
