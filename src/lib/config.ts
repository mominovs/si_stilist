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
  },
  tryOn: {
    get endpoint() {
      return process.env.TRYON_ENDPOINT || "fal-ai/kling/v1-5/kolors-virtual-try-on";
    },
    get apiKey() {
      return process.env.FAL_KEY || "";
    },
  },
  realtime: {
    get apiKey() {
      return process.env.DECART_API_KEY || "";
    },
    maxSessionSeconds: 60,
  },
};
