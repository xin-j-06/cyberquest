CREATE TABLE "TrainingTool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "platforms" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "usagePath" TEXT NOT NULL DEFAULT '',
    "officialUrl" TEXT NOT NULL DEFAULT '',
    "actionLabel" TEXT NOT NULL DEFAULT '查看官网',
    "installCommand" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingTool_name_key" ON "TrainingTool"("name");
CREATE INDEX "TrainingTool_published_sortOrder_idx" ON "TrainingTool"("published", "sortOrder");
CREATE INDEX "TrainingTool_category_published_idx" ON "TrainingTool"("category", "published");
CREATE INDEX "TrainingTool_authorId_idx" ON "TrainingTool"("authorId");

ALTER TABLE "TrainingTool" ADD CONSTRAINT "TrainingTool_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
