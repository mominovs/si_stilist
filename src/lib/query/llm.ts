import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/lib/config";
import { parsedQuerySchema, type ParsedQuery } from "./schema";

export type Vocabulary = {
  categories: string[];
  colors: string[];
  styleTags: string[];
  seasons: string[];
};

// LLM faqat so'rovni tushunadi: tovar tanlamaydi, omborni ko'rmaydi.
function systemPrompt(v: Vocabulary): string {
  return `Siz kiyim do'konidagi xaridor so'rovini tartibli JSON'ga aylantiruvchi tahlilchisiz.
So'rov o'zbekcha (lotin yoki kirill) yoki ruscha bo'lishi mumkin. Siz tovar tanlamaysiz, faqat so'rovni tushunasiz.

Do'kon lug'ati:
- kategoriyalar: ${v.categories.join(", ")}
- ranglar: ${v.colors.join(", ")}
- uslub va maqsad teglari: ${v.styleTags.join(", ")}
- mavsumlar: ${v.seasons.join(", ")}

Qoidalar:
- kategoriya: lug'atdagi qiymatga moslang (рубашка/блузка -> ko'ylak, платье/сарафан -> libos, брюки/джинсы -> shim,
  пуховик/тренч -> kurtka, худи/кардиган -> sviter). Agar so'ralgan narsa lug'atda bo'lmasa, uni baribir
  o'zbekcha, lotinda, kichik harfda, birlik shaklda yozing (masalan: krossovka, palto, sumka). Hech qachon tashlab ketmang.
  Kategoriya aytilmagan bo'lsa null.
- ranglar: xaridor xohlagan ranglar, lug'atdagi nomlar bilan (тёмно-синий/navy -> to'q ko'k, havorang/голубой -> ko'k).
- rang_istisno: xohlamagan ranglar ("qora rangsiz", "qora bo'lmasin", "не чёрный", "qoradan boshqa").
- maqsad: qayerga kiyiladi, iloji bo'lsa teglardan biri (ish, kundalik, bayram, sport). To'y, kechki ziyofat -> bayram; ofis -> ish.
- uslub: uslub teglari (masalan klassik, zamonaviy). Maqsadni bu yerga takrorlamang.
- narx_darajasi: arzon (arzon, qimmat emas, недорогой), orta (o'rtacha), qimmat (qimmat, premium). Aytilmasa null.
- jins: erkak yoki ayol, faqat aniq bo'lsa (erim uchun -> erkak, qizim uchun -> ayol). Aks holda null.
- olcham: aytilgan o'lcham katta harfda (M, XL, 48, 42). Aks holda null.
- mavsum: yoz, qish yoki bahor-kuz (bahor va kuz -> bahor-kuz). Aytilmasa null.
- izoh: xaridor nimani xohlayotganini bitta qisqa o'zbekcha gapda yozing.
- Faqat matnda aytilgan narsalarni yozing, taxmin qilmang.

Misollar:
"Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak" ->
{"kategoriya":"kostyum","jins":null,"ranglar":[],"rang_istisno":["qora"],"uslub":[],"maqsad":"ish","narx_darajasi":"orta","olcham":null,"mavsum":null,"izoh":"Ish uchun, qora bo'lmagan, o'rtacha narxdagi kostyum"}
"Нужны белые кроссовки 42 размера" ->
{"kategoriya":"krossovka","jins":null,"ranglar":["oq"],"rang_istisno":[],"uslub":[],"maqsad":null,"narx_darajasi":null,"olcham":"42","mavsum":null,"izoh":"42 o'lchamli oq krossovka"}`;
}

let client: { key: string; instance: Anthropic } | null = null;

// Kutish vaqtlari: birinchi urinish uzunroq (yangi ulanish va sxema kompilyatsiyasi sekin bo'lishi mumkin,
// ayniqsa uzoq tarmoqdan), qayta urinish qisqaroq. Eng yomon holatda ~20 s, keyin zaxira rejim.
const FIRST_ATTEMPT_MS = 12_000;
const RETRY_ATTEMPT_MS = 8_000;

function getClient(): Anthropic {
  // SDK o'zi qayta urinmaydi, qayta urinishni pastdagi kod boshqaradi.
  // Kalit almashsa (.env yangilansa) klient qayta yaratiladi.
  const key = config.llm.apiKey;
  if (client?.key !== key) {
    client = { key, instance: new Anthropic({ apiKey: key, timeout: FIRST_ATTEMPT_MS, maxRetries: 0 }) };
  }
  return client.instance;
}

export function llmConfigured(): boolean {
  return config.llm.apiKey.length > 0;
}

async function parseOnce(text: string, vocab: Vocabulary, timeout: number): Promise<ParsedQuery> {
  const response = await getClient().messages.parse(
    {
      model: config.llm.model,
      max_tokens: 1024,
      system: systemPrompt(vocab),
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(parsedQuerySchema) },
    },
    { timeout },
  );
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`LLM javobi yaroqsiz (stop_reason: ${response.stop_reason})`);
  }
  // Qo'shimcha himoya: sxema bo'yicha yana bir bor tekshiriladi
  return parsedQuerySchema.parse(response.parsed_output);
}

/** Xatoni xaridor ekranida ko'rsatiladigan qisqa o'zbekcha sababga aylantiradi */
export function describeLlmError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API kalit noto'g'ri";
  if (e instanceof Anthropic.PermissionDeniedError) return "API kalitga ruxsat yo'q";
  if (e instanceof Anthropic.RateLimitError) return "so'rovlar limiti tugadi";
  if (e instanceof Anthropic.NotFoundError) return "model topilmadi";
  if (e instanceof Anthropic.BadRequestError) {
    return /credit balance/i.test(e.message) ? "hisobda mablag' yetarli emas" : "so'rov rad etildi";
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "SI javob berish vaqti tugadi";
  if (e instanceof Anthropic.APIConnectionError) return "internet yoki ulanish yo'q";
  if (e instanceof Anthropic.APIError) return `SI xizmati xatosi (${e.status ?? "?"})`;
  return "SI javobi yaroqsiz";
}

/** Bir marta qayta urinadi. Ikkala urinish ham muvaffaqiyatsiz bo'lsa xato tashlaydi. */
export async function parseWithLlm(text: string, vocab: Vocabulary): Promise<ParsedQuery> {
  try {
    return await parseOnce(text, vocab, FIRST_ATTEMPT_MS);
  } catch (first) {
    console.warn("[llm] 1-urinish muvaffaqiyatsiz:", first instanceof Error ? first.message : first);
    return await parseOnce(text, vocab, RETRY_ATTEMPT_MS);
  }
}

let lastWarmUp = 0;
const WARM_UP_EVERY_MS = 10 * 60_000;

/**
 * Xaridor sahifasi ochilganda fonda bitta kichik so'rov yuboradi: ulanish ochiladi va JSON sxema
 * kompilyatsiya qilinadi, shunda xaridorning birinchi so'rovi tez qaytadi. 10 daqiqada ko'pi bilan bir marta.
 */
export async function warmUpLlm(vocab: () => Promise<Vocabulary>): Promise<void> {
  if (!llmConfigured() || Date.now() - lastWarmUp < WARM_UP_EVERY_MS) return;
  lastWarmUp = Date.now();
  const t0 = Date.now();
  try {
    await parseOnce("salom", await vocab(), 20_000);
    console.log(`[llm] isitish tayyor (${Date.now() - t0} ms)`);
  } catch (e) {
    lastWarmUp = 0; // keyingi sahifa ochilishida yana urinadi
    console.warn("[llm] isitish muvaffaqiyatsiz:", describeLlmError(e));
  }
}
