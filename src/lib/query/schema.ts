import { z } from "zod";

// LLM (yoki zaxira tahlilchi) chiqaradigan tartibli so'rov. Maydon nomlari CLAUDE.md dagi kelishuv bo'yicha.
export const parsedQuerySchema = z.object({
  kategoriya: z.string().nullable(),
  jins: z.enum(["erkak", "ayol"]).nullable(),
  ranglar: z.array(z.string()),
  rang_istisno: z.array(z.string()),
  uslub: z.array(z.string()),
  maqsad: z.string().nullable(),
  narx_darajasi: z.enum(["arzon", "orta", "qimmat"]).nullable(),
  /** Byudjet: shu narxdan (so'm) qimmat bo'lmasin ("300 ming so'mgacha" -> 300000) */
  narx_max: z.number().nullable(),
  olcham: z.string().nullable(),
  mavsum: z.string().nullable(),
  izoh: z.string(),
});

export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

// LLM javobi: so'rov maydonlari + mavzu belgisi. "boshqa" bo'lsa tovar qidirilmaydi.
export const llmOutputSchema = parsedQuerySchema.extend({
  mavzu: z.enum(["kiyim", "boshqa"]),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;

// rad: so'rov kiyimga oid emas (masalan, "Ronaldo necha yoshda")
export type ParseMode = "llm" | "kalit" | "filtr" | "tushunilmadi" | "rad";

export const EMPTY_QUERY: ParsedQuery = {
  kategoriya: null,
  jins: null,
  ranglar: [],
  rang_istisno: [],
  uslub: [],
  maqsad: null,
  narx_darajasi: null,
  narx_max: null,
  olcham: null,
  mavsum: null,
  izoh: "",
};

/**
 * Bazadagi eski so'rovlarda (narx_max qo'shilishidan oldin) yangi maydonlar yo'q: ular bo'sh qiymat bilan to'ldiriladi
 */
export function withDefaults(q: Partial<ParsedQuery>): ParsedQuery {
  return { ...EMPTY_QUERY, ...q };
}

/** So'rovda moslashtirish uchun hech bo'lmasa bitta mezon bormi */
export function hasCriteria(q: ParsedQuery): boolean {
  return Boolean(
    q.kategoriya ||
      q.jins ||
      q.ranglar.length ||
      q.rang_istisno.length ||
      q.uslub.length ||
      q.maqsad ||
      q.narx_darajasi ||
      q.narx_max ||
      q.olcham ||
      q.mavsum,
  );
}
