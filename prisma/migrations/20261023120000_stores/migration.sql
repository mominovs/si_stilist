-- Platforma: do'konlar (qo'lda yozilgan: prisma dev shadow bazasi bilan migrate dev ishlamaydi).
-- Mavjud namuna tovarlar SKU bo'yicha do'konlarga taqsimlanadi (prisma/seed-data/stores.ts bilan bir xil)
CREATE TABLE "Store" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "telegram" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2B1638',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

ALTER TABLE "Product" ADD COLUMN "storeId" INTEGER;
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Request" ADD COLUMN "city" TEXT;

INSERT INTO "Store" ("slug", "name", "city", "color") VALUES
    ('lc-waikiki', 'LC Waikiki', 'Toshkent', '#2457A6'),
    ('defacto', 'DeFacto', 'Toshkent', '#1E1E1E'),
    ('koton', 'Koton', 'Samarqand', '#B4232A'),
    ('colins', 'Colin''s', 'Farg''ona', '#2E7D5B'),
    ('mavi', 'Mavi', 'Andijon', '#0E7490');

UPDATE "Product" SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'lc-waikiki') WHERE "sku" IN ('KY-03', 'FT-01', 'FT-06', 'SH-01', 'SH-06', 'KS-05', 'LB-02', 'KT-04', 'SV-05', 'YB-04');
UPDATE "Product" SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'defacto') WHERE "sku" IN ('KY-04', 'FT-02', 'SH-02', 'KS-01', 'KS-06', 'LB-03', 'KT-05', 'SV-01', 'SV-06', 'YB-05');
UPDATE "Product" SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'koton') WHERE "sku" IN ('KY-05', 'FT-03', 'SH-03', 'KS-02', 'LB-04', 'KT-01', 'KT-06', 'SV-02', 'YB-01', 'YB-06');
UPDATE "Product" SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'colins') WHERE "sku" IN ('KY-01', 'KY-06', 'FT-04', 'SH-04', 'KS-03', 'LB-05', 'KT-02', 'SV-03', 'YB-02');
UPDATE "Product" SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'mavi') WHERE "sku" IN ('KY-02', 'FT-05', 'SH-05', 'KS-04', 'LB-01', 'LB-06', 'KT-03', 'SV-04', 'YB-03');
