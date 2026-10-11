import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
