import { IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateRoutineDto {
  @IsUUID()
  memberId!: string; 
  
  @IsOptional()
  @IsUUID()
  trainerId?: string; 

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}