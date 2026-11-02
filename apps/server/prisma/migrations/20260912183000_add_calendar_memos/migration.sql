CREATE TABLE "CalendarMemo" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarMemo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarMemo_userId_date_idx" ON "CalendarMemo"("userId", "date");
ALTER TABLE "CalendarMemo" ADD CONSTRAINT "CalendarMemo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
