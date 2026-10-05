import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Jarayon bo'yicha yagona nusxa: dev'da hot-reload, production'da esa Next.js moduldan sahifa va API
// bo'laklari uchun alohida nusxalar yaratishi mumkin. Hammasi bitta ulanishlar havzasidan foydalanadi.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Ulanishlar havzasi hajmi. Prisma'ning lokal serveri (`npm run db:start`, port 51214) parallel
 * ulanishlarni ko'tarolmaydi ("Connection terminated unexpectedly"), shuning uchun u bilan bitta ulanish
 * ishlatiladi va so'rovlar navbatga turadi. Docker/onlayn PostgreSQL'da odatiy havza.
 * DATABASE_POOL_MAX bilan qo'lda belgilash mumkin.
 */
function poolMax(url: string | undefined): number {
  const fromEnv = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return url && /localhost:5121\d\//.test(url) ? 1 : 10;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString, max: poolMax(connectionString) });
  return new PrismaClient({ adapter });
}

export const prisma = (globalForPrisma.prisma ??= createClient());
