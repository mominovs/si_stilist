import { loadPanelStats, parsePeriod } from "@/lib/panel";

// Panel har 2 soniyada so'raydi (jonli yangilanish). Polling ataylab tanlangan: bitta serverda ham,
// serverless hostingda ham bir xil ishonchli ishlaydi.
export async function GET(request: Request) {
  const period = parsePeriod(new URL(request.url).searchParams.get("period"));
  return Response.json(await loadPanelStats(period), { headers: { "Cache-Control": "no-store" } });
}
