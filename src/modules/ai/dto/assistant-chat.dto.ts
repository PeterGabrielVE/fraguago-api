import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AssistantMessageDto {
  // "model" es como Gemini llama a las respuestas del asistente.
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;
}

export class AssistantChatDto {
  // Conversación reciente (el front manda solo los últimos turnos) para
  // acotar costo y tokens.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AssistantMessageDto)
  messages!: AssistantMessageDto[];

  // Ruta donde está el usuario, para preguntas como "¿qué hago aquí?".
  @IsOptional()
  @IsString()
  @MaxLength(200)
  page?: string;

  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: 'es' | 'en';
}
