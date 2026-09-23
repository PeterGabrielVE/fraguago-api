import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const CHALLENGE_STATUSES = ['UPCOMING', 'ACTIVE', 'FINISHED'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export class ListChallengesQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(CHALLENGE_STATUSES, { message: `status debe ser uno de: ${CHALLENGE_STATUSES.join(', ')}` })
  status?: ChallengeStatus;
}
