import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import {
  TIMELINE_STATES,
  TimelineDominantState,
} from './timeline-response.dto.js';

export class CreateTimelineEntryDto {
  @ApiProperty({
    description: '날짜 (YYYY-MM-DD)',
    example: '2026-04-11',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date는 YYYY-MM-DD 형식이어야 합니다.',
  })
  date!: string;

  @ApiProperty({
    description: '시작 시각 (HH:mm)',
    example: '09:00',
    pattern: '^\\d{2}:\\d{2}$',
  })
  @Matches(/^\d{2}:\d{2}$/, { message: 'time은 HH:mm 형식이어야 합니다.' })
  time!: string;

  @ApiProperty({
    description: '우세 상태',
    enum: TIMELINE_STATES,
    example: 'GOOD',
  })
  @IsEnum(TIMELINE_STATES, {
    message: 'dominantState는 GOOD, WARN, BAD 중 하나이어야 합니다.',
  })
  dominantState!: TimelineDominantState;

  @ApiPropertyOptional({ description: '메시지', example: '' })
  @IsOptional()
  @IsString()
  message?: string;
}

export class CreateTimelineEntryResponseDto {
  @ApiProperty({ description: '처리된 항목 수', example: 1 })
  accepted!: number;
}
