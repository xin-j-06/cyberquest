CREATE TABLE "ChallengeNote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChallengeNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengeNote_userId_challengeId_key" ON "ChallengeNote"("userId", "challengeId");
CREATE INDEX "ChallengeNote_userId_updatedAt_idx" ON "ChallengeNote"("userId", "updatedAt");
CREATE INDEX "ChallengeNote_challengeId_idx" ON "ChallengeNote"("challengeId");

ALTER TABLE "ChallengeNote" ADD CONSTRAINT "ChallengeNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeNote" ADD CONSTRAINT "ChallengeNote_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
