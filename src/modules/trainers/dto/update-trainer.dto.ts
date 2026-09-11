import { IsOptional, IsString } from 'class-validator';

export class UpdateTrainerDto {
  @IsOptional()
  @IsString()
  specialty?: string;
}