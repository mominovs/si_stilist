import { latestFrame, validCode } from "@/lib/efir";

/**
 * Sherikning oxirgi kiyintirilgan kadri (JPEG, X-Seq sarlavhasi bilan). after dan yangi kadr bo'lmasa 204.
 * Faqat shu xonadagi ishtirokchi (pid) oladi
 */
export async function GET(request: Request, { params }: RouteContext<"/api/efir/[code]/frame">) {
  const { code } = await params;
  const url = new URL(request.url);
  const pid = url.searchParams.get("pid") ?? "";
  const of = url.searchParams.get("of") ?? "";
  const after = Number(url.searchParams.get("after")) || 0;
  const frame = validCode(code) ? latestFrame(code, pid, of, after) : null;
  if (!frame) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return new Response(frame.image as unknown as BodyInit, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Seq": String(frame.seq) },
  });
}
