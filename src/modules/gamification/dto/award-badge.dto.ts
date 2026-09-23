import { IsUUID } from 'class-validator';

export class AwardBadgeDto {
  @IsUUID()
  memberId!: string;
}
