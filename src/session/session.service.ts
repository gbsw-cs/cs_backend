import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DetectionType, Prisma, SessionSource, SessionStatus } from '@prisma/client';
import { BadgeService } from '../badge/badge.service.js';
import { FcmService } from '../fcm/fcm.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EndSessionDto } from './dto/end-session.dto.js';
import { PauseSessionDto, PauseSessionResponseDto } from './dto/pause-session.dto.js';
import { ResumeSessionDto, ResumeSessionResponseDto } from './dto/resume-session.dto.js';
import {
  CurrentSessionResponseDto,
  SessionEndResponseDto,
  SessionStartResponseDto,
  UploadEventsResponseDto,
} from './dto/session-response.dto.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { UploadEventsDto } from './dto/upload-events.dto.js';
import {
  UploadSegmentsDto,
  UploadSegmentsResponseDto,
} from './dto/upload-segments.dto.js';
import {
  addDays,
  formatDate,
  SEOUL_OFFSET_MS,
  seoulDayStartUtc,
  toSeoulDate,
} from '../common/utils/date.util.js';
import { rethrowAsInternal } from '../common/utils/error.util.js';

const POSTURE_SCORE_WEIGHTS = {
  turtleNeck: 30,
  roundShoulder: 30,
  shoulderAsymmetry: 30,
  darkEnv: 10,
  slouch: 30,
} as const;

const GAP_THRESHOLD_SEC = 300;
const CLOCK_SKEW_MS = 60_000;

interface AggregateBuckets {
  goodPostureSec: number;
  goodPostureCount: number;
  turtleNeckSec: number;
  turtleNeckCount: number;
  roundShoulderSec: number;
  roundShoulderCount: number;
  shoulderAsymmetrySec: number;
  shoulderAsymmetryCount: number;
  darkEnvSec: number;
  darkEnvCount: number;
  slouchSec: number;
  slouchCount: number;
}

interface PreparedSegment {
  sessionId: string;
  userId: string;
  state: DetectionType;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  clientEventId: string | null;
}

