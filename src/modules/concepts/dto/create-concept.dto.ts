import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ConceptKind } from '@prisma/client';

export class CreateConceptDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ConceptKind) // solo acepta 'INCOME' o 'EXPENSE'
  kind!: ConceptKind;
}