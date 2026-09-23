import { PartialType } from '@nestjs/mapped-types';
import { CreateAutomatedMessageDto } from './create-automated-message.dto';

export class UpdateAutomatedMessageDto extends PartialType(CreateAutomatedMessageDto) {}
