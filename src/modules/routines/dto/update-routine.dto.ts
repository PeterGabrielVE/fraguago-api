import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRoutineDto } from './create-routine.dto';

export class UpdateRoutineDto extends PartialType(
  OmitType(CreateRoutineDto, ['memberId'] as const),
) {}