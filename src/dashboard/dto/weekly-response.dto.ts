import { ApiProperty } from '@nestjs/swagger';

export const WEEKDAY_VALUES = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
] as const;
export type Weekday = (typeof WEEKDAY_VALUES)[number];

export class WeeklyDayDto {
  @ApiProperty({ description: '일자(YYYY-MM-DD)', example: '2026-04-06' })
  date!: string;

  @ApiProperty({ description: '총 감지 시간(초)' })
  totalDetectionSec!: number;

  @ApiProperty({ description: '건강 점수 (0~100)', nullable: true })
  healthScore!: number | null;

  @ApiProperty({ description: '정자세 지속 시간(초)' })
  goodPostureSec!: number;

  @ApiProperty({ description: '거북목 지속 시간(초)' })
  turtleNeckSec!: number;

  @ApiProperty({ description: '어깨 이슈 지속 시간(초)' })
  shoulderIssueSec!: number;

  @ApiProperty({ description: '어둠 환경 지속 시간(초)' })
  darkEnvSec!: number;

  @ApiProperty({ description: '정자세 감지 횟수' })
  goodPostureCount!: number;

  @ApiProperty({ description: '거북목 감지 횟수' })
  turtleNeckCount!: number;

  @ApiProperty({ description: '어깨 이슈 감지 횟수' })
  shoulderIssueCount!: number;

  @ApiProperty({ description: '어둠 환경 감지 횟수' })
  darkEnvCount!: number;
}

export class WeeklyDashboardDto {
  @ApiProperty({ description: '주 시작일(월요일)', example: '2026-04-06' })
  from!: string;

  @ApiProperty({ description: '주 종료일(일요일)', example: '2026-04-12' })
  to!: string;

  @ApiProperty({
    description: '월~일 7일치 집계 (해당 일자 기록이 없으면 0/null)',
    type: [WeeklyDayDto],
  })
  days!: WeeklyDayDto[];

  @ApiProperty({
    description: '주중 건강 점수가 가장 낮은 요일. 모든 일자 점수가 null이면 null',
    enum: WEEKDAY_VALUES,
    nullable: true,
    example: 'WED',
  })
  worstWeekday!: Weekday | null;

  @ApiProperty({
    description: '비정자세 이벤트가 가장 많이 발생한 시간대(0~23). 데이터 없으면 null',
    nullable: true,
    example: 22,
  })
  worstHour!: number | null;
}
