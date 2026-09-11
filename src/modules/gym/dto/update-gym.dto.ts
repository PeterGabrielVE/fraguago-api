import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGymDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}