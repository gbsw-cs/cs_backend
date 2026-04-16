import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class WeeklyQueryDto {
  @ApiProperty({
    description: '주 시작일(월요일, YYYY-MM-DD, Asia/Seoul)',
    example: '2026-04-06',
  })
  @Matches(DATE_REGEX, { message: 'from은 YYYY-MM-DD 형식이어야 합니다.' })
  from!: string;
}

export class DailyQueryDto {
  @ApiProperty({
    description: '조회 일자(YYYY-MM-DD, Asia/Seoul)',
    example: '2026-04-11',
  })
  @Matches(DATE_REGEX, { message: 'date는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;
}
