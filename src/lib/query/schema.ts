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
  olcham: z.string().nullable(),
  mavsum: z.string().nullable(),
  izoh: z.string(),
});

export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

export type ParseMode = "llm" | "kalit" | "filtr" | "tushunilmadi";

export const EMPTY_QUERY: ParsedQuery = {
  kategoriya: null,
  jins: null,
  ranglar: [],
  rang_istisno: [],
  uslub: [],
  maqsad: null,
  narx_darajasi: null,
  olcham: null,
  mavsum: null,
  izoh: "",
};

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
      q.olcham ||
      q.mavsum,
  );
}
