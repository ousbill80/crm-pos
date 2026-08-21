import { IsString, MinLength } from 'class-validator';

export class UpdateZoneDto {
  @IsString()
  @MinLength(1)
  nomZone: string;
}
