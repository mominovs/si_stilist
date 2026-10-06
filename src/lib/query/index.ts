import { mergeWithContext } from "./context";
import { detectFollowUp, parseByKeywords } from "./keywords";
import { describeLlmError, llmConfigured, parseWithLlm, type Vocabulary } from "./llm";
import { demoSettings } from "@/lib/demo-settings";
import { normalizeQuery } from "./normalize";
import { hasCriteria, type ParseMode, type ParsedQuery } from "./schema";

export type Understanding = {
  parsed: ParsedQuery | null;
  mode: ParseMode;
  /** Kalit sozlangan, lekin SI ishlamagan bo'lsa: sababi (interfeysda ko'rsatiladi) */
  llmError?: string;
};

/**
 * Xaridor matnini tushunish zanjiri:
 *   1) LLM (bir marta qayta urinish bilan)
 *   2) LLM ishlamasa: kalit so'zlar bo'yicha oddiy tahlil
 *   3) u ham hech narsa topmasa: parsed = null, interfeys filtr tugmalarini ochadi
 * Kiyimga oid bo'lmagan so'rovlar (mode "rad") va mezonsiz so'rovlar hech qachon qidiruvga yuborilmaydi.
 */
export async function understandQuery(
  text: string,
  vocab: Vocabulary,
  /** Suhbatdagi oldingi so'rov (davom gaplari uchun: "shuning arzonrog'i", "boshqa rangdagisi") */
  context: ParsedQuery | null = null,
): Promise<Understanding> {
  let llmError: string | undefined;
  if (llmConfigured() && !demoSettings.llmOff) {
    try {
      const { mavzu, ...raw } = await parseWithLlm(text, vocab, context);
      // Davom gapini LLM baribir "boshqa" desa, kontekst bilan oddiy tahlilga o'tiladi
      if (mavzu === "boshqa" && !(context && detectFollowUp(text).followUp)) return { parsed: null, mode: "rad" };
      let parsed = normalizeQuery(raw, vocab.categories);
      // LLM kontekstni hisobga olmagan bo'lsa (kategoriya yo'q): oldingi shartlar qo'shiladi
      if (mavzu === "boshqa" || !parsed.kategoriya) parsed = mergeWithContext(context, parsed, text);
      // Kiyimga oid, lekin hech qanday mezon yo'q ("menga kiyim kerak"): tasodifiy tovar ko'rsatilmaydi
      if (!hasCriteria(parsed)) return { parsed: null, mode: "tushunilmadi" };
      return { parsed, mode: "llm" };
    } catch (e) {
      llmError = describeLlmError(e);
      console.warn(`[llm] zaxira rejimga o'tildi (${llmError}):`, e instanceof Error ? e.message : e);
    }
  }

  const parsed = mergeWithContext(context, normalizeQuery(parseByKeywords(text), vocab.categories), text);
  if (hasCriteria(parsed)) return { parsed, mode: "kalit", llmError };
  return { parsed: null, mode: "tushunilmadi", llmError };
}

export type { ParsedQuery, ParseMode } from "./schema";
export type { Vocabulary } from "./llm";
