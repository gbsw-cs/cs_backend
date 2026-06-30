import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportSessionDto {
  @ApiProperty({ description: '주간 첫 세션 시작 시각', nullable: true, example: '2026-04-13T09:00:00.000Z' })
  firstStartedAt!: Date | null;

  @ApiProperty({ description: '주간 마지막 세션 종료 시각', nullable: true, example: '2026-04-19T18:30:00.000Z' })
  lastEndedAt!: Date | null;

  @ApiProperty({ description: '주간 총 감지 시간(초)', example: 201600 })
  totalDetectionSec!: number;
}

export class ReportHealthScoreDto {
  @ApiProperty({ description: '주간 평균 건강 점수 (0-100)', nullable: true, example: 76 })
  weekly!: number | null;

  @ApiProperty({
    description: '일별 건강 점수 (월~일 7개, 데이터 없으면 null)',
    type: 'array',
    items: { type: 'number', nullable: true },
    example: [72, 80, 65, 70, 74, 82, 78],
  })
  daily!: (number | null)[];
}

export class ReportTimelineItemDto {
  @ApiProperty({ description: '날짜 (YYYY-MM-DD)', example: '2026-04-13' })
  date!: string;

  @ApiProperty({ description: '구간 시작 시(0-23)', example: 9 })
  startHour!: number;

  @ApiProperty({ description: '구간 시작 분(0 또는 30)', example: 0 })
  startMin!: number;

  @ApiProperty({
    description: '우세 상태',
    nullable: true,
    enum: ['GOOD', 'TURTLE_NECK', 'SHOULDER_ISSUE', 'DARK_ENV'],
    example: 'GOOD',
  })
  dominantState!: string | null;

  @ApiProperty({ description: '건강 점수 (0-100)', nullable: true, example: 90 })
  healthScore!: number | null;
}

export class TopIssueDto {
  @ApiProperty({
    description: '감지 유형',
    enum: ['TURTLE_NECK', 'ROUND_SHOULDER', 'SHOULDER_ASYMMETRY', 'DARK_ENV'],
    example: 'TURTLE_NECK',
  })
  type!: string;

  @ApiProperty({ description: '총 지속 시간(초)', example: 25200 })
  durationSec!: number;

  @ApiProperty({ description: '감지 횟수', example: 168 })
  count!: number;

  @ApiProperty({ description: '순위 (1-3)', example: 1 })
  rank!: number;
}

export class CurrentReportResponseDto {
  @ApiProperty({ description: '주 시작일 (월요일, YYYY-MM-DD)', example: '2026-04-13' })
  weekStartDate!: string;

  @ApiProperty({ description: '주 종료일 (일요일, YYYY-MM-DD)', example: '2026-04-19' })
  weekEndDate!: string;

  @ApiProperty({ type: ReportSessionDto })
  session!: ReportSessionDto;

  @ApiProperty({ type: ReportHealthScoreDto })
  healthScore!: ReportHealthScoreDto;

  @ApiProperty({ type: [ReportTimelineItemDto] })
  timeline!: ReportTimelineItemDto[];

  @ApiProperty({ type: [TopIssueDto] })
  topIssues!: TopIssueDto[];

  @ApiPropertyOptional({
    description: 'AI 솔루션 메시지',
    nullable: true,
    example: '거북목이 가장 빈번하게 나타났어요. 모니터 상단을 눈높이에 맞추고 ...',
  })
  aiSolution!: string | null;
}

export class ReportHistoryItemDto {
  @ApiProperty({ description: '리포트 ID' })
  id!: string;

  @ApiProperty({ description: '주 시작일 (YYYY-MM-DD)', example: '2026-04-06' })
  weekStartDate!: string;

  @ApiProperty({ description: '주 종료일 (YYYY-MM-DD)', example: '2026-04-12' })
  weekEndDate!: string;

  @ApiProperty({ description: '발송 방식', enum: ['EMAIL', 'NOTION'] })
  deliveryWay!: string;

  @ApiProperty({ description: '발송 상태', enum: ['PENDING', 'SENT', 'FAILED'] })
  status!: string;

  @ApiProperty({ description: '발송 시각', nullable: true, example: '2026-04-13T00:05:00.000Z' })
  sentAt!: Date | null;
}

export class ReportHistoryResponseDto {
  @ApiProperty({ type: [ReportHistoryItemDto] })
  items!: ReportHistoryItemDto[];
}

export class ReportSummaryItemDto {
  @ApiProperty({ description: '리포트 ID' }) reportId!: string;
  @ApiProperty({ enum: ['PENDING', 'SENT', 'FAILED'] }) status!: string;
  @ApiProperty({ nullable: true }) sentAt!: Date | null;
  @ApiProperty({ enum: ['EMAIL', 'NOTION'] }) deliveryWay!: string;
  @ApiProperty() totalDetectionSec!: number;
  @ApiProperty() goodPostureSec!: number;
  @ApiProperty() badPostureSec!: number;
  @ApiProperty({ description: '불량 자세 비율 (0~100)' }) riskPercent!: number;
  @ApiProperty({ description: '정자세 비율 (0.0~1.0)' }) goodPostureRatio!: number;
  @ApiProperty({ nullable: true }) healthScore!: number | null;
  @ApiProperty({ type: [TopIssueDto] }) topIssues!: TopIssueDto[];
  @ApiProperty({ nullable: true }) aiSolution!: string | null;
  @ApiProperty({ nullable: true }) aiAnalyzedAt!: Date | null;
}

export class ReportSummaryResponseDto {
  @ApiProperty({ type: [ReportSummaryItemDto] }) items!: ReportSummaryItemDto[];
}

export class ReportDetailResponseDto extends CurrentReportResponseDto {
  @ApiProperty({ description: '리포트 ID' })
  id!: string;

  @ApiProperty({ description: '발송 방식', enum: ['EMAIL', 'NOTION'] })
  deliveryWay!: string;

  @ApiProperty({ description: '발송 시각', nullable: true })
  sentAt!: Date | null;

  @ApiProperty({ description: '발송 상태', enum: ['PENDING', 'SENT', 'FAILED'] })
  status!: string;
}

