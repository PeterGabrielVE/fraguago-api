import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Vista previa del formulario (aún sin guardar) con datos de ejemplo.
export class PreviewMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
