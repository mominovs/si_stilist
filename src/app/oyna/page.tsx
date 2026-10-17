import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { mirrorCards, sessionSeconds } from "@/lib/mirror-cards";
import { MirrorView } from "@/components/mirror/MirrorView";
import { StartEfirButton } from "@/components/efir/StartEfirButton";

export const metadata: Metadata = { title: "Jonli oyna · SI Stilist" };

export default async function MirrorPage({ searchParams }: PageProps<"/oyna">) {
  await connection();
  const sp = await searchParams;
  const wanted = Number(typeof sp.productId === "string" ? sp.productId : NaN);
  const cards = await mirrorCards();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jonli oyna</h1>
          <p className="text-sm text-neutral-500">Kameraga qarang: kiyim sizda real vaqtda ko&apos;rinadi</p>
        </div>
        <div className="flex items-center gap-4">
          <StartEfirButton />
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Xaridor ekrani</Link>
        </div>
      </header>
      {cards.length === 0 ? (
        <p className="text-neutral-500">Omborda ustki kiyim yo&apos;q.</p>
      ) : (
        <MirrorView
          cards={cards}
          initialId={cards.some((c) => c.id === wanted) ? wanted : cards[0].id}
          provider={config.tryOn.provider}
          sessionSeconds={sessionSeconds()}
        />
      )}
    </div>
  );
}
