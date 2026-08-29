import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class RegisterGymDto {
  @IsString() gymName!: string;
  @IsString() ownerName!: string;
  @IsEmail() ownerEmail!: string;
  @IsString() @MinLength(6) ownerPassword!: string;
}
