import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Dashboard } from "@/components/panel/Dashboard";
import { shopperUrl } from "@/lib/lan";
import { loadPanelStats, parsePeriod } from "@/lib/panel";
import { qrSvg } from "@/lib/qr";

export const metadata: Metadata = { title: "Do'kon paneli · SI Stilist" };

export default async function PanelPage({ searchParams }: PageProps<"/panel">) {
  await connection();
  const sp = await searchParams;
  const initial = await loadPanelStats(parsePeriod(typeof sp.period === "string" ? sp.period : null));
  const h = await headers();
  const url = shopperUrl(h.get("host"), h.get("x-forwarded-proto"));
  return <Dashboard initial={initial} phone={url ? { url, qr: await qrSvg(url) } : null} />;
}
