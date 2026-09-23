import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateTierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  // Puntos acumulados históricos necesarios para alcanzar el nivel.
  @IsInt()
  @Min(0)
  minPoints!: number;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color debe ser un hex tipo #RRGGBB' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  benefits?: string;
}
