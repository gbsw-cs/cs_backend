import { ApiProperty } from '@nestjs/swagger';
import { DetectionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetectionEventDto {
  @ApiProperty({ description: '감지 유형' })
  @IsEnum(DetectionType, {
    message: 'type은 허용된 enum 값이어야 합니다.',
  })
  type!: DetectionType;

  @ApiProperty({ description: '심각도 (1~3)', example: 2 })
  @IsInt()
  @Min(1, { message: 'severity는 1 이상이어야 합니다.' })
  @Max(3, { message: 'severity는 3 이하여야 합니다.' })
  severity!: number;

  @ApiProperty({ description: '해당 상태 지속 시간(초)', example: 30 })
  @IsInt()
  @Min(0, { message: 'durationSec는 0 이상이어야 합니다.' })
  durationSec!: number;

  @ApiProperty({
    description: '감지 시각 (ISO 8601, UTC)',
    example: '2026-04-11T09:12:30.000Z',
  })
  @IsISO8601({}, { message: 'detectedAt은 ISO 8601 형식이어야 합니다.' })
  detectedAt!: string;
}

export class UploadEventsDto {
  @ApiProperty({
    description: '감지 이벤트 배치 (최대 100건)',
    type: [DetectionEventDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'events는 최소 1건 이상이어야 합니다.' })
  @ArrayMaxSize(100, { message: 'events는 최대 100건까지 허용됩니다.' })
  @ValidateNested({ each: true })
  @Type(() => DetectionEventDto)
  events!: DetectionEventDto[];
}
