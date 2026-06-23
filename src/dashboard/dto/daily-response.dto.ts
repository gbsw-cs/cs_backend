import { ApiProperty } from '@nestjs/swagger';

export class DailySlotDto {
  @ApiProperty({ description: '슬롯 인덱스 (0~7)', example: 0 })
  slotIndex!: number;

  @ApiProperty({ description: '슬롯 시작 시각 (KST)', example: 0 })
  startHour!: number;

  @ApiProperty({ description: '슬롯 종료 시각 (KST, exclusive)', example: 3 })
  endHour!: number;

  @ApiProperty({ description: '총 감지 시간(초)' })
  totalDetectionSec!: number;

  @ApiProperty({ description: '정자세 시간(초)' })
  goodPostureSec!: number;

  @ApiProperty({ description: '거북목 시간(초)' })
  turtleNeckSec!: number;

  @ApiProperty({ description: '라운드숄더 시간(초)' })
  roundShoulderSec!: number;

  @ApiProperty({ description: '어깨 비대칭 시간(초)' })
  shoulderAsymmetrySec!: number;

  @ApiProperty({ description: '어둠 환경 시간(초)' })
  darkEnvSec!: number;

  @ApiProperty({ description: '구부정한 자세 시간(초)' })
  slouchSec!: number;

  @ApiProperty({ description: '미분류 시간(초)' })
  unclassifiedSec!: number;
}

export class DailyDashboardDto {
  @ApiProperty({ description: '조회 일자 (YYYY-MM-DD, Asia/Seoul)', example: '2026-06-09' })
  date!: string;

  @ApiProperty({ description: '3시간 단위 슬롯 목록 (항상 0~7 전체 반환)', type: [DailySlotDto] })
  slots!: DailySlotDto[];
}
