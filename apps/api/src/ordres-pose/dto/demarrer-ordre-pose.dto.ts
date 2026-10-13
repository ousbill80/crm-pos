import { IsString, MinLength } from 'class-validator';

export class DemarrerOrdrePoseDto {
  @IsString()
  @MinLength(1)
  qrToken: string;
}
