import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DailyDashboardDto, DailySlotDto } from './dto/daily-response.dto.js';
import {
  CreateTimelineEntryDto,
  CreateTimelineEntryResponseDto,
} from './dto/timeline-create.dto.js';
import {
  TimelineBucketDto,
  TimelineDashboardDto,
} from './dto/timeline-response.dto.js';
import { TodayHealthScoreDto } from './dto/today-response.dto.js';
import {
  WeeklyDailyStatDto,
  WeeklyDashboardDto,
} from './dto/weekly-response.dto.js';
import {
  addDays,
  formatDate,
  parseDate,
  todaySeoulDate,
} from '../common/utils/date.util.js';
import { WEEKDAY_VALUES } from '../common/enums/weekday.enum.js';
import { rethrowAsInternal } from '../common/utils/error.util.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayHealthScore(userId: string): Promise<TodayHealthScoreDto> {
    try {
      const today = todaySeoulDate();
      const yesterday = addDays(today, -1);
      const lastWeekSameDay = addDays(today, -7);

      const [todayStat, yesterdayStat, lastWeekStat] = await Promise.all([
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } } }),
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: yesterday } } }),
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: lastWeekSameDay } } }),
      ]);

      const postureScore = todayStat?.postureScore ?? null;
      const warningCount = todayStat?.warningCount ?? 0;

      return {
        date: formatDate(today),
        postureScore,
        warningCount,
        vsYesterday: this.calcPctChange(postureScore, yesterdayStat?.postureScore ?? null),
        vsLastWeek: this.calcPctChange(postureScore, lastWeekStat?.postureScore ?? null),
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 오늘의 건강 점수를 조회할 수 없습니다.');
    }
  }

  async getDailySlots(userId: string, dateStr?: string): Promise<DailyDashboardDto> {
    try {
      const date = dateStr ? parseDate(dateStr) : todaySeoulDate();
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }
      const dateKey = formatDate(date);

      const rows = await this.prisma.dailySlotStat.findMany({
        where: { userId, date },
        select: {
          slotIndex: true,
          totalDetectionSec: true,
          goodPostureSec: true,
          turtleNeckSec: true,
          roundShoulderSec: true,
          shoulderAsymmetrySec: true,
          slouchingSec: true,
          darkEnvSec: true,
          slouchSec: true,
          unclassifiedSec: true,
        },
      });

      const bySlot = new Map(rows.map(r => [r.slotIndex, r]));

      const slots: DailySlotDto[] = Array.from({ length: 8 }, (_, i) => {
        const row = bySlot.get(i);
        return {
          slotIndex: i,
          startHour: i * 3,
          endHour: i * 3 + 3,
          totalDetectionSec: row?.totalDetectionSec ?? 0,
          goodPostureSec: row?.goodPostureSec ?? 0,
          turtleNeckSec: row?.turtleNeckSec ?? 0,
          roundShoulderSec: row?.roundShoulderSec ?? 0,
          shoulderAsymmetrySec: row?.shoulderAsymmetrySec ?? 0,
          slouchingSec: row?.slouchingSec ?? 0,
          darkEnvSec: row?.darkEnvSec ?? 0,
          slouchSec: row?.slouchSec ?? 0,
          unclassifiedSec: row?.unclassifiedSec ?? 0,
        };
      });

      return { date: dateKey, slots };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 일간 슬롯 통계를 조회할 수 없습니다.');
    }
  }

  async getWeekly(userId: string, fromStr: string): Promise<WeeklyDashboardDto> {
    try {
      const from = parseDate(fromStr);
      if (!from) {
        throw new BadRequestException('from은 YYYY-MM-DD 형식이어야 합니다.');
      }
      if (from.getUTCDay() !== 1) {
        throw new BadRequestException('from은 월요일이어야 합니다.');
      }
      const to = addDays(from, 6);

      const stats = await this.prisma.dailyStat.findMany({
        where: { userId, date: { gte: from, lte: to } },
      });
      const byDate = new Map(stats.map(s => [formatDate(s.date), s]));

      const dailyStats: WeeklyDailyStatDto[] = [];

      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i);
        const key = formatDate(d);
        const s = byDate.get(key);
        const hasData = s !== undefined;

        const totalSec = s?.totalDetectionSec ?? 0;
        const goodSec = s?.goodPostureSec ?? 0;
        const turtleNeckSec = s?.turtleNeckSec ?? 0;
        const roundShoulderSec = s?.roundShoulderSec ?? 0;
        const shoulderAsymmetrySec = s?.shoulderAsymmetrySec ?? 0;
        const slouchingSec = s?.slouchingSec ?? 0;
        const darkEnvSec = s?.darkEnvSec ?? 0;
        const slouchSec = s?.slouchSec ?? 0;
        const unclassifiedSec = s?.unclassifiedSec ?? 0;

        const badPostureSec = turtleNeckSec + roundShoulderSec + shoulderAsymmetrySec + slouchSec;
        const goodPostureRatio = totalSec > 0 ? Math.round((goodSec / totalSec) * 10000) / 10000 : 0;
        const badPostureRatio = totalSec > 0 ? Math.round((badPostureSec / totalSec) * 10000) / 10000 : 0;

        dailyStats.push({
          date: key,
          weekday: WEEKDAY_VALUES[d.getUTCDay()],
          hasData,
          totalDetectionSec: totalSec,
          goodPostureSec: goodSec,
          badPostureSec,
          turtleNeckSec,
          roundShoulderSec,
          shoulderAsymmetrySec,
          slouchingSec,
          darkEnvSec,
          slouchSec,
          unclassifiedSec,
          goodPostureRatio,
          badPostureRatio,
        });
      }

      return {
        weekStartDate: fromStr,
        weekEndDate: formatDate(to),
        dailyStats,
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 주간 대시보드를 조회할 수 없습니다.');
    }
  }

  async createTimelineEntry(
    userId: string,
    dto: CreateTimelineEntryDto,
  ): Promise<CreateTimelineEntryResponseDto> {
    try {
      const date = parseDate(dto.date);
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }

      if (dto.eventId) {
        const existing = await this.prisma.timelineEntry.findFirst({
          where: { userId, eventId: dto.eventId },
          select: { id: true },
        });
        if (existing) return { accepted: 0 };
      }

      await this.prisma.timelineEntry.create({
        data: {
          userId,
          date,
          time: dto.time,
          eventId: dto.eventId ?? null,
          dominantState: dto.dominantState,
          message: dto.message ?? '',
        },
      });

      return { accepted: 1 };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 타임라인 항목을 저장할 수 없습니다.');
    }
  }

  async getTimeline(userId: string, dateStr: string): Promise<TimelineDashboardDto> {
    try {
      const date = parseDate(dateStr);
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }

      const entries = await this.prisma.timelineEntry.findMany({
        where: { userId, date },
        orderBy: { time: 'asc' },
        select: { time: true, dominantState: true, message: true },
      });

      const buckets: TimelineBucketDto[] = entries.map(e => ({
        time: e.time,
        dominantState: e.dominantState as TimelineBucketDto['dominantState'],
        message: e.message,
      }));

      return { date: dateStr, buckets };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 타임라인을 조회할 수 없습니다.');
    }
  }

  private calcPctChange(current: number | null, prev: number | null): number | null {
    if (current === null || prev === null || prev === 0) return null;
    return Math.round(((current - prev) / prev) * 1000) / 10;
  }
}
