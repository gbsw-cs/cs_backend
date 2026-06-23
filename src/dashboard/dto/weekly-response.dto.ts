import { ApiProperty } from '@nestjs/swagger';
import { WEEKDAY_VALUES, Weekday } from '../../common/enums/weekday.enum.js';

export class WeeklyDailyStatDto {
  @ApiProperty({ example: '2026-06-09' }) date!: string;
  @ApiProperty({ enum: WEEKDAY_VALUES, example: 'MON' }) weekday!: Weekday;
  @ApiProperty() hasData!: boolean;
  @ApiProperty() totalDetectionSec!: number;
  @ApiProperty() goodPostureSec!: number;
  @ApiProperty({ description: 'turtleNeck + roundShoulder + shoulderAsymmetry + slouch' }) badPostureSec!: number;
  @ApiProperty() turtleNeckSec!: number;
  @ApiProperty() roundShoulderSec!: number;
  @ApiProperty() shoulderAsymmetrySec!: number;
  @ApiProperty() darkEnvSec!: number;
  @ApiProperty() slouchSec!: number;
  @ApiProperty() unclassifiedSec!: number;
  @ApiProperty({ type: Number, description: '정자세 비율 (0.0~1.0)' }) goodPostureRatio!: number;
  @ApiProperty({ type: Number, description: '불량 자세 비율 (0.0~1.0)' }) badPostureRatio!: number;
}

export class WeeklyDashboardDto {
  @ApiProperty({ description: '주 시작일 (월요일)', example: '2026-06-08' }) weekStartDate!: string;
  @ApiProperty({ description: '주 종료일 (일요일)', example: '2026-06-14' }) weekEndDate!: string;
  @ApiProperty({ type: [WeeklyDailyStatDto] }) dailyStats!: WeeklyDailyStatDto[];
}
