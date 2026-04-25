import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiCommonResponse } from '../common/decorators/api-common-response.decorator.js';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';
import {
  DailyQueryDto,
  WeeklyQueryDto,
} from './dto/dashboard-query.dto.js';
import { DailyDashboardDto } from './dto/daily-response.dto.js';
import {
  CreateTimelineEntryDto,
  CreateTimelineEntryResponseDto,
} from './dto/timeline-create.dto.js';
import { TimelineDashboardDto } from './dto/timeline-response.dto.js';
import { TodayHealthScoreDto } from './dto/today-response.dto.js';
import { WeeklyDashboardDto } from './dto/weekly-response.dto.js';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '오늘의 건강 점수 (FR-04-01)',
    description:
      'Asia/Seoul 기준 오늘의 자세 점수, 경고 횟수, 어제/지난주 대비 변화율을 반환합니다.',
  })
  @ApiCommonResponse({ type: TodayHealthScoreDto })
  async getToday(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TodayHealthScoreDto> {
    return this.dashboardService.getTodayHealthScore(user.id);
  }

  @Get('weekly')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '주간 스크린타임 (FR-04-02)',
    description:
      'from(월요일)부터 일요일까지 7일치 daily_stats + 주중 worstWeekday/worstHour 반환.',
  })
  @ApiCommonResponse({ type: WeeklyDashboardDto })
  async getWeekly(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: WeeklyQueryDto,
  ): Promise<WeeklyDashboardDto> {
    return this.dashboardService.getWeekly(user.id, query.from);
  }

  @Get('daily')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일간 스크린타임 (FR-04-03)',
    description:
      '특정 일자의 3시간 단위(8개 슬롯) 감지 횟수를 반환합니다.\n\n' +
      '각 슬롯에는 ① GOOD_POSTURE 감지 횟수, ② 단일 불량 타입 감지 횟수, ③ 중첩 감지 횟수가 포함됩니다.',
  })
  @ApiCommonResponse({ type: DailyDashboardDto })
  async getDaily(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DailyQueryDto,
  ): Promise<DailyDashboardDto> {
    return this.dashboardService.getDaily(user.id, query.date);
  }

  @Post('timeline')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '타임라인 항목 추가 (FR-04-04)',
    description: '자세 변동 시 클라이언트가 타임라인 항목을 서버에 저장합니다.',
  })
  @ApiCommonResponse({ type: CreateTimelineEntryResponseDto })
  async createTimelineEntry(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTimelineEntryDto,
  ): Promise<CreateTimelineEntryResponseDto> {
    return this.dashboardService.createTimelineEntry(user.id, dto);
  }

  @Get('timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '날짜별 타임라인 조회 (FR-04-04)',
    description: '저장된 타임라인 항목을 시각 오름차순으로 반환합니다.',
  })
  @ApiCommonResponse({ type: TimelineDashboardDto })
  async getTimeline(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DailyQueryDto,
  ): Promise<TimelineDashboardDto> {
    return this.dashboardService.getTimeline(user.id, query.date);
  }
}
