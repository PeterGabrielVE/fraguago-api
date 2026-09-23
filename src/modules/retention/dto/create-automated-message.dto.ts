import { AutomationTrigger, MessageChannel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Reglas entre campos (asunto obligatorio en email, plantilla obligatoria en
// WhatsApp, variables válidas en el texto) se validan en AutomationsService.
export class CreateAutomatedMessageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsEnum(AutomationTrigger)
  trigger!: AutomationTrigger;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsInt()
  @Min(1)
  @Max(365)
  triggerDays!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  cooldownDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  // Nombre exacto de la plantilla aprobada en Meta (minúsculas y guiones bajos).
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,512}$/, { message: 'whatsappTemplate solo admite minúsculas, números y _' })
  whatsappTemplate?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
