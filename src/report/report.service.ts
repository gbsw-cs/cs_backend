import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryWay, DetectionType, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportHistoryQueryDto } from './dto/report-query.dto.js';
import {
  CurrentReportResponseDto,
  ReportDetailResponseDto,
  ReportHistoryItemDto,
  ReportHistoryResponseDto,
  ReportSessionDto,
  ReportSummaryItemDto,
  ReportSummaryResponseDto,
  ReportTimelineItemDto,
  TopIssueDto,
} from './dto/report-response.dto.js';
import {
  SaveReportDto,
  SaveReportResponseDto,
  WeeklyBatchItemDto,
  WeeklyBatchStatsDto,
} from './dto/internal-report.dto.js';
import {
  addDays,
  currentSeoulWeekRange,
  formatDate,
  parseDate,
  seoulDayStartUtc,
  seoulHourMinute,
  toSeoulDate,
} from '../common/utils/date.util.js';
import { rethrowAsInternal } from '../common/utils/error.util.js';

type TimelineBucketData = {
  good: number;
  turtleNeck: number;
  shoulder: number;
  dark: number;
};

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReportHistory(
    userId: string,
    query: ReportHistoryQueryDto,
  ): Promise<ReportHistoryResponseDto> {
    try {
      const weekStartDateFilter: { gte?: Date; lte?: Date } = {};
      if (query.from)
        weekStartDateFilter.gte = parseDate(query.from) ?? undefined;
      if (query.to) weekStartDateFilter.lte = parseDate(query.to) ?? undefined;

      const reports = await this.prisma.weeklyReport.findMany({
        where: {
          userId,
          ...(Object.keys(weekStartDateFilter).length > 0 && {
            weekStartDate: weekStartDateFilter,
          }),
        },
        orderBy: { weekStartDate: 'desc' },
        select: {
          id: true,
          weekStartDate: true,
          weekEndDate: true,
          deliveryWay: true,
          status: true,
          sentAt: true,
        },
      });

      const items: ReportHistoryItemDto[] = reports.map((r) => ({
        id: r.id,
        weekStartDate: formatDate(r.weekStartDate),
        weekEndDate: formatDate(r.weekEndDate),
        deliveryWay: r.deliveryWay,
        status: r.status,
        sentAt: r.sentAt,
      }));

      return { items };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 리포트 이력을 조회할 수 없습니다.');
    }
  }

  async getReportById(
    userId: string,
    id: string,
  ): Promise<ReportDetailResponseDto> {
    try {
      const report = await this.prisma.weeklyReport.findUnique({
        where: { id },
      });
      if (!report) throw new NotFoundException('리포트를 찾을 수 없습니다.');
      if (report.userId !== userId)
        throw new ForbiddenException('접근 권한이 없습니다.');

      const payload = report.payload as unknown as CurrentReportResponseDto;
      return {
        ...payload,
        id: report.id,
        deliveryWay: report.deliveryWay,
        sentAt: report.sentAt,
        status: report.status,
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 리포트를 조회할 수 없습니다.');
    }
  }

  async getReportSummary(userId: string): Promise<ReportSummaryResponseDto> {
    try {
      const reports = await this.prisma.weeklyReport.findMany({
        where: { userId },
        orderBy: { weekStartDate: 'desc' },
        select: {
          id: true,
          weekStartDate: true,
          weekEndDate: true,
          deliveryWay: true,
          status: true,
          sentAt: true,
          aiSolution: true,
          createdAt: true,
          payload: true,
        },
      });

      const items: ReportSummaryItemDto[] = await Promise.all(
        reports.map(async (r) => {
          const payload = r.payload as unknown as {
            healthScore?: { weekly?: number | null };
            topIssues?: TopIssueDto[];
          };

          const dailyStats = await this.prisma.dailyStat.findMany({
            where: { userId, date: { gte: r.weekStartDate, lte: r.weekEndDate } },
            select: {
              totalDetectionSec: true,
              goodPostureSec: true,
              turtleNeckSec: true,
              roundShoulderSec: true,
              shoulderAsymmetrySec: true,
              slouchingSec: true,
            },
          });

          const totalDetectionSec = dailyStats.reduce((s, d) => s + d.totalDetectionSec, 0);
          const goodPostureSec = dailyStats.reduce((s, d) => s + d.goodPostureSec, 0);
          const badPostureSec = dailyStats.reduce(
            (s, d) => s + d.turtleNeckSec + d.roundShoulderSec + d.shoulderAsymmetrySec + d.slouchingSec,
            0,
          );
          const goodPostureRatio = totalDetectionSec > 0
            ? Math.round((goodPostureSec / totalDetectionSec) * 10000) / 10000
            : 0;
          const riskPercent = totalDetectionSec > 0
            ? Math.round((badPostureSec / totalDetectionSec) * 1000) / 10
            : 0;

          return {
            reportId: r.id,
            status: r.status,
            sentAt: r.sentAt,
            deliveryWay: r.deliveryWay,
            totalDetectionSec,
            goodPostureSec,
            badPostureSec,
            riskPercent,
            goodPostureRatio,
            healthScore: payload.healthScore?.weekly ?? null,
            topIssues: payload.topIssues ?? [],
            aiSolution: r.aiSolution,
            aiAnalyzedAt: r.createdAt,
          };
        }),
      );

      return { items };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 리포트 요약을 조회할 수 없습니다.');
    }
  }

  async getWeeklyBatch(): Promise<WeeklyBatchItemDto[]> {
    try {
      const { weekStart: currentWeekStart } = currentSeoulWeekRange();
      const weekStart = addDays(currentWeekStart, -7);
      const weekEnd = addDays(weekStart, 6);

      const users = await this.prisma.user.findMany({
        where: { userSettings: { reportPushEnabled: true } },
        include: { userSettings: true },
      });

      const results: WeeklyBatchItemDto[] = [];

      for (const user of users) {
        if (!user.userSettings) continue;
        const deliveryWay =
          user.userSettings.reportPushWay === 'EMAIL'
            ? DeliveryWay.EMAIL
            : DeliveryWay.NOTION;

        try {
          const stats = await this.buildPayload(user.id, weekStart, weekEnd);
          results.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            deliveryWay,
            stats,
          });
        } catch {
          // 개별 유저 실패가 전체 배치를 중단하지 않도록 흡수
        }
      }

      return results;
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 주간 배치 데이터를 조회할 수 없습니다.');
    }
  }

  async saveReport(dto: SaveReportDto): Promise<SaveReportResponseDto> {
    try {
      const weekStart = parseDate(dto.weekStartDate);
      const weekEnd = parseDate(dto.weekEndDate);
      if (!weekStart || !weekEnd) {
        throw new Error(
          'weekStartDate 또는 weekEndDate 형식이 올바르지 않습니다.',
        );
      }

      const topIssueType = dto.stats.topIssues?.[0]?.type ?? null;
      const payload = { ...dto.stats, aiSolution: dto.aiSolution } as object;

      const report = await this.prisma.weeklyReport.upsert({
        where: {
          userId_weekStartDate_deliveryWay: {
            userId: dto.userId,
            weekStartDate: weekStart,
            deliveryWay: dto.deliveryWay,
          },
        },
        update: {
          status: ReportStatus.PENDING,
          payload,
          aiSolution: dto.aiSolution,
          topIssueType: topIssueType as DetectionType | null,
          errorMessage: null,
        },
        create: {
          userId: dto.userId,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          deliveryWay: dto.deliveryWay,
          status: ReportStatus.PENDING,
          payload,
          aiSolution: dto.aiSolution,
          topIssueType: topIssueType as DetectionType | null,
        },
      });

      return { reportId: report.id };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 리포트를 저장할 수 없습니다.');
    }
  }

  async markReportSent(reportId: string): Promise<void> {
    try {
      await this.prisma.weeklyReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.SENT, sentAt: new Date() },
      });
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 리포트 발송 완료 처리에 실패했습니다.');
    }
  }

  async buildPayload(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<WeeklyBatchStatsDto> {
    const weekEndExclusive = addDays(weekEnd, 1);

    const [dailyStats, sessions, events] = await Promise.all([
      this.prisma.dailyStat.findMany({
        where: { userId, date: { gte: weekStart, lte: weekEnd } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.detectionSession.findMany({
        where: {
          userId,
          startedAt: {
            gte: seoulDayStartUtc(weekStart),
            lt: seoulDayStartUtc(weekEndExclusive),
          },
          endedAt: { not: null },
        },
        select: { startedAt: true, endedAt: true, totalDurationSec: true },
      }),
      this.prisma.detectionEvent.findMany({
        where: {
          userId,
          detectedAt: {
            gte: seoulDayStartUtc(weekStart),
            lt: seoulDayStartUtc(weekEndExclusive),
          },
        },
        select: { type: true, durationSec: true, detectedAt: true },
      }),
    ]);

    // ─── session ───────────────────────────────────────────────────────────
    const session: ReportSessionDto = {
      firstStartedAt: this.getFirstStartedAt(sessions),
      lastEndedAt: this.getLastEndedAt(sessions),
      totalDetectionSec: sessions.reduce(
        (sum, s) => sum + s.totalDurationSec,
        0,
      ),
    };

    // ─── health score ───────────────────────────────────────────────────────
    const dailyScoreMap = new Map(
      dailyStats.map((s) => [formatDate(s.date), s.healthScore]),
    );
    const daily: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      daily.push(dailyScoreMap.get(formatDate(d)) ?? null);
    }
    const validScores = daily.filter((s): s is number => s !== null);
    const weeklyScore =
      validScores.length > 0
        ? Math.round(
            validScores.reduce((a, b) => a + b, 0) / validScores.length,
          )
        : null;

    // ─── top issues ─────────────────────────────────────────────────────────
    const issueMap = new Map<string, { durationSec: number; count: number }>();
    for (const e of events) {
      if (e.type === DetectionType.GOOD_POSTURE) continue;
      const prev = issueMap.get(e.type) ?? { durationSec: 0, count: 0 };
      issueMap.set(e.type, {
        durationSec: prev.durationSec + e.durationSec,
        count: prev.count + 1,
      });
    }
    const topIssues: TopIssueDto[] = Array.from(issueMap.entries())
      .sort((a, b) => b[1].durationSec - a[1].durationSec)
      .slice(0, 3)
      .map(([type, stats], idx) => ({
        type,
        durationSec: stats.durationSec,
        count: stats.count,
        rank: idx + 1,
      }));

    // ─── timeline (30분 버킷, 데이터 있는 것만) ──────────────────────────────
    const bucketMap = new Map<string, TimelineBucketData>();

    for (const e of events) {
      const { hour, minute } = seoulHourMinute(e.detectedAt);
      const dateStr = formatDate(toSeoulDate(e.detectedAt));
      const startMin = minute >= 30 ? 30 : 0;
      const key = `${dateStr}|${hour}|${startMin}`;
      const b = bucketMap.get(key) ?? {
        good: 0,
        turtleNeck: 0,
        shoulder: 0,
        dark: 0,
      };
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
      bucketMap.set(key, b);
    }

    const timeline: ReportTimelineItemDto[] = Array.from(bucketMap.entries())
      .map(([key, b]) => {
        const [date, hourStr, minStr] = key.split('|');
        const total = b.good + b.turtleNeck + b.shoulder + b.dark;
        const dominantState =
          total > 0
            ? (b.good >= b.turtleNeck && b.good >= b.shoulder && b.good >= b.dark
                ? 'GOOD'
                : b.turtleNeck >= b.shoulder && b.turtleNeck >= b.dark
                  ? 'TURTLE_NECK'
                  : b.shoulder >= b.dark
                    ? 'SHOULDER_ISSUE'
                    : 'DARK_ENV')
            : null;
        const healthScore =
          total > 0
            ? Math.max(0, Math.min(100, Math.round((b.good / total) * 100)))
            : null;
        return {
          date,
          startHour: Number(hourStr),
          startMin: Number(minStr),
          dominantState,
          healthScore,
        };
      })
      .filter((t) => t.dominantState !== null)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.startMin - b.startMin;
      });

    return {
      weekStartDate: formatDate(weekStart),
      weekEndDate: formatDate(weekEnd),
      session,
      healthScore: { weekly: weeklyScore, daily },
      timeline,
      topIssues,
    };
  }

  private getFirstStartedAt(sessions: { startedAt: Date }[]): Date | null {
    if (sessions.length === 0) return null;
    return sessions.reduce(
      (min, s) => (s.startedAt.getTime() < min.getTime() ? s.startedAt : min),
      sessions[0].startedAt,
    );
  }

  private getLastEndedAt(sessions: { endedAt: Date | null }[]): Date | null {
    return sessions.reduce<Date | null>((max, s) => {
      if (!s.endedAt) return max;
      if (!max) return s.endedAt;
      return s.endedAt.getTime() > max.getTime() ? s.endedAt : max;
    }, null);
  }
}
