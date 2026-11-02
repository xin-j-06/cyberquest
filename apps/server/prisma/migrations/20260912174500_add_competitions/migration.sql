CREATE TABLE "Competition" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "tags" JSONB NOT NULL,
  "url" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "registrationDeadline" TIMESTAMP(3),
  "published" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Competition_published_startAt_idx" ON "Competition"("published", "startAt");
CREATE INDEX "Competition_category_published_idx" ON "Competition"("category", "published");
CREATE INDEX "Competition_authorId_idx" ON "Competition"("authorId");
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
