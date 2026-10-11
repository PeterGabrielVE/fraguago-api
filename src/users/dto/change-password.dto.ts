import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(7)
  @MaxLength(72) // límite de bcrypt
  password!: string;

  @IsString()
  confirmPassword!: string;
}
