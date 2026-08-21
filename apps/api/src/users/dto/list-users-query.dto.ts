import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RoleLibelle } from '@caisse-crm/shared';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(RoleLibelle)
  role?: RoleLibelle;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  actif?: boolean;
}
