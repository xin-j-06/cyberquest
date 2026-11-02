CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'DISABLED', 'PENDING_DELETION');
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "User"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginIp" TEXT;

ALTER TABLE "Announcement"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Competition"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "format" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "TrainingTool"
  ADD COLUMN "version" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "checksumSha256" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "license" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deprecated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Feedback"
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'S3',
  ADD COLUMN "assignee" TEXT,
  ADD COLUMN "publicReply" TEXT,
  ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "slaDueAt" TIMESTAMP(3);

ALTER TABLE "Challenge"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "owner" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "maxConcurrentLabs" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "cpuLimit" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "memoryLimitMb" INTEGER NOT NULL DEFAULT 512,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_status_deletedAt_idx" ON "User"("status", "deletedAt");
CREATE INDEX "Announcement_deletedAt_idx" ON "Announcement"("deletedAt");
CREATE INDEX "Competition_deletedAt_idx" ON "Competition"("deletedAt");
CREATE INDEX "TrainingTool_deletedAt_idx" ON "TrainingTool"("deletedAt");
CREATE INDEX "Challenge_deletedAt_idx" ON "Challenge"("deletedAt");

UPDATE "Announcement" SET "reviewStatus" = CASE WHEN "published" THEN 'PUBLISHED'::"ReviewStatus" ELSE 'DRAFT'::"ReviewStatus" END;
UPDATE "Competition" SET "reviewStatus" = CASE WHEN "published" THEN 'PUBLISHED'::"ReviewStatus" ELSE 'DRAFT'::"ReviewStatus" END;
UPDATE "TrainingTool" SET "reviewStatus" = CASE WHEN "published" THEN 'PUBLISHED'::"ReviewStatus" ELSE 'DRAFT'::"ReviewStatus" END;
UPDATE "Challenge" SET "reviewStatus" = CASE WHEN "isActive" THEN 'PUBLISHED'::"ReviewStatus" ELSE 'DRAFT'::"ReviewStatus" END;
