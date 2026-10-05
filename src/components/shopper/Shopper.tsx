"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@/lib/search";
import { FilterPanel, type Filters } from "./FilterPanel";
import { QueryChips } from "./QueryChips";
import { ResultCard } from "./ResultCard";

type Turn = {
  id: number;
  text: string;
  response: SearchResponse | null;
  error: string | null;
};

const EXAMPLES = [
  "Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak",
  "To'yga qizil libos",
  "Erkaklar uchun qishki kurtka",
  "Нужны белые кроссовки 42 размера",
];

let nextId = 1;

export function Shopper({ categories, colors }: { categories: string[]; colors: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  // Blok tanasi ataylab: yangi brauzerlarda scrollIntoView Promise qaytaradi, useEffect esa uni qabul qilmaydi
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);
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

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    void search(trimmed, { text: trimmed });
  }

  function submitFilters(f: Filters) {
    const label = [f.kategoriya, f.jins, f.rang, f.narx_darajasi && `${f.narx_darajasi} narx`].filter(Boolean).join(", ");
    void search(`Filtr: ${label || "hammasi"}`, { filters: f });
  }

  const selected = turns.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[400px_1fr]">
      {/* Chat */}
      <section className="flex max-h-[55dvh] min-h-[300px] flex-col lg:max-h-[calc(100dvh-7rem)] lg:min-h-[420px] rounded-2xl border border-neutral-200 bg-white">
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
          {filtersOpen && <FilterPanel categories={categories} colors={colors} disabled={loading} onSearch={submitFilters} />}
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
                    key={card.id}
                    card={card}
                    requestedSize={selected.response?.parsed?.olcham ?? null}
                    onTryOn={() => setToast("Virtual kiyintirish keyingi bosqichda qo'shiladi")}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
                Hozircha mos tovar yo&apos;q. Boshqa rang yoki kategoriyani so&apos;rab ko&apos;ring.
              </div>
            )}
          </>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
