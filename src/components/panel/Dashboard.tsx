"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelStats } from "@/lib/analytics";
import { PERIODS, type Period } from "@/lib/panel-periods";
import type { Reservation, SizeFitStats } from "@/lib/panel";
import { HangerIcon } from "@/components/brand/Logo";
import { queryChips } from "@/components/shopper/QueryChips";
import { colorHex } from "@/lib/catalog";
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

  // Yetkazuvchiga ro'yxat: qoniqtirilmagan talab CSV sifatida (Excel o'zbekcha harflarni to'g'ri ochishi uchun BOM)
  function downloadUnmet() {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ["Tovar", "Sabab", "So'rovlar", "O'lchamlar", "Misol"],
      ...stats.unmet.map((u) => [
        u.label,
        UNMET_TYPE[u.type].label,
        u.count,
        u.sizes.map((x) => `${x.size} x${x.count}`).join(", "),
        u.examples[0] ?? "",
      ]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "si-stilist-talab.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const t = stats.totals;
  const unmetCount = t.qisman + t.qoniqtirilmadi;
  const fb = stats.feedback;
  const sf = stats.sizeFit;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold text-brand sm:text-4xl">Do&apos;kon paneli</h1>
            {online ? (
              <span className="badge badge-danger">
                <span className="h-2 w-2 animate-pulse rounded-full bg-live" />
                Jonli
              </span>
            ) : (
              <span className="badge bg-surface-2 text-muted">Aloqa uzildi</span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-muted">Xaridorlar nimani so&apos;rayapti va nima yetishmayapti</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {phone && (
            <button onClick={() => setShowQr(true)} className="btn btn-ghost btn-sm">
              Telefondan sinash
            </button>
          )}
          <div className="flex rounded-full bg-surface p-1 shadow-[inset_0_0_0_1.5px_var(--color-line)]">
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  void refresh(p);
                }}
                className={`rounded-full px-4 py-2 text-sm font-bold ${p === period ? "bg-brand text-white" : "text-ink hover:bg-brand-soft"}`}
              >
                {PERIODS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showQr && phone && (
        <div className="scrim fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => setShowQr(false)}>
          <div className="modal w-full max-w-sm space-y-3 p-7 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-extrabold text-brand">Telefoningizdan so&apos;rov yozing</h2>
            <p className="text-sm font-medium text-muted">Kamerani QR kodga qarating. So&apos;rovingiz shu panelda darhol paydo bo&apos;ladi.</p>
            <div className="mx-auto w-64 rounded-2xl bg-white p-3 shadow-[inset_0_0_0_1.5px_var(--color-line)]" dangerouslySetInnerHTML={{ __html: phone.qr }} />
            <div className="break-all font-mono text-sm text-ink">{phone.url}</div>
            <p className="text-xs font-medium text-muted">Telefon kompyuter bilan bir Wi-Fi tarmog&apos;ida bo&apos;lishi kerak</p>
            <button onClick={() => setShowQr(false)} className="btn btn-brand w-full">
              Yopish
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Jami so'rovlar"
          value={String(t.all)}
          sub={[t.tushunilmadi && `${t.tushunilmadi} ta tushunilmadi`, t.rad && `+${t.rad} mavzudan tashqari`].filter(Boolean).join(", ") || undefined}
          bar={{ qoniqtirildi: t.qoniqtirildi, qisman: t.qisman, qoniqtirilmadi: t.qoniqtirilmadi }}
          flash={flashTiles}
        />
        {/* Foizlar faqat tushunilgan so'rovlardan: "???" kabi gap "mos tovar yo'q" deb hisoblanmaydi */}
        <StatTile label="Qoniqtirildi" value={pct(t.qoniqtirildi, t.understood)} sub={`${t.qoniqtirildi} ta so'rov · mos kiyim topildi`} status="qoniqtirildi" flash={flashTiles} />
        <StatTile label="Qisman" value={pct(t.qisman, t.understood)} sub={`${t.qisman} ta · faqat o'xshashi bor`} status="qisman" flash={flashTiles} />
        <StatTile label="Qoniqtirilmadi" value={pct(t.qoniqtirilmadi, t.understood)} sub={`${t.qoniqtirilmadi} ta · mos tovar yo'q`} status="qoniqtirilmadi" flash={flashTiles} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[28px] bg-brand p-5 text-white shadow-[var(--shadow-lift)] sm:p-7">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-accent-bright">Asosiy imkoniyat</div>
          <h2 className="mt-1 text-3xl font-extrabold">Qoniqtirilmagan talab</h2>
          <p className="mt-1 text-sm font-medium text-white/70">
            Xaridorlar so&apos;radi, lekin do&apos;konda topilmadi: {unmetCount} ta so&apos;rov. Keyingi buyurtma uchun tayyor ro&apos;yxat.
          </p>
          {stats.unmet.length > 0 && (
            <button onClick={downloadUnmet} className="btn btn-sm mt-4 bg-sand text-brand hover:bg-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Yetkazuvchiga ro&apos;yxat
            </button>
          )}
          {stats.unmet.length === 0 ? (
            <Empty dark />
          ) : (
            <ol className="mt-5 divide-y divide-white/10 border-t border-white/10">
              {stats.unmet.map((u, i) => {
                const type = UNMET_TYPE[u.type];
                const max = stats.unmet[0].count;
                return (
                  <li
                    key={u.key}
                    className={`-mx-2 grid grid-cols-[1.75rem_3.25rem_minmax(0,1fr)] items-center gap-3 rounded-2xl px-2 py-4 transition-colors duration-700 sm:grid-cols-[2rem_3.5rem_minmax(0,1fr)_10rem] ${flashUnmet.has(u.key) ? "bg-white/10" : ""}`}
                  >
                    <span className={`font-display text-2xl font-extrabold tabular-nums ${i === 0 ? "text-accent-bright" : "text-white/85"}`}>{i + 1}</span>
                    <span className="relative flex h-13 w-13 items-center justify-center rounded-2xl bg-white/10 sm:h-14 sm:w-14">
                      <HangerIcon className="h-7 w-7 text-white/85" />
                      {u.colors[0] && (
                        <span
                          className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full ring-2 ring-white/80"
                          style={{ background: colorHex(u.colors[0]) }}
                          title={u.colors.join(", ")}
                        />
                      )}
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <span className="font-display text-lg font-extrabold">{u.label}</span>
                        <span className="text-sm font-medium text-white/60">
                          <span aria-hidden>{type.icon} </span>
                          {type.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {u.sizes.map((s) => (
                          <span key={s.size} className="rounded-full bg-white/10 px-2.5 py-1 font-bold">
                            {s.size} ×{s.count}
                          </span>
                        ))}
                        <span className="font-medium text-white/50">oxirgi: {timeAgo(u.lastAt, now)}</span>
                      </div>
                      {u.examples[0] && <p className="truncate text-xs font-medium italic text-white/45">&laquo;{u.examples[0]}&raquo;</p>}
                      <div className="flex items-center gap-3 sm:hidden">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                          <div className="h-full rounded-full bg-accent-bright" style={{ width: `${(u.count / max) * 100}%` }} />
                        </div>
                        <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">{u.count} so&apos;rov</span>
                      </div>
                    </div>
                    <div className="hidden space-y-2 text-right sm:block">
                      <div className="font-display text-lg font-extrabold tabular-nums">{u.count} so&apos;rov</div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full bg-accent-bright" style={{ width: `${(u.count / max) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <StatTile
              compact
              label="Xaridor bahosi"
              value={fb.mos + fb.mosEmas === 0 ? "–" : pct(fb.mos, fb.mos + fb.mosEmas)}
              sub={fb.mos + fb.mosEmas === 0 ? "hali baho yo'q" : `mos: ${fb.mos} / ${fb.mos + fb.mosEmas}`}
              flash={flashTiles}
            />
            <StatTile
              compact
              label="Sotuvchiga"
              value={String(fb.reserved)}
              sub={`${pct(fb.reservedRequests, t.qoniqtirildi + t.qisman)} topilgandan`}
              flash={flashTiles}
            />
          </div>

          <Card
            title="So'nggi so'rovlar"
            action={
              online && (
                <span className="badge badge-danger">
                  <span className="h-2 w-2 rounded-full bg-live" />
                  Jonli
                </span>
              )
            }
          >
            {stats.recent.length === 0 ? (
              <Empty />
            ) : (
              <ul className="-mx-1 max-h-[560px] space-y-2 overflow-y-auto px-1 pb-1">
                {stats.recent.map((r) => {
                  const s = STATUS[r.status];
                  const chips = r.parsed ? queryChips(r.parsed).slice(0, 4) : [];
                  const isNew = fresh.has(r.id);
                  return (
                    <li
                      key={r.id}
                      className={`rounded-2xl p-3 transition-colors duration-700 ${isNew ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_#f5b5ad]" : "bg-surface-2"}`}
                    >
                      <div className="flex items-start gap-2">
                        {isNew && <span className="badge shrink-0 bg-accent text-white">Yangi</span>}
                        <p className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">&laquo;{r.rawText}&raquo;</p>
                        <span className="shrink-0 pt-0.5 text-xs font-semibold text-muted">{timeAgo(r.createdAt, now)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {r.mode === "rad" ? <Badge icon="–" label="Mavzudan tashqari" cls="bg-line/60 text-muted" /> : <Badge icon={s.icon} label={s.label} cls={s.badge} />}
                        <span className="font-semibold text-muted">{MODE_LABEL[r.mode] ?? r.mode}</span>
                        {chips.map((c) => (
                          <span key={c} className="rounded-full bg-surface px-2 py-0.5 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)]">
                            {c}
                          </span>
                        ))}
                        {r.feedback && <Badge label={r.feedback === "mos" ? "mos keldi" : "mos kelmadi"} cls={r.feedback === "mos" ? "badge-ok" : "badge-brand"} />}
                        {r.reserved > 0 && <Badge label="sotuvchiga ko'rsatildi" cls="badge-brand" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {stats.reservations.length > 0 && (
            <Card title="Sotuvchiga ko'rsatilgan" subtitle="Kod bo'yicha toping va olib keling">
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-3 border-b border-line pb-2 text-xs font-bold text-muted">
                <span>Kod</span>
                <span>Kiyim</span>
                <span>Tavsiya → Olindi</span>
              </div>
              <ul className="divide-y divide-line">
                {stats.reservations.map((r) => (
                  <li key={r.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
                    <span className="font-display text-xl font-extrabold text-brand">#{r.code}</span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-ink">{r.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
                        <span>
                          o&apos;lcham {r.size} · {timeAgo(r.at, now)}
                        </span>
                        {!r.inStock && <Badge label="Buyurtma" cls="badge-warn !px-2 !py-0.5" />}
                      </div>
                    </div>
                    {r.recommended ? (
                      <label
                        title="Xaridor kiyib ko'rgach haqiqatda to'g'ri kelgan o'lcham"
                        className={`badge cursor-pointer ${r.fitted ? (r.fitted === r.recommended ? "badge-ok" : "badge-warn") : "badge-brand"}`}
                      >
                        {r.recommended} →
                        <select
                          value={r.fitted ?? ""}
                          onChange={(e) => void markFitted(r.id, e.target.value || null)}
                          className="cursor-pointer bg-transparent font-bold outline-none"
                          aria-label="To'g'ri kelgan o'lcham"
                        >
                          <option value="">—</option>
                          {r.sizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="text-xs font-medium text-muted">—</span>
                    )}
                  </li>
                ))}
              </ul>
              {sf.recommended > 0 && (
                <p className="mt-3 text-xs font-medium text-muted">
                  {sf.n > 0 ? (
                    <>
                      Tavsiya to&apos;g&apos;ri chiqdi: {sf.exact} / {sf.n} ({pct(sf.exact, sf.n)}), ±1 o&apos;lcham ichida {sf.within1} / {sf.n}
                    </>
                  ) : (
                    <>Xaridor kiyib ko&apos;rgach, to&apos;g&apos;ri kelgan o&apos;lchamni belgilang: tavsiya aniqligi shu yerda hisoblanadi.</>
                  )}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Mashhur turlar">
          <CategoryBars items={stats.categories} />
        </Card>
        <Card title="Uslub va maqsad" subtitle="Qayerga va qanday kiyim izlashadi">
          <BarList items={stats.styles} />
        </Card>
        <Card title="Mashhur ranglar">
          <BarList items={stats.colors} swatches />
        </Card>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs font-medium text-muted">
        <span>Yangilanish: har {POLL_MS / 1000} soniyada. &laquo;namuna&raquo;: seed paytida yaratilgan namunaviy tarix.</span>
        <button onClick={resetLog} className="btn btn-ghost btn-sm">
          Logni tozalash
        </button>
      </footer>
    </div>
  );
}
