import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { demoSettings } from "@/lib/demo-settings";
import { runChecks, type CheckStatus } from "@/lib/health";
import { shopperUrl } from "@/lib/lan";
import { qrSvg } from "@/lib/qr";
import { toggleDemoSetting } from "./actions";

export const metadata: Metadata = { title: "Demo holati · SI Stilist" };

const STATUS: Record<CheckStatus, { label: string; dot: string; card: string }> = {
  ok: { label: "Tayyor", dot: "bg-green-500", card: "border-neutral-200" },
  warn: { label: "Diqqat", dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/40" },
  fail: { label: "Ishlamayapti", dot: "bg-red-500", card: "border-red-200 bg-red-50/40" },
};

const SWITCHES = [
  {
    key: "llmOff" as const,
    title: "SI'ni o'chirish",
    text: "So'rovlar kalit so'zlar bo'yicha tushuniladi. Internet yomon bo'lsa yoki zaxirani ko'rsatish uchun.",
  },
  {
    key: "tryOnDemo" as const,
    title: "Kiyintirishni demo rejimga o'tkazish",
    text: "Model chaqirilmaydi: tayyor natija yoki taxminiy ko'rinish \"Demo rejim\" belgisi bilan chiqadi.",
  },
];

export default async function DemoStatusPage() {
  await connection();
  const [checks, url] = await Promise.all([runChecks(), headers().then((h) => shopperUrl(h.get("host")))]);
  const qr = url ? await qrSvg(url) : null;
  const worst: CheckStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Demo holati</h1>
          <p className="text-sm text-neutral-500">Taqdimotdan oldin shu sahifani oching: hammasi yashil bo&apos;lsin.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS[worst].dot}`} />
            {worst === "ok" ? "Hammasi tayyor" : worst === "warn" ? "Ishlaydi, lekin diqqat qiling" : "Muammo bor"}
          </span>
          <a href="/admin/holat" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Qayta tekshirish
          </a>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        {checks.map((c) => (
          <div key={c.id} className={`rounded-xl border p-4 ${STATUS[c.status].card}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{c.title}</h2>
              <span className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span className={`h-2 w-2 rounded-full ${STATUS[c.status].dot}`} />
                {STATUS[c.status].label}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-neutral-700">{c.detail}</p>
            {c.hint && c.status !== "ok" && (
              <p className="mt-2 rounded-md bg-white/70 px-2 py-1 font-mono text-xs text-neutral-600">{c.hint}</p>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Zaxira rejimlar</h2>
          <p className="text-sm text-neutral-500">
            Server qayta ishga tushganda avtomatik o&apos;chadi. Xaridor ekranida zaxira rejim doim belgilanadi.
          </p>
          {SWITCHES.map((s) => {
            const on = demoSettings[s.key];
            return (
              <form key={s.key} action={toggleDemoSetting} className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4">
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-sm text-neutral-500">{s.text}</div>
                </div>
                <input type="hidden" name="key" value={s.key} />
                <input type="hidden" name="value" value={on ? "off" : "on"} />
                <button
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                    on ? "bg-amber-500 text-white hover:bg-amber-600" : "border border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {on ? "Yoqilgan · o'chirish" : "Yoqish"}
                </button>
              </form>
            );
          })}
        </div>

        <div className="space-y-2 rounded-xl border border-neutral-200 p-4 text-center">
          <h2 className="font-semibold">Telefondan sinash</h2>
          {qr && url ? (
            <>
              <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: qr }} />
              <div className="font-mono text-xs break-all text-neutral-600">{url}</div>
              <p className="text-xs text-neutral-500">Telefon kompyuter bilan bir Wi-Fi tarmog&apos;ida bo&apos;lsin.</p>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Tarmoq manzili topilmadi (Wi-Fi ulanmagan).</p>
          )}
        </div>
      </section>
    </div>
  );
}
