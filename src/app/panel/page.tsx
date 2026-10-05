import type { Metadata } from "next";
import { connection } from "next/server";
import { Dashboard } from "@/components/panel/Dashboard";
import { loadPanelStats, parsePeriod } from "@/lib/panel";

export const metadata: Metadata = { title: "Do'kon paneli · SI Stilist" };

export default async function PanelPage({ searchParams }: PageProps<"/panel">) {
  await connection();
  const sp = await searchParams;
  const initial = await loadPanelStats(parsePeriod(typeof sp.period === "string" ? sp.period : null));
  return <Dashboard initial={initial} />;
}
