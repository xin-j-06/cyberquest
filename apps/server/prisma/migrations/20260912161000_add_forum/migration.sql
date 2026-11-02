CREATE TABLE "ForumPost" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ForumReply" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ForumPost_pinned_updatedAt_idx" ON "ForumPost"("pinned", "updatedAt");
CREATE INDEX "ForumPost_category_updatedAt_idx" ON "ForumPost"("category", "updatedAt");
CREATE INDEX "ForumPost_authorId_idx" ON "ForumPost"("authorId");
CREATE INDEX "ForumReply_postId_createdAt_idx" ON "ForumReply"("postId", "createdAt");
CREATE INDEX "ForumReply_authorId_idx" ON "ForumReply"("authorId");
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ForumReply" ADD CONSTRAINT "ForumReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumReply" ADD CONSTRAINT "ForumReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
