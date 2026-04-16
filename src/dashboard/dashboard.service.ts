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
  DailyHourDto,
} from './dto/daily-response.dto.js';
import {
  TimelineBucketDto,
  TimelineDashboardDto,
  TimelineDominantState,
} from './dto/timeline-response.dto.js';
import {
  TodayBreakdownDto,
  TodayDashboardDto,
} from './dto/today-response.dto.js';
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

  async getToday(userId: string): Promise<TodayDashboardDto> {
    try {
      const today = this.todaySeoulDate();
      const [stat, settings] = await Promise.all([
        this.prisma.dailyStat.findUnique({
          where: { userId_date: { userId, date: today } },
        }),
        this.prisma.userSettings.findUnique({ where: { userId } }),
      ]);

      const total = stat?.totalDetectionSec ?? 0;
      const good = stat?.goodPostureSec ?? 0;
      const goodRatio =
        total > 0 ? Math.round((good / total) * 100) / 100 : 0;

      const breakdown: TodayBreakdownDto = {
        turtleNeckSec: stat?.turtleNeckSec ?? 0,
        shoulderIssueSec: stat?.shoulderIssueSec ?? 0,
        darkEnvSec: stat?.darkEnvSec ?? 0,
        turtleNeckCount: stat?.turtleNeckCount ?? 0,
        shoulderIssueCount: stat?.shoulderIssueCount ?? 0,
        darkEnvCount: stat?.darkEnvCount ?? 0,
      };

      return {
        date: this.formatDate(today),
        healthScore: stat?.healthScore ?? null,
        totalDetectionSec: total,
        goodPostureRatio: goodRatio,
        breakdown,
        darkDetectionMode:
          settings?.darkDetectionEnabled === false ? 'OFF' : 'ON',
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 오늘 대시보드를 조회할 수 없습니다.',
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
      for (let i = 0; i < 7; i++) {
        const d = this.addDays(from, i);
        const key = this.formatDate(d);
        const s = byDate.get(key);
        days.push({
          date: key,
          totalDetectionSec: s?.totalDetectionSec ?? 0,
          healthScore: s?.healthScore ?? null,
          goodPostureSec: s?.goodPostureSec ?? 0,
          turtleNeckSec: s?.turtleNeckSec ?? 0,
          shoulderIssueSec: s?.shoulderIssueSec ?? 0,
          darkEnvSec: s?.darkEnvSec ?? 0,
          goodPostureCount: s?.goodPostureCount ?? 0,
          turtleNeckCount: s?.turtleNeckCount ?? 0,
          shoulderIssueCount: s?.shoulderIssueCount ?? 0,
          darkEnvCount: s?.darkEnvCount ?? 0,
        });
      }

      let worstWeekday: Weekday | null = null;
      let worstScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < days.length; i++) {
        const score = days[i].healthScore;
        if (score == null) continue;
        if (score < worstScore) {
          worstScore = score;
          worstWeekday = WEEKDAY_VALUES[this.addDays(from, i).getUTCDay()];
        }
      }

      const events = await this.prisma.detectionEvent.findMany({
        where: {
          userId,
          detectedAt: {
            gte: this.seoulDayStartUtc(from),
            lt: this.seoulDayStartUtc(this.addDays(to, 1)),
          },
          type: { not: DetectionType.GOOD_POSTURE },
        },
        select: { detectedAt: true, durationSec: true },
      });
      const hourSec = new Array(24).fill(0) as number[];
      for (const e of events) {
        hourSec[this.seoulHour(e.detectedAt)] += e.durationSec;
      }
      let worstHour: number | null = null;
      let maxSec = 0;
      for (let h = 0; h < 24; h++) {
        if (hourSec[h] > maxSec) {
          maxSec = hourSec[h];
          worstHour = h;
        }
      }

      return {
        from: fromStr,
        to: this.formatDate(to),
        days,
        worstWeekday,
        worstHour,
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

      type Bucket = {
        good: number;
        turtleNeck: number;
        shoulder: number;
        dark: number;
        turtleNeckC: number;
        shoulderC: number;
        darkC: number;
      };
      const hours: Bucket[] = Array.from({ length: 24 }, () => ({
        good: 0,
        turtleNeck: 0,
        shoulder: 0,
        dark: 0,
        turtleNeckC: 0,
        shoulderC: 0,
        darkC: 0,
      }));

      for (const e of events) {
        const b = hours[this.seoulHour(e.detectedAt)];
        switch (e.type) {
          case DetectionType.GOOD_POSTURE:
            b.good += e.durationSec;
            break;
          case DetectionType.TURTLE_NECK:
            b.turtleNeck += e.durationSec;
            b.turtleNeckC += 1;
            break;
          case DetectionType.ROUND_SHOULDER:
          case DetectionType.SHOULDER_ASYMMETRY:
            b.shoulder += e.durationSec;
            b.shoulderC += 1;
            break;
          case DetectionType.DARK_ENV:
            b.dark += e.durationSec;
            b.darkC += 1;
            break;
        }
      }

      const result: DailyHourDto[] = hours.map((b, h) => {
        const total = b.good + b.turtleNeck + b.shoulder + b.dark;
        const ratio = (n: number) =>
          total > 0 ? Math.round((n / total) * 100) / 100 : 0;
        return {
          hour: h,
          goodRatio: ratio(b.good),
          turtleNeckRatio: ratio(b.turtleNeck),
          shoulderIssueRatio: ratio(b.shoulder),
          darkEnvRatio: ratio(b.dark),
          turtleNeckCount: b.turtleNeckC,
          shoulderIssueCount: b.shoulderC,
          darkEnvCount: b.darkC,
        };
      });

      return { date: dateStr, hours: result };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(
        '서버 오류: 일간 대시보드를 조회할 수 없습니다.',
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

      const events = await this.fetchSeoulDayEvents(userId, date);

      type Bucket = {
        good: number;
        turtleNeck: number;
        shoulder: number;
        dark: number;
      };
      const buckets: Bucket[] = Array.from({ length: 48 }, () => ({
        good: 0,
        turtleNeck: 0,
        shoulder: 0,
        dark: 0,
      }));

      for (const e of events) {
        const { hour, minute } = this.seoulHourMinute(e.detectedAt);
        const idx = hour * 2 + (minute >= 30 ? 1 : 0);
        const b = buckets[idx];
        switch (e.type) {
          case DetectionType.GOOD_POSTURE:
            b.good += e.durationSec;
            break;
          case DetectionType.TURTLE_NECK:
            b.turtleNeck += e.durationSec;
            break;
          case DetectionType.ROUND_SHOULDER:
          case DetectionType.SHOULDER_ASYMMETRY:
            b.shoulder += e.durationSec;
            break;
          case DetectionType.DARK_ENV:
            b.dark += e.durationSec;
            break;
        }
      }

      const result: TimelineBucketDto[] = buckets.map((b, idx) => {
        const total = b.good + b.turtleNeck + b.shoulder + b.dark;
        let dominantState: TimelineDominantState | null = null;
        let healthScore: number | null = null;
        if (total > 0) {
          const entries: Array<[TimelineDominantState, number]> = [
            ['GOOD', b.good],
            ['TURTLE_NECK', b.turtleNeck],
            ['SHOULDER_ISSUE', b.shoulder],
            ['DARK_ENV', b.dark],
          ];
          dominantState = entries.reduce((acc, cur) =>
            cur[1] > acc[1] ? cur : acc,
          )[0];
          healthScore = Math.max(
            0,
            Math.min(100, Math.round((b.good / total) * 100)),
          );
        }
        return {
          startHour: Math.floor(idx / 2),
          startMin: (idx % 2) * 30,
          dominantState,
          healthScore,
        };
      });

      return { date: dateStr, buckets: result };
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
