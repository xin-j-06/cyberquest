CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "pageUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
