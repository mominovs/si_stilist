import type { Metadata } from "next";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { mirrorCards, sessionSeconds } from "@/lib/mirror-cards";
import { MirrorView } from "@/components/mirror/MirrorView";
import { SiteHeader } from "@/components/brand/SiteHeader";

export const metadata: Metadata = { title: "Jonli oyna · SI Stilist" };

export default async function MirrorPage({ searchParams }: PageProps<"/oyna">) {
  await connection();
  const sp = await searchParams;
  const wanted = Number(typeof sp.productId === "string" ? sp.productId : NaN);
  const cards = await mirrorCards();

  return (
    <>
      <SiteHeader active="oyna" />
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {cards.length === 0 ? (
          <p className="text-muted">Omborda ustki kiyim yo&apos;q.</p>
        ) : (
          <MirrorView
            cards={cards}
            initialId={cards.some((c) => c.id === wanted) ? wanted : cards[0].id}
            provider={config.tryOn.provider}
            sessionSeconds={sessionSeconds()}
          />
        )}
      </div>
    </>
  );
}
