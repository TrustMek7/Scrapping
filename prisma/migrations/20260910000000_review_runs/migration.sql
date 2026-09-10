CREATE TABLE "ReviewRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewRun_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Publication" ADD COLUMN "reviewRunId" INTEGER;
CREATE INDEX "Publication_reviewRunId_idx" ON "Publication"("reviewRunId");
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "ReviewRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
