-- CreateEnum
CREATE TYPE "ReportPushWay" AS ENUM ('NOTION', 'EMAIL');

-- CreateEnum
CREATE TYPE "DetectionType" AS ENUM ('TURTLE_NECK', 'ROUND_SHOULDER', 'SHOULDER_ASYMMETRY', 'DARK_ENV', 'GOOD_POSTURE');

-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('POSTURE_TIME', 'STREAK', 'SPECIAL');

-- CreateEnum
CREATE TYPE "DeliveryWay" AS ENUM ('EMAIL', 'NOTION');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "brightness_threshold" INTEGER NOT NULL DEFAULT 50,
    "dark_detection_enabled" BOOLEAN NOT NULL DEFAULT true,
    "report_push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "report_push_way" "ReportPushWay" NOT NULL DEFAULT 'EMAIL',
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "avatar_skin" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detection_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "total_duration_sec" INTEGER NOT NULL DEFAULT 0,
    "good_posture_sec" INTEGER NOT NULL DEFAULT 0,
    "turtle_neck_sec" INTEGER NOT NULL DEFAULT 0,
    "shoulder_issue_sec" INTEGER NOT NULL DEFAULT 0,
    "dark_env_sec" INTEGER NOT NULL DEFAULT 0,
    "good_posture_count" INTEGER NOT NULL DEFAULT 0,
    "turtle_neck_count" INTEGER NOT NULL DEFAULT 0,
    "shoulder_issue_count" INTEGER NOT NULL DEFAULT 0,
    "dark_env_count" INTEGER NOT NULL DEFAULT 0,
    "health_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detection_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "DetectionType" NOT NULL,
    "severity" INTEGER NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detection_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_detection_sec" INTEGER NOT NULL DEFAULT 0,
    "good_posture_sec" INTEGER NOT NULL DEFAULT 0,
    "turtle_neck_sec" INTEGER NOT NULL DEFAULT 0,
    "shoulder_issue_sec" INTEGER NOT NULL DEFAULT 0,
    "dark_env_sec" INTEGER NOT NULL DEFAULT 0,
    "good_posture_count" INTEGER NOT NULL DEFAULT 0,
    "turtle_neck_count" INTEGER NOT NULL DEFAULT 0,
    "shoulder_issue_count" INTEGER NOT NULL DEFAULT 0,
    "dark_env_count" INTEGER NOT NULL DEFAULT 0,
    "health_score" INTEGER,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "BadgeCategory" NOT NULL,
    "icon_url" TEXT,
    "requirement_value" INTEGER NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "delivery_way" "DeliveryWay" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "top_issue_type" "DetectionType",
    "ai_solution" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "detection_sessions_user_id_started_at_idx" ON "detection_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "detection_events_session_id_detected_at_idx" ON "detection_events"("session_id", "detected_at");

-- CreateIndex
CREATE INDEX "detection_events_user_id_detected_at_idx" ON "detection_events"("user_id", "detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_user_id_date_key" ON "daily_stats"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "badges_code_key" ON "badges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_id_key" ON "user_badges"("user_id", "badge_id");

-- CreateIndex
CREATE INDEX "weekly_reports_user_id_week_start_date_idx" ON "weekly_reports"("user_id", "week_start_date");

-- CreateIndex
CREATE INDEX "weekly_reports_status_created_at_idx" ON "weekly_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_user_id_week_start_date_delivery_way_key" ON "weekly_reports"("user_id", "week_start_date", "delivery_way");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detection_sessions" ADD CONSTRAINT "detection_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detection_events" ADD CONSTRAINT "detection_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "detection_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detection_events" ADD CONSTRAINT "detection_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
