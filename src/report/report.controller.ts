import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiCommonResponse } from '../common/decorators/api-common-response.decorator.js';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator.js';
import { ReportHistoryQueryDto } from './dto/report-query.dto.js';
import {
  ReportDetailResponseDto,
  ReportHistoryResponseDto,
  ReportSummaryResponseDto,
} from './dto/report-response.dto.js';
import { ReportService } from './report.service.js';

@ApiTags('Report')
@Controller('users/me/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '리포트 요약 목록 조회',
    description: 'internal/save로 저장된 리포트를 요약 형태로 반환합니다.',
  })
  @ApiCommonResponse({ type: ReportSummaryResponseDto })
  async getReportSummary(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ReportSummaryResponseDto> {
    return this.reportService.getReportSummary(user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '리포트 이력 조회 (FR-06-01)',
    description:
      'from, to 주 시작일(월요일) 범위로 저장된 주간 리포트 목록을 반환합니다. 파라미터 생략 시 전체 이력.',
  })
  @ApiCommonResponse({ type: ReportHistoryResponseDto })
  async getReportHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReportHistoryQueryDto,
  ): Promise<ReportHistoryResponseDto> {
    return this.reportService.getReportHistory(user.id, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '리포트 단건 조회 (FR-06-01)',
    description:
      'weekly_reports.payload 스냅샷과 발송 메타데이터를 반환합니다. 타 유저 리포트 접근 시 403.',
  })
  @ApiParam({ name: 'id', description: '리포트 ID' })
  @ApiCommonResponse({ type: ReportDetailResponseDto })
  async getReportById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<ReportDetailResponseDto> {
    return this.reportService.getReportById(user.id, id);
  }


}
