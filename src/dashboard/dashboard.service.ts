import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DetectionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DailyDashboardDto,
  DailySlotDto,
} from './dto/daily-response.dto.js';
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
  WEEKDAY_VALUES,
  Weekday,
  WeeklyDashboardDto,
  WeeklyDayDto,
} from './dto/weekly-response.dto.js';

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayHealthScore(userId: string): Promise<TodayHealthScoreDto> {
    try {
      const today = this.todaySeoulDate();
      const yesterday = this.addDays(today, -1);
      const lastWeekSameDay = this.addDays(today, -7);

      const [todayStat, yesterdayStat, lastWeekStat] = await Promise.all([
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } } }),
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: yesterday } } }),
        this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: lastWeekSameDay } } }),
      ]);

      const postureScore = todayStat?.postureScore ?? null;
      const warningCount = todayStat?.warningCount ?? 0;

      return {
        date: this.formatDate(today),
        postureScore,
        warningCount,
        vsYesterday: this.calcPctChange(postureScore, yesterdayStat?.postureScore ?? null),
        vsLastWeek: this.calcPctChange(postureScore, lastWeekStat?.postureScore ?? null),
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 오늘의 건강 점수를 조회할 수 없습니다.',
      );
    }
  }

  async getWeekly(
    userId: string,
    fromStr: string,
  ): Promise<WeeklyDashboardDto> {
    try {
      const from = this.parseDate(fromStr);
      if (!from) {
        throw new BadRequestException('from은 YYYY-MM-DD 형식이어야 합니다.');
      }
      if (from.getUTCDay() !== 1) {
        throw new BadRequestException('from은 월요일이어야 합니다.');
      }
      const to = this.addDays(from, 6);

      const stats = await this.prisma.dailyStat.findMany({
        where: { userId, date: { gte: from, lte: to } },
      });
      const byDate = new Map(stats.map((s) => [this.formatDate(s.date), s]));

      const days: WeeklyDayDto[] = [];
      let turtleNeckTotalSec = 0;
      let roundShoulderTotalSec = 0;
      let shoulderAsymmetryTotalSec = 0;
      let darkEnvTotalSec = 0;
      let weeklyGoodPostureSec = 0;
      let weeklyTotalDetectionSec = 0;

      for (let i = 0; i < 7; i++) {
        const d = this.addDays(from, i);
        const key = this.formatDate(d);
        const s = byDate.get(key);

        const totalSec = s?.totalDetectionSec ?? 0;
        const goodSec = s?.goodPostureSec ?? 0;
        const badPostureRatio = totalSec > 0
          ? Math.round(((totalSec - goodSec) / totalSec) * 100)
          : 0;

        turtleNeckTotalSec += s?.turtleNeckSec ?? 0;
        roundShoulderTotalSec += s?.roundShoulderSec ?? 0;
        shoulderAsymmetryTotalSec += s?.shoulderAsymmetrySec ?? 0;
        darkEnvTotalSec += s?.darkEnvSec ?? 0;
        weeklyGoodPostureSec += goodSec;
        weeklyTotalDetectionSec += totalSec;

        days.push({ date: key, badPostureRatio });
      }

      const goodPostureRatio = weeklyTotalDetectionSec > 0
        ? Math.round((weeklyGoodPostureSec / weeklyTotalDetectionSec) * 100)
        : 0;

      let worstWeekday: Weekday | null = null;
      let worstScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 7; i++) {
        const key = this.formatDate(this.addDays(from, i));
        const score = byDate.get(key)?.healthScore ?? null;
        if (score == null) continue;
        if (score < worstScore) {
          worstScore = score;
          worstWeekday = WEEKDAY_VALUES[this.addDays(from, i).getUTCDay()];
        }
      }

      return {
        from: fromStr,
        to: this.formatDate(to),
        days,
        turtleNeckTotalSec,
        roundShoulderTotalSec,
        shoulderAsymmetryTotalSec,
        darkEnvTotalSec,
        goodPostureRatio,
        worstWeekday,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 주간 대시보드를 조회할 수 없습니다.',
      );
    }
  }

  async getDaily(
    userId: string,
    dateStr: string,
  ): Promise<DailyDashboardDto> {
    try {
      const date = this.parseDate(dateStr);
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }

      const events = await this.fetchSeoulDayEvents(userId, date);

      type SlotEvent = { startMs: number; endMs: number; type: DetectionType };
      const slots: SlotEvent[][] = Array.from({ length: 8 }, () => []);

      for (const e of events) {
        const slotIndex = Math.floor(this.seoulHour(e.detectedAt) / 3);
        const startMs = e.detectedAt.getTime();
        slots[slotIndex].push({ startMs, endMs: startMs + e.durationSec * 1000, type: e.type });
      }

      const overlaps = (a: SlotEvent, b: SlotEvent) =>
        a.type !== b.type && a.startMs < b.endMs && b.startMs < a.endMs;

      const result: DailySlotDto[] = slots.map((bucket, i) => {
        const goodEvents = bucket.filter((e) => e.type === DetectionType.GOOD_POSTURE);
        const badEvents = bucket.filter((e) => e.type !== DetectionType.GOOD_POSTURE);

        let singleBadCount = 0;
        let overlappingCount = 0;
        for (const e of badEvents) {
          if (badEvents.some((other) => other !== e && overlaps(e, other))) {
            overlappingCount++;
          } else {
            singleBadCount++;
          }
        }

        return {
          slotIndex: i,
          startHour: i * 3,
          goodPostureCount: goodEvents.length,
          singleBadCount,
          overlappingCount,
        };
      });

      return { date: dateStr, slots: result };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 일간 대시보드를 조회할 수 없습니다.',
      );
    }
  }

  async createTimelineEntry(
    userId: string,
    dto: CreateTimelineEntryDto,
  ): Promise<CreateTimelineEntryResponseDto> {
    try {
      const date = this.parseDate(dto.date);
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }

      await this.prisma.timelineEntry.create({
        data: {
          userId,
          date,
          time: dto.time,
          dominantState: dto.dominantState,
          message: dto.message ?? '',
        },
      });

      return { accepted: 1 };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 타임라인 항목을 저장할 수 없습니다.',
      );
    }
  }

  async getTimeline(
    userId: string,
    dateStr: string,
  ): Promise<TimelineDashboardDto> {
    try {
      const date = this.parseDate(dateStr);
      if (!date) {
        throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다.');
      }

      const entries = await this.prisma.timelineEntry.findMany({
        where: { userId, date },
        orderBy: { time: 'asc' },
        select: { time: true, dominantState: true, message: true },
      });

      const buckets: TimelineBucketDto[] = entries.map((e) => ({
        time: e.time,
        dominantState: e.dominantState as TimelineBucketDto['dominantState'],
        message: e.message,
      }));

      return { date: dateStr, buckets };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 타임라인을 조회할 수 없습니다.',
      );
    }
  }

  // ---------- helpers ----------

  private async fetchSeoulDayEvents(userId: string, date: Date) {
    return this.prisma.detectionEvent.findMany({
      where: {
        userId,
        detectedAt: {
          gte: this.seoulDayStartUtc(date),
          lt: this.seoulDayStartUtc(this.addDays(date, 1)),
        },
      },
      select: { detectedAt: true, durationSec: true, type: true },
    });
  }

  /** "YYYY-MM-DD" → Date(midnight UTC, same calendar date). 잘못된 형식이면 null. */
  private parseDate(s: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      return null;
    }
    return dt;
  }

  /** Date → "YYYY-MM-DD" (UTC date 부분만 사용). DailyStat.date도 동일 표현. */
  private formatDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private addDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * DAY_MS);
  }

  /** 캘린더 일자(date-only UTC)를 Seoul 자정의 UTC 인스턴트로 변환. */
  private seoulDayStartUtc(d: Date): Date {
    return new Date(d.getTime() - SEOUL_OFFSET_MS);
  }

  private seoulHour(d: Date): number {
    return new Date(d.getTime() + SEOUL_OFFSET_MS).getUTCHours();
  }

  private seoulHourMinute(d: Date): { hour: number; minute: number } {
    const s = new Date(d.getTime() + SEOUL_OFFSET_MS);
    return { hour: s.getUTCHours(), minute: s.getUTCMinutes() };
  }

  private calcPctChange(current: number | null, prev: number | null): number | null {
    if (current === null || prev === null || prev === 0) return null;
    return Math.round(((current - prev) / prev) * 1000) / 10;
  }

  private todaySeoulDate(): Date {
    const seoul = new Date(Date.now() + SEOUL_OFFSET_MS);
    return new Date(
      Date.UTC(
        seoul.getUTCFullYear(),
        seoul.getUTCMonth(),
        seoul.getUTCDate(),
      ),
    );
  }
}
