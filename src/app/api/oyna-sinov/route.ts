import { addBenchResult, benchResultSchema, listBenchResults, shortDevice } from "@/lib/mirror-bench";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// Telefonda model sinovi natijalari (/oyna/sinov). GET: hamma natijalar, POST: bitta o'lchov
export async function GET() {
  return Response.json({ results: listBenchResults() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!rateLimit(`oyna-sinov:${clientKey(request)}`, 30).ok) {
    return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  // Telefon nomi brauzer qatoridan serverda aniqlanadi (mijoz yuborgani ishlatilmaydi)
  const parsed = benchResultSchema.safeParse({ ...body, device: shortDevice(request.headers.get("user-agent") ?? "") });
  if (!parsed.success) return Response.json({ error: "Noto'g'ri natija" }, { status: 400 });
  return Response.json({ result: addBenchResult(parsed.data) });
}
