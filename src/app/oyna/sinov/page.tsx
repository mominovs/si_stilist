import type { Metadata } from "next";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { MirrorBenchmark } from "@/components/mirror/MirrorBenchmark";

export const metadata: Metadata = { title: "Telefonda model sinovi · SI Stilist" };

// /oyna/sinov?nom=v1: tryon-local/models/web/mirror/<nom> dagi model (standart: sinov)
export default async function MirrorBenchmarkPage({ searchParams }: PageProps<"/oyna/sinov">) {
  const sp = await searchParams;
  const nom = typeof sp.nom === "string" && /^[a-z0-9_-]{1,32}$/.test(sp.nom) ? sp.nom : "sinov";
  return (
    <>
      <SiteHeader active="oyna" />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        <MirrorBenchmark model={nom} />
      </div>
    </>
  );
}
