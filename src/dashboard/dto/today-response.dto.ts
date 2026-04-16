import { ApiProperty } from '@nestjs/swagger';

export class TodayBreakdownDto {
  @ApiProperty({ description: '거북목 지속 시간(초)' })
  turtleNeckSec!: number;

  @ApiProperty({ description: '어깨 이슈 지속 시간(초)' })
  shoulderIssueSec!: number;

  @ApiProperty({ description: '어둠 환경 지속 시간(초)' })
  darkEnvSec!: number;

  @ApiProperty({ description: '거북목 감지 횟수' })
  turtleNeckCount!: number;

  @ApiProperty({ description: '어깨 이슈 감지 횟수' })
  shoulderIssueCount!: number;

  @ApiProperty({ description: '어둠 환경 감지 횟수' })
  darkEnvCount!: number;
}

export class TodayDashboardDto {
  @ApiProperty({ description: '오늘 일자(YYYY-MM-DD, Asia/Seoul)', example: '2026-04-11' })
  date!: string;

  @ApiProperty({ description: '오늘 건강 점수 (0~100)', nullable: true, example: 78 })
  healthScore!: number | null;

  @ApiProperty({ description: '오늘 총 감지 시간(초)' })
  totalDetectionSec!: number;

  @ApiProperty({ description: '정자세 비율 (0~1)', example: 0.66 })
  goodPostureRatio!: number;

  @ApiProperty({ description: '자세 이슈/어둠 환경 분류별 집계', type: TodayBreakdownDto })
  breakdown!: TodayBreakdownDto;

  @ApiProperty({ description: '어둠 감지 모드 ON/OFF', enum: ['ON', 'OFF'] })
  darkDetectionMode!: 'ON' | 'OFF';
}
