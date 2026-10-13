import { IsString, MinLength } from 'class-validator';

export class AnnulerOrdrePoseDto {
  @IsString()
  @MinLength(3)
  motif: string;
}
