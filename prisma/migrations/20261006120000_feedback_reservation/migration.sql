-- AlterTable
ALTER TABLE "Request" ADD COLUMN "feedback" TEXT;

-- AlterTable
ALTER TABLE "RequestResult" ADD COLUMN "reservedAt" TIMESTAMP(3),
ADD COLUMN "reservedSize" TEXT;

-- CreateIndex
CREATE INDEX "RequestResult_reservedAt_idx" ON "RequestResult"("reservedAt");
