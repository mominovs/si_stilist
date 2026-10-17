import { joinRoom, postMessage, postSignal, roomState, validCode } from "@/lib/efir";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Holat: ishtirokchilar va since dan keyingi xabarlar (sahifa har soniyada so'raydi) */
export async function GET(request: Request, { params }: RouteContext<"/api/efir/[code]">) {
  const { code } = await params;
  const url = new URL(request.url);
  const pid = url.searchParams.get("pid") ?? "";
  const since = Number(url.searchParams.get("since")) || 0;
  const state = validCode(code) ? roomState(code, pid, since) : null;
  if (!state) return Response.json({ error: "Efirda emassiz" }, { status: 404 });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}

type Body =
  | { action: "join"; name?: string; pid?: string | null }
  | { action: "chat"; pid?: string; text?: string; productId?: number | null }
  | { action: "signal"; pid?: string; to?: string; data?: string };

/**
 * {action: "join", name, pid?} -> {pid}; {action: "chat", pid, text, productId?} -> {message};
 * {action: "signal", pid, to, data} -> {ok} (WebRTC: SDP va ICE nomzodlari sherikka)
 */
export async function POST(request: Request, { params }: RouteContext<"/api/efir/[code]">) {
  const { code } = await params;
  if (!validCode(code)) return Response.json({ error: "Efir topilmadi" }, { status: 404 });
  // Ulanish paytida ICE nomzodlari ketma-ket ketadi: chegarasi kengroq
  if (!rateLimit(`efir:${clientKey(request)}`, 600).ok) {
    return Response.json({ error: "Juda tez-tez" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Body | null;
  if (body?.action === "join") {
    const r = joinRoom(code, String(body.name ?? ""), typeof body.pid === "string" ? body.pid : null);
    if (!r.ok) {
      return r.error === "to'la"
        ? Response.json({ error: "Efirda allaqachon 2 kishi bor" }, { status: 409 })
        : Response.json({ error: "Efir topilmadi yoki tugagan" }, { status: 404 });
    }
    return Response.json({ pid: r.pid });
  }
  if (body?.action === "chat") {
    const productId = Number.isInteger(body.productId) && Number(body.productId) > 0 ? Number(body.productId) : null;
    const message = postMessage(code, String(body.pid ?? ""), String(body.text ?? ""), productId);
    if (!message) return Response.json({ error: "Xabar yuborilmadi" }, { status: 400 });
    return Response.json({ message });
  }
  if (body?.action === "signal") {
    const ok = postSignal(code, String(body.pid ?? ""), String(body.to ?? ""), String(body.data ?? ""));
    if (!ok) return Response.json({ error: "Signal yuborilmadi" }, { status: 400 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Noma'lum amal" }, { status: 400 });
}
