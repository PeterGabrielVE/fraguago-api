import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertEmergencyContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  relationship!: string;
}