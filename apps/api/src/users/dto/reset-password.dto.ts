import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // Optionnel : si omis, un mot de passe temporaire est généré côté serveur
  // et retourné une seule fois dans la réponse.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
