import { ApiProperty } from '@nestjs/swagger';

export class DailyHourDto {
  @ApiProperty({ description: '시간(0~23)' })
  hour!: number;

  @ApiProperty({ description: '정자세 비율 (0~1)' })
  goodRatio!: number;

  @ApiProperty({ description: '거북목 비율 (0~1)' })
  turtleNeckRatio!: number;

  @ApiProperty({ description: '어깨 이슈 비율 (0~1)' })
  shoulderIssueRatio!: number;

  @ApiProperty({ description: '어둠 환경 비율 (0~1)' })
  darkEnvRatio!: number;

  @ApiProperty({ description: '거북목 감지 횟수' })
  turtleNeckCount!: number;

  @ApiProperty({ description: '어깨 이슈 감지 횟수' })
  shoulderIssueCount!: number;

  @ApiProperty({ description: '어둠 환경 감지 횟수' })
  darkEnvCount!: number;
}

export class DailyDashboardDto {
  @ApiProperty({ description: '조회 일자(YYYY-MM-DD, Asia/Seoul)' })
  date!: string;

  @ApiProperty({
    description: '시간대별(24개) 자세 상태 비율',
    type: [DailyHourDto],
  })
  hours!: DailyHourDto[];
}
