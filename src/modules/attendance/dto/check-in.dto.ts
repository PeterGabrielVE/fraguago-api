import { IsUUID } from 'class-validator';

export class CheckInDto {
  @IsUUID()
  memberId!: string;
}