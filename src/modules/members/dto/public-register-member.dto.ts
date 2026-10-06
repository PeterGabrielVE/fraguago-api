import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ActivityLevel } from "@prisma/client";
import { UpsertEmergencyContactDto } from "./upsert-emergency-contact.dto";
import { UpsertMedicalProfileDto } from "./upsert-medical-profile.dto";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

// Formulario público de inscripción (/registro/<gymId>): lo llena el propio
// socio desde el enlace que comparte el gimnasio. Sin token: el gym sale de
// la URL. Topes de longitud porque cualquiera puede enviarlo.
export class PublicRegisterMemberDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  identificationNumber!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  preferredTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertMedicalProfileDto)
  medicalProfile?: UpsertMedicalProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertEmergencyContactDto)
  emergencyContact?: UpsertEmergencyContactDto;
}
