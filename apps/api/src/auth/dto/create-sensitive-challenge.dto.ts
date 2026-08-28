import { PurposeActionSensible } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSensitiveChallengeDto {
  @IsString()
  @MinLength(1)
  password: string;

  @IsEnum(PurposeActionSensible)
  purpose: PurposeActionSensible;
}

export class SensitiveChallengeDto {
  @IsUUID()
  challengeId: string;
}
