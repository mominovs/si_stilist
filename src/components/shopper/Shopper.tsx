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
    <div className="grid flex-1 gap-6 lg:grid-cols-[400px_1fr]">
      {/* Chat */}
      <section className="flex max-h-[55dvh] min-h-[300px] flex-col lg:max-h-[calc(100dvh-7rem)] lg:min-h-[420px] rounded-2xl border border-neutral-200 bg-white">
        {turns.length > 0 && (
          <div className="flex justify-end border-b border-neutral-100 px-3 py-2">
            <button
              onClick={resetSession}
              disabled={loading}
              className="rounded-lg px-3 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
            >
              Yangi suhbat
            </button>
          </div>
        )}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-neutral-600">
                Assalomu alaykum! Qanday kiyim qidiryapsiz? Erkin yozing: rang, narx, qayerga kiyishingiz.
              </p>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    onClick={() => submitText(e)}
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="ml-8 rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-sm text-white">{t.text}</div>
              {t.response && (
                <button
                  onClick={() => setSelectedId(t.id)}
                  className={`mr-8 block w-[calc(100%-2rem)] space-y-2 rounded-2xl rounded-bl-sm px-4 py-2.5 text-left text-sm transition ${
                    t.id === selectedId ? "bg-neutral-100 ring-1 ring-neutral-300" : "bg-neutral-50 hover:bg-neutral-100"
                  }`}
                >
                  <div>{t.response.message}</div>
                  <QueryChips parsed={t.response.parsed} mode={t.response.mode} />
                  {t.response.llmError && (
                    <div className="text-xs text-amber-700">SI ishlamadi: {t.response.llmError}. Oddiy tahlil ishlatildi.</div>
                  )}
                </button>
              )}
              {t.error && <div className="mr-8 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{t.error}</div>}
            </div>
          ))}
          {loading && <div className="mr-8 w-fit rounded-2xl bg-neutral-50 px-4 py-2.5 text-sm text-neutral-500">Qidiryapman...</div>}
          <div ref={chatEnd} />
        </div>

        <div className="space-y-3 border-t border-neutral-100 p-3">
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
              maxLength={500}
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base focus:border-neutral-600 focus:outline-none"
            />
            <button
              disabled={loading || !input.trim()}
              className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Yuborish
            </button>
          </form>
          <button onClick={() => setFiltersOpen((o) => !o)} className="text-sm text-neutral-600 hover:underline">
            {filtersOpen ? "Filtrni yopish" : "Filtr bilan tanlash"}
          </button>
          {filtersOpen && <FilterPanel categories={categories} colors={colors} sizes={sizes} disabled={loading} onSearch={submitFilters} />}
        </div>
      </section>

      {/* Natijalar */}
      <section className="space-y-4">
        {!selected?.response ? (
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
            {loading ? "Ombordan mos tovarlarni qidiryapman..." : "Natijalar shu yerda chiqadi. Faqat omborda bor tovarlar taklif qilinadi."}
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-xl font-semibold">{selected.response.message}</h2>
              {selected.response.parsed?.izoh && selected.response.mode !== "filtr" && (
                <p className="mt-1 text-sm text-neutral-500">Tushunganim: {selected.response.parsed.izoh}</p>
              )}
            </div>
            {selected.response.results.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-3">
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
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm">
                {selected.feedback ? (
                  <span className="text-neutral-600">
                    {selected.feedback === "mos"
                      ? "Rahmat! Yoqqanini sotuvchiga ko'rsatishingiz mumkin."
                      : "Rahmat, do'konga yetkazdik. Nima yoqmaganini yozing, boshqasini topamiz."}
                  </span>
                ) : (
                  <>
                    <span className="text-neutral-700">Topilganlar sizga mos keldimi?</span>
                    <button
                      onClick={() => void sendFeedback(selected, "mos")}
                      className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-green-800 hover:bg-green-100"
                    >
                      Ha, mos keldi
                    </button>
                    <button
                      onClick={() => void sendFeedback(selected, "mos-emas")}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
                    >
                      Yo&apos;q, mos kelmadi
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
                Hozircha mos tovar yo&apos;q. Boshqa rang yoki kategoriyani so&apos;rab ko&apos;ring.
              </div>
            )}
          </>
        )}
      </section>

      {tryOnCard && <TryOnModal card={tryOnCard} provider={tryOnProvider} onClose={() => setTryOnCard(null)} />}
      {seller && <SellerModal data={seller} onClose={() => setSeller(null)} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
