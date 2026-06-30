import { ApiProperty } from '@nestjs/swagger';

export class SessionStartResponseDto {
  @ApiProperty({ description: '세션 ID' })
  sessionId!: string;

  @ApiProperty({ description: '시작 시각', example: '2026-04-11T09:00:00.000Z' })
  startedAt!: Date;

  @ApiProperty({ enum: ['WEB', 'EXTENSION'], description: '세션 생성 source' })
  source!: 'WEB' | 'EXTENSION';
}

export class CurrentSessionResponseDto {
  @ApiProperty({ description: '세션 ID' })
  sessionId!: string;

  @ApiProperty({ description: '시작 시각' })
  startedAt!: Date;

  @ApiProperty({ enum: ['ACTIVE', 'PAUSED'], description: '세션 상태' })
  status!: 'ACTIVE' | 'PAUSED';

  @ApiProperty({ enum: ['WEB', 'EXTENSION'], description: '세션 생성 source' })
  source!: 'WEB' | 'EXTENSION';

  @ApiProperty({ description: '일시정지 시각 (PAUSED 상태일 때만 값 있음)', nullable: true })
  pausedAt!: Date | null;

  @ApiProperty({ description: '누적 일시정지 시간(초)' })
  totalPausedSec!: number;
}

export class NewBadgeDto {
  @ApiProperty({ description: '배지 코드' })
  code!: string;

  @ApiProperty({ description: '배지 이름' })
  name!: string;
}

export class SessionEndResponseDto {
  @ApiProperty({ description: '세션 ID' })
  sessionId!: string;

  @ApiProperty({ description: '총 사용 시간(초)' })
  totalDurationSec!: number;

  @ApiProperty({ description: '정자세 지속 시간(초)' })
  goodPostureSec!: number;

  @ApiProperty({ description: '거북목 지속 시간(초)' })
  turtleNeckSec!: number;

  @ApiProperty({ description: '어깨 이슈 지속 시간(초, 라운드숄더+어깨 비대칭)' })
  shoulderIssueSec!: number;

  @ApiProperty({ description: '어둠 환경 지속 시간(초)' })
  darkEnvSec!: number;

  @ApiProperty({ description: '구부정한 자세 지속 시간(초)' })
  slouchSec!: number;

  @ApiProperty({ description: '정자세 감지 횟수' })
  goodPostureCount!: number;

  @ApiProperty({ description: '거북목 감지 횟수' })
  turtleNeckCount!: number;

  @ApiProperty({ description: '어깨 이슈 감지 횟수' })
  shoulderIssueCount!: number;

  @ApiProperty({ description: '어둠 환경 감지 횟수' })
  darkEnvCount!: number;

  @ApiProperty({ description: '구부정한 자세 감지 횟수' })
  slouchCount!: number;

  @ApiProperty({ description: '건강 점수 (0~100)', nullable: true })
  healthScore!: number | null;

  @ApiProperty({ description: '신규 획득 배지', type: [NewBadgeDto] })
  newBadges!: NewBadgeDto[];
}

export class UploadEventsResponseDto {
  @ApiProperty({ description: '저장된 이벤트 수' })
  accepted!: number;
}
