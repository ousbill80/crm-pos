import { IsString, MinLength } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @MinLength(1)
  nomZone: string;
}
