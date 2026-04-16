import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { TimelineDashboardDto } from './dto/timeline-response.dto.js';
import { TodayDashboardDto } from './dto/today-response.dto.js';
import { WeeklyDashboardDto } from './dto/weekly-response.dto.js';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '오늘 대시보드 (FR-04-01, FR-04-05)',
    description:
      'Asia/Seoul 기준 오늘 daily_stats 집계와 어둠 감지 모드 ON/OFF를 반환합니다.',
  })
  @ApiCommonResponse({ type: TodayDashboardDto })
  async getToday(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TodayDashboardDto> {
    return this.dashboardService.getToday(user.id);
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
      '특정 일자의 시간대별(0~23시) 자세 상태 비율과 횟수를 반환합니다.',
  })
  @ApiCommonResponse({ type: DailyDashboardDto })
  async getDaily(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DailyQueryDto,
  ): Promise<DailyDashboardDto> {
    return this.dashboardService.getDaily(user.id, query.date);
  }

  @Get('timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '오늘 타임라인 (FR-04-04)',
    description:
      '특정 일자의 30분 단위(48개) 우세 상태와 건강 점수를 반환합니다.',
  })
  @ApiCommonResponse({ type: TimelineDashboardDto })
  async getTimeline(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DailyQueryDto,
  ): Promise<TimelineDashboardDto> {
    return this.dashboardService.getTimeline(user.id, query.date);
  }
}
