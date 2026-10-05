"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelStats } from "@/lib/analytics";
import { PERIODS, type Period } from "@/lib/panel-periods";
import { queryChips } from "@/components/shopper/QueryChips";
import { Badge, BarList, Card, CategoryBars, Empty, STATUS, StatTile, UNMET_TYPE, timeAgo } from "./parts";

type Stats = PanelStats & { period: Period };

const POLL_MS = 2000;

const MODE_LABEL: Record<string, string> = {
  llm: "SI",
  kalit: "oddiy",
  filtr: "filtr",
  tushunilmadi: "tushunilmadi",
  rad: "mavzudan tashqari",
  namuna: "namuna",
};

const pct = (part: number, all: number) => (all === 0 ? "0%" : `${Math.round((part / all) * 100)}%`);

export function Dashboard({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState(initial);
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

  async function resetLog() {
    if (!confirm("Barcha so'rovlar logi (namunaviy tarix ham) o'chirilsinmi?")) return;
    await fetch("/api/panel/reset", { method: "POST" });
    await refresh(period);
  }

  const t = stats.totals;
  const unmetCount = t.qisman + t.qoniqtirilmadi;

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
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">Xaridor ekrani</Link>
          <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">Admin</Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Jami so'rovlar" value={String(t.all)} sub={t.rad ? `+${t.rad} ta mavzudan tashqari` : undefined} flash={flashTiles} />
        <StatTile label="Qoniqtirildi" value={pct(t.qoniqtirildi, t.all)} sub={`${t.qoniqtirildi} ta so'rov`} status="qoniqtirildi" flash={flashTiles} />
        <StatTile label="Qisman" value={pct(t.qisman, t.all)} sub={`${t.qisman} ta: faqat o'xshashi bor edi`} status="qisman" flash={flashTiles} />
        <StatTile label="Qoniqtirilmadi" value={pct(t.qoniqtirilmadi, t.all)} sub={`${t.qoniqtirilmadi} ta: mos tovar yo'q`} status="qoniqtirilmadi" flash={flashTiles} />
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
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
