-- Jonli oyna o'lcham tavsiyasi (qo'lda yozilgan: prisma dev shadow bazasi bilan migrate dev ishlamaydi)
ALTER TABLE "RequestResult" ADD COLUMN "recommendedSize" TEXT;
ALTER TABLE "RequestResult" ADD COLUMN "fittedSize" TEXT;
