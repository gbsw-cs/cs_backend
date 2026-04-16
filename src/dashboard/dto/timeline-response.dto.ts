import { ApiProperty } from '@nestjs/swagger';

export const TIMELINE_STATES = [
  'GOOD',
  'TURTLE_NECK',
  'SHOULDER_ISSUE',
  'DARK_ENV',
] as const;
export type TimelineDominantState = (typeof TIMELINE_STATES)[number];

export class TimelineBucketDto {
  @ApiProperty({ description: '버킷 시작 시간(0~23)' })
  startHour!: number;

  @ApiProperty({ description: '버킷 시작 분(0 또는 30)' })
  startMin!: number;

  @ApiProperty({
    description: '해당 30분 구간의 우세 상태. 데이터 없으면 null',
    enum: TIMELINE_STATES,
    nullable: true,
  })
  dominantState!: TimelineDominantState | null;

  @ApiProperty({
    description: '해당 구간 건강 점수 (0~100). 데이터 없으면 null',
    nullable: true,
  })
  healthScore!: number | null;
}

export class TimelineDashboardDto {
  @ApiProperty({ description: '조회 일자(YYYY-MM-DD, Asia/Seoul)' })
  date!: string;

  @ApiProperty({
    description: '30분 단위 버킷 (총 48개)',
    type: [TimelineBucketDto],
  })
  buckets!: TimelineBucketDto[];
}
