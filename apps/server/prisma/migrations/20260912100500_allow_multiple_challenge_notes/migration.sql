DROP INDEX IF EXISTS "ChallengeNote_userId_challengeId_key";
CREATE INDEX IF NOT EXISTS "ChallengeNote_userId_challengeId_idx" ON "ChallengeNote"("userId", "challengeId");
