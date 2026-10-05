import { z } from "zod";
import { understandQuery } from "@/lib/query";
import { EMPTY_QUERY, type ParsedQuery } from "@/lib/query/schema";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { loadVocabulary, runSearch } from "@/lib/search";

const bodySchema = z.union([
  // Boshqaruv belgilari olib tashlanadi, uzunlik cheklanadi
  z.object({ text: z.string().transform((t) => t.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).pipe(z.string().min(1).max(500)) }),
  z.object({
    filters: z.object({
      kategoriya: z.string().max(40).nullable().optional(),
      jins: z.enum(["erkak", "ayol"]).nullable().optional(),
      rang: z.string().max(20).nullable().optional(),
      narx_darajasi: z.enum(["arzon", "orta", "qimmat"]).nullable().optional(),
    }),
  }),
]);

// Bitta qurilmadan daqiqasiga ko'pi bilan shuncha qidiruv (SI byudjeti va bazani himoyalash)
const PER_MINUTE = 20;

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request), PER_MINUTE);
  if (!limited.ok) {
    return Response.json(
      { error: `Juda ko'p so'rov. ${limited.retryAfterSec} soniyadan keyin urinib ko'ring.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });
  }

  if ("text" in body.data) {
    const text = body.data.text;
    const { parsed, mode, llmError } = await understandQuery(text, await loadVocabulary());
    return Response.json(await runSearch(text, parsed, mode, llmError));
  }

  // Filtr tugmalari: LLM'siz, to'g'ridan-to'g'ri tartibli so'rov
  const f = body.data.filters;
  const parsed: ParsedQuery = {
    ...EMPTY_QUERY,
    kategoriya: f.kategoriya ?? null,
    jins: f.jins ?? null,
    ranglar: f.rang ? [f.rang] : [],
    narx_darajasi: f.narx_darajasi ?? null,
  };
  const label = [parsed.kategoriya, parsed.jins, f.rang, parsed.narx_darajasi].filter(Boolean).join(", ");
  parsed.izoh = `Filtr: ${label || "hammasi"}`;
  return Response.json(await runSearch(parsed.izoh, parsed, "filtr"));
}
