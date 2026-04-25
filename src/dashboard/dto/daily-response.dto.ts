import { ApiProperty } from '@nestjs/swagger';

export class DailySlotDto {
  @ApiProperty({ description: '슬롯 인덱스 (0~7)', example: 0 })
  slotIndex!: number;

  @ApiProperty({ description: '슬롯 시작 시각 (0, 3, 6, 9, 12, 15, 18, 21)', example: 0 })
  startHour!: number;

  @ApiProperty({ description: 'GOOD_POSTURE 감지 횟수' })
  goodPostureCount!: number;

  @ApiProperty({
    description:
      '단일 불량 자세 감지 횟수 — GOOD_POSTURE 외 타입 중 하나만 감지된 이벤트 수 (다른 불량 타입과 시간 중첩 없음)',
  })
  singleBadCount!: number;

  @ApiProperty({
    description:
      '중첩 감지 횟수 — 서로 다른 불량 타입 이벤트가 시간 구간상 겹치는 이벤트 수',
  })
  overlappingCount!: number;
}

export class DailyDashboardDto {
  @ApiProperty({ description: '조회 일자(YYYY-MM-DD, Asia/Seoul)' })
  date!: string;

  @ApiProperty({
    description: '3시간 단위 시간대별 감지 현황 (8개 슬롯)',
    type: [DailySlotDto],
  })
  slots!: DailySlotDto[];
}