type PauseRecord = { pausedAt: Date; resumedAt: Date | null };

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badgeService: BadgeService,
    private readonly fcmService: FcmService,
  ) {}

  async start(userId: string, dto: StartSessionDto): Promise<SessionStartResponseDto> {
    try {
      const active = await this.prisma.detectionSession.findFirst({
        where: { userId, endedAt: null },
      });
      if (active) {
        throw new ConflictException('이미 진행 중인 세션이 존재합니다.');
      }
      const session = await this.prisma.detectionSession.create({
        data: { userId, startedAt: new Date(dto.startedAt), source: dto.source ?? SessionSource.WEB },
      });
      return { sessionId: session.id, startedAt: session.startedAt, source: session.source };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 세션을 시작할 수 없습니다.');
    }
  }

  async pause(userId: string, sessionId: string, dto: PauseSessionDto): Promise<PauseSessionResponseDto> {
    try {
      const session = await this.findSessionForUser(userId, sessionId);
      if (session.endedAt) {
        throw new ConflictException('종료된 세션은 일시정지할 수 없습니다.');
      }
      if (session.status === SessionStatus.PAUSED) {
        throw new ConflictException('이미 일시정지된 세션입니다.');
      }

      const pausedAt = new Date(dto.pausedAt);
      this.validateTimestamp(pausedAt, session.startedAt, 'pausedAt');

      await this.prisma.$transaction([
        this.prisma.detectionSession.update({
          where: { id: sessionId },
          data: { status: SessionStatus.PAUSED, pausedAt },
        }),
        this.prisma.sessionPause.create({
          data: { sessionId, pausedAt },
        }),
      ]);

      return {
        sessionId,
        status: 'PAUSED',
        pausedAt,
        totalPausedSec: session.totalPausedSec,
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 세션을 일시정지할 수 없습니다.');
    }
  }

  async resume(userId: string, sessionId: string, dto: ResumeSessionDto): Promise<ResumeSessionResponseDto> {
    try {
      const session = await this.findSessionForUser(userId, sessionId);
      if (session.endedAt) {
        throw new ConflictException('종료된 세션은 재개할 수 없습니다.');
      }
      if (session.status !== SessionStatus.PAUSED) {
        throw new ConflictException('일시정지 상태가 아닌 세션은 재개할 수 없습니다.');
      }

      const resumedAt = new Date(dto.resumedAt);
      this.validateTimestamp(resumedAt, session.pausedAt!, 'resumedAt');
      if (resumedAt <= session.pausedAt!) {
        throw new UnprocessableEntityException('resumedAt은 pausedAt 이후여야 합니다.');
      }

      const durationSec = Math.floor((resumedAt.getTime() - session.pausedAt!.getTime()) / 1000);
      const newTotalPausedSec = session.totalPausedSec + durationSec;

      await this.prisma.$transaction([
        this.prisma.sessionPause.updateMany({
          where: { sessionId, resumedAt: null },
          data: { resumedAt, durationSec },
        }),
        this.prisma.detectionSession.update({
          where: { id: sessionId },
          data: {
            status: SessionStatus.ACTIVE,
            pausedAt: null,
            totalPausedSec: newTotalPausedSec,
          },
        }),
      ]);

      return {
        sessionId,
        status: 'ACTIVE',
        resumedAt,
        totalPausedSec: newTotalPausedSec,
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 세션을 재개할 수 없습니다.');
    }
  }

  async end(userId: string, sessionId: string, dto: EndSessionDto): Promise<SessionEndResponseDto> {
    try {
      const session = await this.findSessionForUser(userId, sessionId);
      if (session.endedAt) {
        throw new ConflictException('이미 종료된 세션입니다.');
      }

      const endedAt = new Date(dto.endedAt);

      // Finalize ongoing pause if PAUSED
      let totalPausedSec = session.totalPausedSec;
      if (session.status === SessionStatus.PAUSED) {
        const finalPauseSec = Math.max(
          0,
          Math.floor((endedAt.getTime() - session.pausedAt!.getTime()) / 1000),
        );
        totalPausedSec += finalPauseSec;
        await this.prisma.$transaction([
          this.prisma.sessionPause.updateMany({
            where: { sessionId, resumedAt: null },
            data: { resumedAt: endedAt, durationSec: finalPauseSec },
          }),
          this.prisma.detectionSession.update({
            where: { id: sessionId },
            data: { status: SessionStatus.ACTIVE, pausedAt: null, totalPausedSec },
          }),
        ]);
      }

      const rawDurationSec = Math.max(
        0,
        Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      );
      const totalDetectionSec = Math.max(0, rawDurationSec - totalPausedSec);

      const pauses = await this.prisma.sessionPause.findMany({ where: { sessionId } });
      const segmentCount = await this.prisma.detectionSegment.count({ where: { sessionId } });

      if (segmentCount > 0) {
        return await this.endWithSegments(
          userId, sessionId, session.startedAt, endedAt, totalDetectionSec, pauses,
        );
      }
      return await this.endWithEvents(userId, sessionId, endedAt, totalDetectionSec);
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 세션을 종료할 수 없습니다.');
    }
  }

  private async endWithSegments(
    userId: string,
    sessionId: string,
    sessionStart: Date,
    endedAt: Date,
    totalDetectionSec: number,
    pauses: PauseRecord[],
  ): Promise<SessionEndResponseDto> {
    await this.fillGapsWithUnclassified(userId, sessionId, sessionStart, endedAt, pauses);

    const allSegments = await this.prisma.detectionSegment.findMany({
      where: { sessionId },
      orderBy: { startedAt: 'asc' },
    });

    const secBuckets = this.aggregateSegmentSecs(allSegments);
    const shoulderIssueSec = secBuckets.roundShoulderSec + secBuckets.shoulderAsymmetrySec;
    const healthScore = this.computeHealthScore(secBuckets.goodPostureSec, totalDetectionSec);

    const countByState = (state: DetectionType) => allSegments.filter(s => s.state === state).length;
    const goodPostureCount = countByState(DetectionType.GOOD_POSTURE);
    const turtleNeckCount = countByState(DetectionType.TURTLE_NECK);
    const roundShoulderCount = countByState(DetectionType.ROUND_SHOULDER);
    const shoulderAsymmetryCount = countByState(DetectionType.SHOULDER_ASYMMETRY);
    const darkEnvCount = countByState(DetectionType.DARK_ENV);
    const slouchCount = countByState(DetectionType.SLOUCHING);

    await this.prisma.detectionSession.update({
      where: { id: sessionId },
      data: {
        endedAt,
        status: SessionStatus.ENDED,
        totalDurationSec: totalDetectionSec,
        goodPostureSec: secBuckets.goodPostureSec,
        turtleNeckSec: secBuckets.turtleNeckSec,
        shoulderIssueSec,
        darkEnvSec: secBuckets.darkEnvSec,
        goodPostureCount,
        turtleNeckCount,
        shoulderIssueCount: roundShoulderCount + shoulderAsymmetryCount,
        darkEnvCount,
        healthScore,
      },
    });

    const affectedDates = new Set(allSegments.map(s => formatDate(toSeoulDate(s.startedAt))));
    await Promise.all([...affectedDates].map(d => this.recomputeDailyFromSegments(userId, d)));

    return await this.finalizeBadgesAndReturn(userId, sessionId, {
      totalDurationSec: totalDetectionSec,
      goodPostureSec: secBuckets.goodPostureSec,
      turtleNeckSec: secBuckets.turtleNeckSec,
      shoulderIssueSec,
      darkEnvSec: secBuckets.darkEnvSec,
      goodPostureCount,
      turtleNeckCount,
      shoulderIssueCount: roundShoulderCount + shoulderAsymmetryCount,
      darkEnvCount,
      slouchSec: secBuckets.slouchSec,
      slouchCount,
      healthScore,
    });
  }

  private async endWithEvents(
    userId: string,
    sessionId: string,
    endedAt: Date,
    totalDetectionSec: number,
  ): Promise<SessionEndResponseDto> {
    const buckets = await this.aggregateBySession(sessionId);
    const healthScore = this.computeHealthScore(buckets.goodPostureSec, totalDetectionSec);
    const seoulDate = toSeoulDate(endedAt);
    const shoulderIssueSec = buckets.roundShoulderSec + buckets.shoulderAsymmetrySec;
    const shoulderIssueCount = buckets.roundShoulderCount + buckets.shoulderAsymmetryCount;

    await this.prisma.$transaction([
      this.prisma.detectionSession.update({
        where: { id: sessionId },
        data: {
          endedAt,
          status: SessionStatus.ENDED,
          totalDurationSec: totalDetectionSec,
          goodPostureSec: buckets.goodPostureSec,
          turtleNeckSec: buckets.turtleNeckSec,
          shoulderIssueSec,
          darkEnvSec: buckets.darkEnvSec,
          goodPostureCount: buckets.goodPostureCount,
          turtleNeckCount: buckets.turtleNeckCount,
          shoulderIssueCount,
          darkEnvCount: buckets.darkEnvCount,
          healthScore,
        },
      }),
      this.prisma.dailyStat.upsert({
        where: { userId_date: { userId, date: seoulDate } },
        create: {
          userId, date: seoulDate,
          totalDetectionSec,
          goodPostureSec: buckets.goodPostureSec,
          turtleNeckSec: buckets.turtleNeckSec,
          roundShoulderSec: buckets.roundShoulderSec,
          shoulderAsymmetrySec: buckets.shoulderAsymmetrySec,
          darkEnvSec: buckets.darkEnvSec,
          slouchingSec: buckets.slouchSec,
          goodPostureCount: buckets.goodPostureCount,
          turtleNeckCount: buckets.turtleNeckCount,
          roundShoulderCount: buckets.roundShoulderCount,
          shoulderAsymmetryCount: buckets.shoulderAsymmetryCount,
          darkEnvCount: buckets.darkEnvCount,
          slouchingCount: buckets.slouchCount,
          healthScore,
        },
        update: {
          totalDetectionSec: { increment: totalDetectionSec },
          goodPostureSec: { increment: buckets.goodPostureSec },
          turtleNeckSec: { increment: buckets.turtleNeckSec },
          roundShoulderSec: { increment: buckets.roundShoulderSec },
          shoulderAsymmetrySec: { increment: buckets.shoulderAsymmetrySec },
          darkEnvSec: { increment: buckets.darkEnvSec },
          slouchingSec: { increment: buckets.slouchSec },
          goodPostureCount: { increment: buckets.goodPostureCount },
          turtleNeckCount: { increment: buckets.turtleNeckCount },
          roundShoulderCount: { increment: buckets.roundShoulderCount },
          shoulderAsymmetryCount: { increment: buckets.shoulderAsymmetryCount },
          darkEnvCount: { increment: buckets.darkEnvCount },
          slouchingCount: { increment: buckets.slouchCount },
        },
      }),
    ]);

    await this.recomputeDailyScores(userId, seoulDate);

    return await this.finalizeBadgesAndReturn(userId, sessionId, {
      totalDurationSec: totalDetectionSec,
      goodPostureSec: buckets.goodPostureSec,
      turtleNeckSec: buckets.turtleNeckSec,
      shoulderIssueSec,
      darkEnvSec: buckets.darkEnvSec,
      slouchSec: buckets.slouchSec,
      goodPostureCount: buckets.goodPostureCount,
      turtleNeckCount: buckets.turtleNeckCount,
      shoulderIssueCount,
      darkEnvCount: buckets.darkEnvCount,
      slouchCount: buckets.slouchCount,
      healthScore,
    });
  }

  private async finalizeBadgesAndReturn(
    userId: string,
    sessionId: string,
    data: Omit<SessionEndResponseDto, 'sessionId' | 'newBadges'>,
  ): Promise<SessionEndResponseDto> {
    const newBadges = await this.badgeService.evaluateNewBadges(userId);
    if (newBadges.length > 0) {
      const body =
        newBadges.length === 1
          ? `"${newBadges[0].name}" 배지를 획득했어요!`
          : `배지 ${newBadges.length}개를 획득했어요!`;
      void this.fcmService.sendToUser(userId, { title: '새 배지 획득!', body, data: { type: 'BADGE' } });
    }
    return { sessionId, ...data, newBadges };
  }

  async uploadSegments(
    userId: string,
    sessionId: string,
    dto: UploadSegmentsDto,
  ): Promise<UploadSegmentsResponseDto> {
    try {
      const session = await this.findSessionForUser(userId, sessionId);
      if (session.endedAt) {
        throw new ConflictException('종료된 세션에는 구간을 추가할 수 없습니다.');
      }
      if (session.status === SessionStatus.PAUSED) {
        throw new ConflictException('일시정지된 세션에는 구간을 추가할 수 없습니다.');
      }
      if (dto.source && session.source !== dto.source) {
        throw new ConflictException('요청 source가 세션 source와 일치하지 않습니다.');
      }

      const incoming = dto.segments.map(s => {
        const startedAt = new Date(s.startedAt);
        const endedAt = new Date(s.endedAt);
        if (endedAt <= startedAt) {
          throw new BadRequestException(
            `endedAt은 startedAt보다 커야 합니다: ${s.clientEventId ?? s.startedAt}`,
          );
        }
        return { ...s, startedAt, endedAt };
      });

      const batchIds = new Set<string>();
      for (const s of incoming) {
        if (s.clientEventId) {
          if (batchIds.has(s.clientEventId)) {
            throw new BadRequestException(`배치 내 중복 clientEventId: ${s.clientEventId}`);
          }
          batchIds.add(s.clientEventId);
        }
      }

      const clientEventIds = [...batchIds];
      const existingIds =
        clientEventIds.length > 0
          ? await this.prisma.detectionSegment.findMany({
              where: { clientEventId: { in: clientEventIds } },
              select: { clientEventId: true },
            })
          : [];
      const storedIds = new Set(existingIds.map(r => r.clientEventId));
      const newItems = incoming.filter(s => !s.clientEventId || !storedIds.has(s.clientEventId));

      if (newItems.length === 0) return { accepted: 0 };

      newItems.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

      for (let i = 1; i < newItems.length; i++) {
        if (newItems[i].startedAt < newItems[i - 1].endedAt) {
          throw new ConflictException('업로드된 구간들 사이에 시간이 중복됩니다.');
        }
      }

      const minStart = newItems[0].startedAt;
      const maxEnd = newItems[newItems.length - 1].endedAt;
      const overlap = await this.prisma.detectionSegment.findFirst({
        where: { sessionId, startedAt: { lt: maxEnd }, endedAt: { gt: minStart } },
      });
      if (overlap) {
        throw new ConflictException('기존 세션 구간과 시간이 중복됩니다.');
      }

      const prepared: PreparedSegment[] = [];
      for (const item of newItems) {
        prepared.push(
          ...this.splitAtKstMidnight(
            { state: item.state, startedAt: item.startedAt, endedAt: item.endedAt, clientEventId: item.clientEventId ?? null },
            sessionId,
            userId,
          ),
        );
      }

      await this.prisma.detectionSegment.createMany({
        data: prepared.map(s => ({
          sessionId: s.sessionId,
          userId: s.userId,
          state: s.state,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationSec: s.durationSec,
          clientEventId: s.clientEventId,
        })),
        skipDuplicates: true,
      });

      const affectedDates = new Set(prepared.map(s => formatDate(toSeoulDate(s.startedAt))));
      await Promise.all([...affectedDates].map(d => this.recomputeDailyFromSegments(userId, d)));

      return { accepted: prepared.length };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 구간을 저장할 수 없습니다.');
    }
  }

  async uploadEvents(
    userId: string,
    sessionId: string,
    dto: UploadEventsDto,
  ): Promise<UploadEventsResponseDto> {
    try {
      const session = await this.findSessionForUser(userId, sessionId);
      if (session.endedAt) {
        throw new ConflictException('종료된 세션에는 이벤트를 추가할 수 없습니다.');
      }
      if (session.status === SessionStatus.PAUSED) {
        throw new ConflictException('일시정지된 세션에는 이벤트를 추가할 수 없습니다.');
      }
      if (dto.source && session.source !== dto.source) {
        throw new ConflictException('요청 source가 세션 source와 일치하지 않습니다.');
      }
      const data: Prisma.DetectionEventCreateManyInput[] = dto.events.map(e => ({
        sessionId,
        userId,
        type: e.type,
        severity: e.severity,
        durationSec: e.durationSec,
        detectedAt: new Date(e.detectedAt),
      }));
      const result = await this.prisma.detectionEvent.createMany({ data });
      return { accepted: result.count };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 이벤트를 저장할 수 없습니다.');
    }
  }

  async getCurrent(userId: string): Promise<CurrentSessionResponseDto | null> {
    try {
      const session = await this.prisma.detectionSession.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });
      if (!session) return null;
      return {
        sessionId: session.id,
        startedAt: session.startedAt,
        status: session.status === SessionStatus.PAUSED ? 'PAUSED' : 'ACTIVE',
        source: session.source,
        pausedAt: session.pausedAt,
        totalPausedSec: session.totalPausedSec,
      };
    } catch (e) {
      rethrowAsInternal(e, '서버 오류: 세션 정보를 조회할 수 없습니다.');
    }
  }

  private validateTimestamp(ts: Date, notBefore: Date, fieldName: string): void {
    if (ts.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new UnprocessableEntityException(`${fieldName}이 미래 시각입니다.`);
    }
    if (ts < notBefore) {
      throw new UnprocessableEntityException(`${fieldName}이 허용 범위 이전입니다.`);
    }
  }

  private splitAtKstMidnight(
    raw: { state: DetectionType; startedAt: Date; endedAt: Date; clientEventId: string | null },
    sessionId: string,
    userId: string,
  ): PreparedSegment[] {
    const results: PreparedSegment[] = [];
    let current = raw.startedAt;
    const end = raw.endedAt;
    let isFirst = true;

    while (current < end) {
      const kstCurrent = new Date(current.getTime() + SEOUL_OFFSET_MS);
      const nextKstMidnight = new Date(
        Date.UTC(kstCurrent.getUTCFullYear(), kstCurrent.getUTCMonth(), kstCurrent.getUTCDate() + 1),
      );
      const nextMidnightUtc = new Date(nextKstMidnight.getTime() - SEOUL_OFFSET_MS);
      const segEnd = nextMidnightUtc < end ? nextMidnightUtc : end;
      const durationSec = Math.floor((segEnd.getTime() - current.getTime()) / 1000);

      if (durationSec > 0) {
        results.push({
          sessionId, userId,
          state: raw.state,
          startedAt: current,
          endedAt: segEnd,
          durationSec,
          clientEventId: isFirst ? raw.clientEventId : null,
        });
      }

      current = segEnd;
      isFirst = false;
    }

    return results;
  }

  private async fillGapsWithUnclassified(
    userId: string,
    sessionId: string,
    sessionStart: Date,
    sessionEnd: Date,
    pauses: PauseRecord[],
  ): Promise<void> {
    const existing = await this.prisma.detectionSegment.findMany({
      where: { sessionId },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true },
    });

    const gapSegs: PreparedSegment[] = [];

    const processGap = (gapStart: Date, gapEnd: Date) => {
      const activeIntervals = this.getActiveIntervals(gapStart, gapEnd, pauses);
      const totalActiveSec = activeIntervals.reduce(
        (sum, iv) => sum + Math.floor((iv.end.getTime() - iv.start.getTime()) / 1000),
        0,
      );
      if (totalActiveSec > GAP_THRESHOLD_SEC) {
        for (const iv of activeIntervals) {
          gapSegs.push(
            ...this.splitAtKstMidnight(
              { state: DetectionType.UNCLASSIFIED, startedAt: iv.start, endedAt: iv.end, clientEventId: null },
              sessionId, userId,
            ),
          );
        }
      }
    };

    if (existing.length === 0) {
      processGap(sessionStart, sessionEnd);
    } else {
      for (let i = 1; i < existing.length; i++) {
        processGap(existing[i - 1].endedAt, existing[i].startedAt);
      }
      processGap(existing[existing.length - 1].endedAt, sessionEnd);
    }

    if (gapSegs.length > 0) {
      await this.prisma.detectionSegment.createMany({ data: gapSegs });
    }
  }

  private getActiveIntervals(
    gapStart: Date,
    gapEnd: Date,
    pauses: PauseRecord[],
  ): Array<{ start: Date; end: Date }> {
    const result: Array<{ start: Date; end: Date }> = [];
    let cursorMs = gapStart.getTime();
    const endMs = gapEnd.getTime();

    const overlapping = pauses
      .filter(p => {
        const pEndMs = (p.resumedAt ?? gapEnd).getTime();
        return p.pausedAt.getTime() < endMs && pEndMs > cursorMs;
      })
      .sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime());

    for (const pause of overlapping) {
      const pStartMs = Math.max(pause.pausedAt.getTime(), cursorMs);
      const pEndMs = Math.min((pause.resumedAt ?? gapEnd).getTime(), endMs);

      if (pStartMs > cursorMs) {
        result.push({ start: new Date(cursorMs), end: new Date(pStartMs) });
      }
      cursorMs = pEndMs;
      if (cursorMs >= endMs) break;
    }

    if (cursorMs < endMs) {
      result.push({ start: new Date(cursorMs), end: gapEnd });
    }

    return result;
  }

  private async recomputeDailyFromSegments(userId: string, dateStr: string): Promise<void> {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    const dayStartUtc = seoulDayStartUtc(date);
    const dayEndUtc = addDays(dayStartUtc, 1);

    const segments = await this.prisma.detectionSegment.findMany({
      where: { userId, startedAt: { gte: dayStartUtc, lt: dayEndUtc } },
    });

    const totals = {
      totalDetectionSec: 0,
      goodPostureSec: 0,
      turtleNeckSec: 0,
      roundShoulderSec: 0,
      shoulderAsymmetrySec: 0,
      darkEnvSec: 0,
      slouchingSec: 0,
      unclassifiedSec: 0,
    };
    const slots = Array.from({ length: 8 }, () => ({ ...totals }));
    const countByState: Record<string, number> = {};

    for (const seg of segments) {
      countByState[seg.state] = (countByState[seg.state] ?? 0) + 1;
      totals.totalDetectionSec += seg.durationSec;
      const slotIndex = Math.min(
        7,
        Math.floor(new Date(seg.startedAt.getTime() + SEOUL_OFFSET_MS).getUTCHours() / 3),
      );
      const slot = slots[slotIndex];
      slot.totalDetectionSec += seg.durationSec;

      switch (seg.state) {
        case DetectionType.GOOD_POSTURE:
          totals.goodPostureSec += seg.durationSec; slot.goodPostureSec += seg.durationSec; break;
        case DetectionType.TURTLE_NECK:
          totals.turtleNeckSec += seg.durationSec; slot.turtleNeckSec += seg.durationSec; break;
        case DetectionType.ROUND_SHOULDER:
          totals.roundShoulderSec += seg.durationSec; slot.roundShoulderSec += seg.durationSec; break;
        case DetectionType.SHOULDER_ASYMMETRY:
          totals.shoulderAsymmetrySec += seg.durationSec; slot.shoulderAsymmetrySec += seg.durationSec; break;
        case DetectionType.DARK_ENV:
          totals.darkEnvSec += seg.durationSec; slot.darkEnvSec += seg.durationSec; break;
        case DetectionType.SLOUCHING:
          totals.slouchingSec += seg.durationSec; slot.slouchingSec += seg.durationSec; break;
        case DetectionType.UNCLASSIFIED:
          totals.unclassifiedSec += seg.durationSec; slot.unclassifiedSec += seg.durationSec; break;
      }
    }

    const turtleNeckCount = countByState[DetectionType.TURTLE_NECK] ?? 0;
    const roundShoulderCount = countByState[DetectionType.ROUND_SHOULDER] ?? 0;
    const shoulderAsymmetryCount = countByState[DetectionType.SHOULDER_ASYMMETRY] ?? 0;
    const darkEnvCount = countByState[DetectionType.DARK_ENV] ?? 0;
    const slouchingCount = countByState[DetectionType.SLOUCHING] ?? 0;
    const warningCount = turtleNeckCount + roundShoulderCount + shoulderAsymmetryCount + darkEnvCount + slouchingCount;
    const healthScore = this.computeHealthScore(totals.goodPostureSec, totals.totalDetectionSec);
    const postureScore = this.computePostureScore({ ...totals });

    await this.prisma.$transaction([
      this.prisma.dailyStat.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId, date, ...totals,
          goodPostureCount: countByState[DetectionType.GOOD_POSTURE] ?? 0,
          turtleNeckCount, roundShoulderCount, shoulderAsymmetryCount, darkEnvCount, slouchingCount,
          warningCount, healthScore, postureScore,
        },
        update: {
          ...totals,
          goodPostureCount: countByState[DetectionType.GOOD_POSTURE] ?? 0,
          turtleNeckCount, roundShoulderCount, shoulderAsymmetryCount, darkEnvCount, slouchingCount,
          warningCount, healthScore, postureScore,
        },
      }),
      ...slots.map((slot, slotIndex) =>
        this.prisma.dailySlotStat.upsert({
          where: { userId_date_slotIndex: { userId, date, slotIndex } },
          create: { userId, date, slotIndex, ...slot },
          update: slot,
        }),
      ),
    ]);
  }

  private async findSessionForUser(userId: string, sessionId: string) {
    const session = await this.prisma.detectionSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('해당 세션에 접근할 수 없습니다.');
    return session;
  }

  private async aggregateBySession(sessionId: string): Promise<AggregateBuckets> {
    const grouped = await this.prisma.detectionEvent.groupBy({
      by: ['type'],
      where: { sessionId },
      _sum: { durationSec: true },
      _count: { _all: true },
    });

    const buckets: AggregateBuckets = {
      goodPostureSec: 0, goodPostureCount: 0,
      turtleNeckSec: 0, turtleNeckCount: 0,
      roundShoulderSec: 0, roundShoulderCount: 0,
      shoulderAsymmetrySec: 0, shoulderAsymmetryCount: 0,
      darkEnvSec: 0, darkEnvCount: 0,
      slouchSec: 0, slouchCount: 0,
    };

    for (const row of grouped) {
      const sec = row._sum.durationSec ?? 0;
      const count = row._count._all;
      switch (row.type) {
        case DetectionType.GOOD_POSTURE: buckets.goodPostureSec += sec; buckets.goodPostureCount += count; break;
        case DetectionType.TURTLE_NECK: buckets.turtleNeckSec += sec; buckets.turtleNeckCount += count; break;
        case DetectionType.ROUND_SHOULDER: buckets.roundShoulderSec += sec; buckets.roundShoulderCount += count; break;
        case DetectionType.SHOULDER_ASYMMETRY: buckets.shoulderAsymmetrySec += sec; buckets.shoulderAsymmetryCount += count; break;
        case DetectionType.DARK_ENV: buckets.darkEnvSec += sec; buckets.darkEnvCount += count; break;
        case DetectionType.SLOUCHING: buckets.slouchSec += sec; buckets.slouchCount += count; break;
      }
    }
    return buckets;
  }

  private aggregateSegmentSecs(segments: { state: DetectionType; durationSec: number }[]): {
    goodPostureSec: number; turtleNeckSec: number; roundShoulderSec: number;
    shoulderAsymmetrySec: number; darkEnvSec: number; slouchSec: number; unclassifiedSec: number;
  } {
    const b = { goodPostureSec: 0, turtleNeckSec: 0, roundShoulderSec: 0, shoulderAsymmetrySec: 0, darkEnvSec: 0, slouchSec: 0, unclassifiedSec: 0 };
    for (const seg of segments) {
      switch (seg.state) {
        case DetectionType.GOOD_POSTURE: b.goodPostureSec += seg.durationSec; break;
        case DetectionType.TURTLE_NECK: b.turtleNeckSec += seg.durationSec; break;
        case DetectionType.ROUND_SHOULDER: b.roundShoulderSec += seg.durationSec; break;
        case DetectionType.SHOULDER_ASYMMETRY: b.shoulderAsymmetrySec += seg.durationSec; break;
        case DetectionType.DARK_ENV: b.darkEnvSec += seg.durationSec; break;
        case DetectionType.SLOUCHING: b.slouchSec += seg.durationSec; break;
        case DetectionType.UNCLASSIFIED: b.unclassifiedSec += seg.durationSec; break;
      }
    }
    return b;
  }

  private computeHealthScore(goodPostureSec: number, totalDurationSec: number): number | null {
    if (totalDurationSec <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((goodPostureSec / totalDurationSec) * 100)));
  }

  private computePostureScore(stat: {
    turtleNeckSec: number; roundShoulderSec: number;
    shoulderAsymmetrySec: number; darkEnvSec: number; slouchingSec: number; totalDetectionSec: number;
  }): number | null {
    if (stat.totalDetectionSec <= 0) return null;
    const total = stat.totalDetectionSec;
    const score =
      100 -
      (stat.turtleNeckSec / total) * POSTURE_SCORE_WEIGHTS.turtleNeck -
      (stat.roundShoulderSec / total) * POSTURE_SCORE_WEIGHTS.roundShoulder -
      (stat.shoulderAsymmetrySec / total) * POSTURE_SCORE_WEIGHTS.shoulderAsymmetry -
      (stat.darkEnvSec / total) * POSTURE_SCORE_WEIGHTS.darkEnv -
      (stat.slouchingSec / total) * POSTURE_SCORE_WEIGHTS.slouch;
    return Math.max(0, Math.round(score));
  }

  private async recomputeDailyScores(userId: string, date: Date): Promise<void> {
    const stat = await this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date } } });
    if (!stat) return;
    const healthScore = this.computeHealthScore(stat.goodPostureSec, stat.totalDetectionSec);
    const postureScore = this.computePostureScore(stat);
    const warningCount =
      stat.turtleNeckCount + stat.roundShoulderCount + stat.shoulderAsymmetryCount + stat.darkEnvCount + stat.slouchingCount;
    await this.prisma.dailyStat.update({
      where: { userId_date: { userId, date } },
      data: { healthScore, postureScore, warningCount },
    });
  }
}
