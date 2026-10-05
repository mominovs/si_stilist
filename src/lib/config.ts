// Tashqi xizmatlar sozlamalari. Faqat serverda o'qiladi: NEXT_PUBLIC_ prefiksi yo'q,
// shuning uchun kalitlar brauzerga chiqmaydi.
// Getter'lar orqali har safar process.env dan o'qiladi: dev rejimida .env o'zgarsa, server qayta
// ishga tushirilmasa ham yangi qiymat olinadi.
export const config = {
  llm: {
    get model() {
      return process.env.LLM_MODEL || "claude-haiku-4-5-20251001";
    },
    get apiKey() {
      return (process.env.ANTHROPIC_API_KEY || "").trim();
    },
    /** Birinchi urinish uchun kutish vaqti (ms). Sekin tarmoqda .env orqali oshirish mumkin */
    get timeoutMs() {
      const v = Number(process.env.LLM_TIMEOUT_MS);
      return Number.isFinite(v) && v >= 2000 ? v : 12_000;
    },
    /** Bir kunda SI'ga yuboriladigan so'rovlar chegarasi (byudjet himoyasi), keyin oddiy tahlil */
    get dailyLimit() {
      const v = Number(process.env.LLM_DAILY_LIMIT);
      return Number.isFinite(v) && v > 0 ? v : 500;
    },
  },
  tryOn: {
    get endpoint() {
      return process.env.TRYON_ENDPOINT || "fal-ai/kling/v1-5/kolors-virtual-try-on";
    },
    get apiKey() {
      return (process.env.FAL_KEY || "").trim();
    },
    /** Shundan uzoq kutilsa demo rejimga o'tiladi (ms) */
    get timeoutMs() {
      const v = Number(process.env.TRYON_TIMEOUT_MS);
      return Number.isFinite(v) && v >= 5000 ? v : 45_000;
    },
    /** Bir kunda API orqali kiyintirishlar chegarasi (har biri pullik), keyin demo rejim */
    get dailyLimit() {
      const v = Number(process.env.TRYON_DAILY_LIMIT);
      return Number.isFinite(v) && v > 0 ? v : 40;
    },
  },
  realtime: {
    get apiKey() {
      return process.env.DECART_API_KEY || "";
    },
    maxSessionSeconds: 60,
  },
};
