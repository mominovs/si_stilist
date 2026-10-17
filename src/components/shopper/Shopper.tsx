"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@/lib/search";
import { FilterPanel, type Filters } from "./FilterPanel";
import { QueryChips } from "./QueryChips";
import { ResultCard } from "./ResultCard";
import { SellerModal } from "./SellerModal";
import { TryOnModal } from "./TryOnModal";
import type { ReserveResponse } from "@/app/api/reserve/route";
import type { ResultCard as Card } from "@/lib/search";
import { HangerIcon, SparkIcon } from "@/components/brand/Logo";

type Turn = {
  id: number;
  text: string;
  response: SearchResponse | null;
  error: string | null;
  /** Xaridor bahosi: topilganlar mos keldimi */
  feedback?: "mos" | "mos-emas";
};

const EXAMPLES = [
  "Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak",
  "To'yga qizil libos",
  "Erkaklar uchun qishki kurtka",
  "Нужны белые кроссовки 42 размера",
];

let nextId = 1;

// Kiosk rejimi: shuncha vaqt hech kim ekranga tegmasa, suhbat va kiyintirish oynasi tozalanadi
// (keyingi xaridor oldingisining so'rovlari va suratini ko'rmasligi uchun)
const IDLE_RESET_MS = 120_000;

export function Shopper({
  categories,
  colors,
  sizes,
  tryOnProvider,
}: {
  categories: string[];
  colors: string[];
  sizes: string[];
  tryOnProvider: "local" | "gemini" | "fal";
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tryOnCard, setTryOnCard] = useState<Card | null>(null);
  const [seller, setSeller] = useState<ReserveResponse | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(0);

  // Blok tanasi ataylab: yangi brauzerlarda scrollIntoView Promise qaytaradi, useEffect esa uni qabul qilmaydi
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);
  useEffect(() => {
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch));
  }, []);
  useEffect(() => {
    if (turns.length === 0 && !tryOnCard && !seller) return;
    const timer = setInterval(() => {
      if (!loading && Date.now() - lastActivity.current > IDLE_RESET_MS) resetSession();
    }, 5000);
    return () => clearInterval(timer);
  });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function search(label: string, body: object) {
    if (loading) return;
    const id = nextId++;
    setTurns((ts) => [...ts, { id, text: label, response: null, error: null }]);
    setSelectedId(id);
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        const { error } = await res.json().catch(() => ({ error: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring." }));
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, error } : t)));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SearchResponse = await res.json();
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, response: data } : t)));
      if (data.mode === "tushunilmadi") setFiltersOpen(true);
    } catch {
      setTurns((ts) =>
        ts.map((t) => (t.id === id ? { ...t, error: "Server bilan aloqa yo'q. Filtr orqali urinib ko'ring." } : t)),
      );
      setFiltersOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function resetSession() {
    setTryOnCard(null);
    setSeller(null);
    setTurns([]);
    setSelectedId(null);
    setInput("");
    setFiltersOpen(false);
  }

  async function sendFeedback(turn: Turn, value: "mos" | "mos-emas") {
    if (!turn.response) return;
    setTurns((ts) => ts.map((t) => (t.id === turn.id ? { ...t, feedback: value } : t)));
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: turn.response.requestId, value }),
    }).catch(() => {});
  }

  async function reserve(turn: Turn, card: Card, size: string) {
    if (!turn.response) return;
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: turn.response.requestId, productId: card.id, size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSeller(data as ReserveResponse);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Xatolik yuz berdi");
    }
  }

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    // Davom gaplari ("shuning arzonrog'i") uchun ko'rib turilgan javobdagi so'rov shartlari yuboriladi
    const shown = turns.find((t) => t.id === selectedId)?.response;
    const context = shown?.parsed && shown.mode !== "rad" ? shown.parsed : undefined;
    void search(trimmed, { text: trimmed, context });
  }

  function submitFilters(f: Filters) {
    const label = [
      f.kategoriya,
      f.jins,
      f.rang,
      f.narx_darajasi && `${f.narx_darajasi} narx`,
      f.narx_max && `${f.narx_max.toLocaleString("ru-RU")} so'mgacha`,
      f.olcham,
    ]
      .filter(Boolean)
      .join(", ");
    void search(`Filtr: ${label || "hammasi"}`, { filters: f });
  }

  const selected = turns.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[380px_1fr]">
      {/* Suhbat */}
      <section className="card flex max-h-[60dvh] min-h-[320px] flex-col overflow-hidden lg:max-h-[calc(100dvh-8rem)] lg:min-h-[480px]">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-brand">Nima qidiryapsiz?</h1>
            <p className="mt-0.5 text-sm text-muted">Oddiy so&apos;z bilan yozing — stilist tanlab beradi.</p>
          </div>
          {turns.length > 0 && (
            <button onClick={resetSession} disabled={loading} className="btn btn-ghost btn-sm shrink-0">
              Yangi suhbat
            </button>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-3">
          {turns.length === 0 && (
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => submitText(e)}
                  className="rounded-2xl bg-surface-2 px-4 py-3 text-left text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:shadow-[inset_0_0_0_1.5px_var(--color-brand)]"
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {turns.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="ml-8 flex justify-end">
                <div className="bubble-user">{t.text}</div>
              </div>
              {t.response && (
                <div className="flex items-end gap-2">
                  <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-accent-bright">
                    <SparkIcon className="h-4 w-4" />
                  </span>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`bubble-ai block w-full space-y-2 text-left transition ${t.id === selectedId ? "ring-2 ring-brand/15" : "opacity-80 hover:opacity-100"}`}
                  >
                    <div>{t.response.message}</div>
                    <QueryChips parsed={t.response.parsed} mode={t.response.mode} />
                    {t.response.llmError && (
                      <div className="text-xs font-semibold text-warning">SI ishlamadi: {t.response.llmError}. Oddiy tahlil ishlatildi.</div>
                    )}
                  </button>
                </div>
              )}
              {t.error && <div className="ml-10 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">{t.error}</div>}
            </div>
          ))}
          {loading && (
            <div className="ml-10 w-48 space-y-2">
              <div className="skel h-4" />
              <div className="skel h-4 w-2/3" />
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        <div className="space-y-3 border-t border-line bg-surface-2 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Masalan: bayramga ko'k ko'ylak"
              aria-label="So'rovingiz"
              maxLength={500}
              className="field flex-1"
            />
            <button disabled={loading || !input.trim()} className="btn btn-primary">
              Yuborish
            </button>
          </form>
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex w-full items-center justify-between text-sm font-bold text-brand"
            aria-expanded={filtersOpen}
          >
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
              </svg>
              Filtr bilan tanlash
            </span>
            <span className={`transition ${filtersOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {filtersOpen && <FilterPanel categories={categories} colors={colors} sizes={sizes} disabled={loading} onSearch={submitFilters} />}
        </div>
      </section>

      {/* Natijalar */}
      <section className="space-y-4">
        {!selected?.response ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line p-8 text-center">
            <HangerIcon className="h-10 w-10 text-muted" />
            <p className="font-display text-lg font-bold text-brand">
              {loading ? "Ombordan mos tovarlarni qidiryapman..." : "Natijalar shu yerda chiqadi"}
            </p>
            <p className="max-w-sm text-sm text-muted">Faqat omborda bor tovarlar taklif qilinadi.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-extrabold text-brand">{selected.response.message}</h2>
              {selected.response.parsed?.izoh && selected.response.mode !== "filtr" && (
                <p className="text-sm font-semibold text-muted">{selected.response.parsed.izoh}</p>
              )}
            </div>
            {selected.response.results.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-3">
                {selected.response.results.map((card) => (
                  <ResultCard
                    key={`${selected.id}-${card.id}`}
                    card={card}
                    requestedSize={selected.response?.parsed?.olcham ?? null}
                    onTryOn={() => setTryOnCard(card)}
                    onReserve={(size) => void reserve(selected, card, size)}
                  />
                ))}
              </div>
            ) : null}
            {selected.response.results.length > 0 ? (
              <div className="card flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                {selected.feedback ? (
                  <span className="font-semibold text-muted">
                    {selected.feedback === "mos"
                      ? "Rahmat! Yoqqanini sotuvchiga ko'rsatishingiz mumkin."
                      : "Rahmat, do'konga yetkazdik. Nima yoqmaganini yozing, boshqasini topamiz."}
                  </span>
                ) : (
                  <>
                    <span className="font-bold text-ink">Topilganlar sizga mos keldimi?</span>
                    <span className="ml-auto flex gap-2">
                      <button onClick={() => void sendFeedback(selected, "mos")} className="btn btn-ghost btn-sm" aria-label="Ha, mos keldi">
                        👍 Ha
                      </button>
                      <button onClick={() => void sendFeedback(selected, "mos-emas")} className="btn btn-ghost btn-sm" aria-label="Yo'q, mos kelmadi">
                        👎 Yo&apos;q
                      </button>
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <p className="font-display text-lg font-bold text-brand">Hozircha mos tovar yo&apos;q</p>
                <p className="mt-1 text-sm text-muted">Boshqa rang yoki kategoriyani so&apos;rab ko&apos;ring. So&apos;rovingiz do&apos;konga yetkazildi.</p>
              </div>
            )}
          </>
        )}
      </section>

      {tryOnCard && <TryOnModal card={tryOnCard} provider={tryOnProvider} onClose={() => setTryOnCard(null)} />}
      {seller && <SellerModal data={seller} onClose={() => setSeller(null)} />}

      {toast && <div className="toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2">{toast}</div>}
    </div>
  );
}
