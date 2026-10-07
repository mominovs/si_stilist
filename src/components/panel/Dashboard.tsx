"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelStats } from "@/lib/analytics";
import { PERIODS, type Period } from "@/lib/panel-periods";
import type { Reservation, SizeFitStats } from "@/lib/panel";
import { queryChips } from "@/components/shopper/QueryChips";
import { Badge, BarList, Card, CategoryBars, Empty, STATUS, StatTile, UNMET_TYPE, timeAgo } from "./parts";

type Stats = PanelStats & { period: Period; reservations: Reservation[]; sizeFit: SizeFitStats };

const POLL_MS = 2000;

const MODE_LABEL: Record<string, string> = {
  llm: "SI",
  kalit: "oddiy",
  filtr: "filtr",
  tushunilmadi: "tushunilmadi",
  rad: "mavzudan tashqari",
  namuna: "namuna",
  oyna: "jonli oyna",
};

const pct = (part: number, all: number) => (all === 0 ? "0%" : `${Math.round((part / all) * 100)}%`);

/** Telefondan sinash uchun xaridor sahifasi manzili va uning QR kodi (SVG) */
export type PhoneLink = { url: string; qr: string };

export function Dashboard({ initial, phone }: { initial: Stats; phone: PhoneLink | null }) {
  const [stats, setStats] = useState(initial);
  const [showQr, setShowQr] = useState(false);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [flashUnmet, setFlashUnmet] = useState<Set<string>>(new Set());
  const [flashTiles, setFlashTiles] = useState(false);
  const prev = useRef(initial);

  const applyStats = useCallback((next: Stats) => {
    const before = prev.current;
    if (before.period === next.period && next.lastId > before.lastId) {
      // Yangi so'rovlar va o'sgan talab qatorlari bir necha soniya ajratib ko'rsatiladi
      const seen = new Set(before.recent.map((r) => r.id));
      setFresh(new Set(next.recent.filter((r) => !seen.has(r.id)).map((r) => r.id)));
      const counts = new Map(before.unmet.map((u) => [u.key, u.count]));
      setFlashUnmet(new Set(next.unmet.filter((u) => u.count > (counts.get(u.key) ?? 0)).map((u) => u.key)));
      setFlashTiles(true);
      setTimeout(() => {
        setFresh(new Set());
        setFlashUnmet(new Set());
        setFlashTiles(false);
      }, 4000);
    }
    prev.current = next;
    setStats(next);
  }, []);

  const refresh = useCallback(
    async (p: Period, signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/panel?period=${p}`, { cache: "no-store", signal });
        if (!res.ok) throw new Error(String(res.status));
        applyStats(await res.json());
        setOnline(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setOnline(false);
      }
      setNow(Date.now());
    },
    [applyStats],
  );

  // Dastlabki ma'lumot serverdan keladi; davr almashganda tugma o'zi darhol yuklaydi, bu yerda faqat taymer
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh(period, ctrl.signal);
    }, POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [period, refresh]);

  // Sotuvchi: xaridor kiyib ko'rgach haqiqatda to'g'ri kelgan o'lcham (o'lcham tavsiyasi aniqligi shundan)
  async function markFitted(resultId: number, size: string | null) {
    await fetch("/api/panel/fit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, size }),
    });
    await refresh(period);
  }

  async function resetLog() {
    if (!confirm("Barcha so'rovlar logi (namunaviy tarix ham) o'chirilsinmi?")) return;
    await fetch("/api/panel/reset", { method: "POST" });
    await refresh(period);
  }

  const t = stats.totals;
  const unmetCount = t.qisman + t.qoniqtirilmadi;
  const fb = stats.feedback;
  const sf = stats.sizeFit;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Do&apos;kon paneli</h1>
          <p className="text-sm text-neutral-500">Xaridorlar nimani so&apos;rayapti va nima yetishmayapti</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${online ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-green-600" : "bg-red-600"}`} />
            {online ? "Jonli" : "Aloqa uzildi"}
          </span>
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5 text-sm">
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  void refresh(p);
                }}
                className={`rounded-md px-3 py-1.5 ${p === period ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {PERIODS[p]}
              </button>
            ))}
          </div>
          {phone && (
            <button
              onClick={() => setShowQr(true)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Telefondan sinash
            </button>
          )}
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">Xaridor ekrani</Link>
          <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">Admin</Link>
        </div>
      </header>

      {showQr && phone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowQr(false)}
        >
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold">Telefoningizdan so&apos;rov yozing</h2>
            <p className="text-sm text-neutral-500">Kamerani QR kodga qarating. So&apos;rovingiz shu panelda darhol paydo bo&apos;ladi.</p>
            <div className="mx-auto w-64" dangerouslySetInnerHTML={{ __html: phone.qr }} />
            <div className="font-mono text-sm break-all text-neutral-700">{phone.url}</div>
            <p className="text-xs text-neutral-400">Telefon kompyuter bilan bir Wi-Fi tarmog&apos;ida bo&apos;lishi kerak</p>
            <button onClick={() => setShowQr(false)} className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
              Yopish
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Jami so'rovlar"
          value={String(t.all)}
          sub={[t.tushunilmadi && `${t.tushunilmadi} ta tushunilmadi`, t.rad && `+${t.rad} mavzudan tashqari`].filter(Boolean).join(", ") || undefined}
          flash={flashTiles}
        />
        {/* Foizlar faqat tushunilgan so'rovlardan: "???" kabi gap "mos tovar yo'q" deb hisoblanmaydi */}
        <StatTile label="Qoniqtirildi" value={pct(t.qoniqtirildi, t.understood)} sub={`${t.qoniqtirildi} ta so'rov`} status="qoniqtirildi" flash={flashTiles} />
        <StatTile label="Qisman" value={pct(t.qisman, t.understood)} sub={`${t.qisman} ta: faqat o'xshashi bor edi`} status="qisman" flash={flashTiles} />
        <StatTile label="Qoniqtirilmadi" value={pct(t.qoniqtirilmadi, t.understood)} sub={`${t.qoniqtirilmadi} ta: mos tovar yo'q`} status="qoniqtirilmadi" flash={flashTiles} />
        <StatTile
          label="Xaridor bahosi"
          value={fb.mos + fb.mosEmas === 0 ? "–" : pct(fb.mos, fb.mos + fb.mosEmas)}
          sub={fb.mos + fb.mosEmas === 0 ? "hali baho yo'q" : `mos keldi: ${fb.mos} / ${fb.mos + fb.mosEmas} baho`}
          flash={flashTiles}
        />
        <StatTile
          label="Sotuvchiga ko'rsatildi"
          value={String(fb.reserved)}
          sub={`${pct(fb.reservedRequests, t.qoniqtirildi + t.qisman)} topilgan so'rovdan`}
          flash={flashTiles}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Qoniqtirilmagan talab"
          subtitle={`Xaridorlar so'radi, lekin omborda yo'q edi: ${unmetCount} ta so'rov. Buyurtma uchun eng muhim ro'yxat.`}
          className="lg:col-span-2"
        >
          {stats.unmet.length === 0 ? (
            <Empty />
          ) : (
            <ol className="divide-y divide-neutral-100">
              {stats.unmet.map((u, i) => {
                const type = UNMET_TYPE[u.type];
                const max = stats.unmet[0].count;
                return (
                  <li
                    key={u.key}
                    className={`grid grid-cols-[2rem_1fr_auto] items-start gap-3 py-3 transition-colors duration-700 ${flashUnmet.has(u.key) ? "bg-sky-50" : ""}`}
                  >
                    <span className="pt-0.5 text-sm tabular-nums text-neutral-400">{i + 1}</span>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{u.label}</span>
                        <Badge icon={type.icon} label={type.label} cls={type.badge} />
                      </div>
                      <div className="h-1.5 rounded-r" style={{ width: `${(u.count / max) * 100}%`, background: "#2a78d6" }} />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        {u.sizes.length > 0 && (
                          <span>
                            O&apos;lchamlar:{" "}
                            {u.sizes.map((s) => (
                              <span key={s.size} className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700">
                                {s.size} ×{s.count}
                              </span>
                            ))}
                          </span>
                        )}
                        <span>oxirgi: {timeAgo(u.lastAt, now)}</span>
                      </div>
                      {u.examples[0] && <p className="truncate text-xs italic text-neutral-400">&laquo;{u.examples[0]}&raquo;</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold tabular-nums">{u.count}</div>
                      <div className="text-xs text-neutral-500">so&apos;rov</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
        {stats.reservations.length > 0 && (
          <Card title="Sotuvchiga ko'rsatilgan" subtitle="Xaridor tanlagan tovar: kod bo'yicha toping va olib keling">
            {sf.recommended > 0 && (
              <div className="mb-3 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                {sf.n > 0 ? (
                  <>
                    <span className="font-medium text-neutral-900">O&apos;lcham tavsiyasi aniqligi (sinov):</span> aniq{" "}
                    {sf.exact}/{sf.n} ({pct(sf.exact, sf.n)}), ±1 o&apos;lcham ichida {sf.within1}/{sf.n} ({pct(sf.within1, sf.n)})
                  </>
                ) : (
                  <>Jonli oyna o&apos;lcham tavsiya qildi: xaridor kiyib ko&apos;rgach, pastda haqiqatda to&apos;g&apos;ri kelgan o&apos;lchamni belgilang. Aniqlik shu yerda hisoblanadi.</>
                )}
              </div>
            )}
            <ul className="space-y-2">
              {stats.reservations.map((r) => (
                <li key={r.id} className="space-y-2 rounded-xl border border-neutral-100 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-neutral-500">
                        {r.sku} · {timeAgo(r.at, now)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-semibold">#{r.code}</div>
                      <div className="text-xs text-neutral-600">o&apos;lcham {r.size}</div>
                    </div>
                  </div>
                  {(!r.inStock || r.recommended) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {!r.inStock && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200">Buyurtma: omborda yo&apos;q</span>}
                      {r.recommended && (
                        <>
                          <span className="text-neutral-500">SI tavsiyasi: {r.recommended}</span>
                          <label className="flex items-center gap-1 text-neutral-500">
                            to&apos;g&apos;ri kelgani:
                            <select
                              value={r.fitted ?? ""}
                              onChange={(e) => void markFitted(r.id, e.target.value || null)}
                              className={`rounded border px-1 py-0.5 ${r.fitted ? (r.fitted === r.recommended ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800") : "border-neutral-300"}`}
                            >
                              <option value="">—</option>
                              {r.sizes.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="So'nggi so'rovlar" subtitle="Yangi so'rov kelishi bilan shu yerda paydo bo'ladi">
          {stats.recent.length === 0 ? (
            <Empty />
          ) : (
            <ul className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
              {stats.recent.map((r) => {
                const s = STATUS[r.status];
                const chips = r.parsed ? queryChips(r.parsed).slice(0, 4) : [];
                return (
                  <li
                    key={r.id}
                    className={`rounded-xl border p-3 transition-colors duration-700 ${fresh.has(r.id) ? "border-sky-300 bg-sky-50" : "border-neutral-100"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug">{r.rawText}</p>
                      {r.mode === "rad" ? (
                        <Badge icon="–" label="Mavzudan tashqari" cls="bg-neutral-100 text-neutral-600 ring-neutral-200" />
                      ) : (
                        <Badge icon={s.icon} label={s.label} cls={s.badge} />
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                      <span>{timeAgo(r.createdAt, now)}</span>
                      <span>·</span>
                      <span>{MODE_LABEL[r.mode] ?? r.mode}</span>
                      {chips.map((c) => (
                        <span key={c} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">{c}</span>
                      ))}
                      {r.feedback && (
                        <span className={`rounded px-1.5 py-0.5 ${r.feedback === "mos" ? "bg-green-50 text-green-800" : "bg-violet-50 text-violet-800"}`}>
                          {r.feedback === "mos" ? "mos keldi" : "mos kelmadi"}
                        </span>
                      )}
                      {r.reserved > 0 && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">sotuvchiga ko&apos;rsatildi</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Eng ko'p so'ralgan kategoriyalar" subtitle="Ustun ichida: so'rovlar natijasi">
          <CategoryBars items={stats.categories} />
        </Card>
        <Card title="Uslub va maqsad" subtitle="Qayerga va qanday kiyim izlashadi">
          <BarList items={stats.styles} />
        </Card>
        <Card title="Mashhur ranglar" subtitle="So'rovlarda tilga olingan ranglar">
          <BarList items={stats.colors} swatches />
        </Card>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <span>
          Yangilanish: har {POLL_MS / 1000} soniyada. &laquo;namuna&raquo; belgisi: seed paytida yaratilgan namunaviy tarix.
        </span>
        <button onClick={resetLog} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          Logni tozalash
        </button>
      </footer>
    </div>
  );
}
