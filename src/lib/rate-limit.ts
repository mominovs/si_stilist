// Oddiy xotiradagi cheklovchi: bitta manzildan daqiqasiga N ta so'rov.
// Demo va bitta server uchun yetarli; bir nechta server bo'lsa umumiy xotira (Redis) kerak bo'ladi.

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  // Xotira o'smasligi uchun vaqti-vaqti bilan eski yozuvlar tozalanadi
  if (hits.size > 5000) {
    for (const [k, ts] of hits) if (ts.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientKey(request: Request): string {
  // Cloudflare Tunnel orqali (run-server.bat: BEHIND_CLOUDFLARE=1, sayt faqat 127.0.0.1 da tinglaydi) xaridorning
  // haqiqiy manzili cf-connecting-ip da. Boshqa holatda bu sarlavhaga ishonilmaydi: uni istalgan mijoz soxtalashtira oladi
  if (process.env.BEHIND_CLOUDFLARE === "1") {
    const cf = request.headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
