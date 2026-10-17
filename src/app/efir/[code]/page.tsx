import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { validCode } from "@/lib/efir";
import { shopperUrl } from "@/lib/lan";
import { mirrorCards } from "@/lib/mirror-cards";
import { qrSvg } from "@/lib/qr";
import { EfirRoom } from "@/components/efir/EfirRoom";

export const metadata: Metadata = { title: "Jonli efir · SI Stilist" };

export default async function EfirPage({ params }: PageProps<"/efir/[code]">) {
  await connection();
  const { code } = await params;
  if (!validCode(code)) notFound();
  const h = await headers();
  // Do'st telefonda ochadigan manzil: localhost'dan ochilgan bo'lsa ham tarmoq (https) manzili
  const base = shopperUrl(h.get("host"), h.get("x-forwarded-proto"));
  const link = base ? new URL(`efir/${code}`, base).toString() : null;
  const cards = await mirrorCards();
  return <EfirRoom code={code} cards={cards} share={link ? { url: link, qr: await qrSvg(link) } : null} />;
}
