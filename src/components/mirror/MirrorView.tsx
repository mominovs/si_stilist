"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResultCard } from "@/lib/search";
import { TryOnModal } from "@/components/shopper/TryOnModal";

// Seans cheklovi (CLAUDE.md: real vaqt seansi ko'pi bilan 60 soniya, keyin avtomatik to'xtaydi)
const SESSION_SECONDS = 60;
// Serverga yuboriladigan kadr: uzun tomoni shuncha piksel. Model kesimni 192x256 da ko'radi, lekin yuz, fon va
// kiyim teksturasi shu o'lchamda chiqadi: kattaroq kadr ekranda tiniqroq
const FRAME_SIDE = 640;
// Bir vaqtda yo'lda bo'lgan kadrlar: biri serverda ishlanayotganda keyingisi yuklanadi (tarmoq kutilmaydi)
const IN_FLIGHT = 2;
const FULL_SIDE = 1536;

type Phase = "consent" | "live" | "ended" | "unavailable";

/** Video kadrini uzun tomoni `side` piksel bo'lgan canvas'ga chizadi */
function frameCanvas(source: HTMLVideoElement, side: number): HTMLCanvasElement {
  const scale = Math.min(1, side / Math.max(source.videoWidth, source.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.videoWidth * scale);
  canvas.height = Math.round(source.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function MirrorView({
  cards,
  initialId,
  provider,
}: {
  cards: ResultCard[];
  initialId: number;
  provider: "local" | "gemini" | "fal";
}) {
  const [phase, setPhase] = useState<Phase>("consent");
  const [selectedId, setSelectedId] = useState(initialId);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  // Kechikish: kadr olingandan ekranga chiqquncha (ms) va shundan serverdagi ish vaqti
  const [latency, setLatency] = useState<{ total: number; server: number | null } | null>(null);
  const [left, setLeft] = useState(SESSION_SECONDS);
  const [hasFrame, setHasFrame] = useState(false);
  const [quality, setQuality] = useState<{ src: string; aspect: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const selectedRef = useRef(initialId);
  const deadline = useRef(0);

  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];

  const stopCamera = useCallback(() => {
    running.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Kadr tsikli: IN_FLIGHT ta parallel ishchi. Har biri kadr oladi, yuboradi va javobni chizadi. Kechroq kelgan
  // eski kadr yangisining ustiga chizilmaydi (tartib raqami bo'yicha). Navbat to'planmaydi, kechikish oshmaydi
  const loop = useCallback(async () => {
    let seq = 0;
    let drawn = 0;
    let frames = 0;
    let since = performance.now();
    const worker = async () => {
      while (running.current) {
        const v = videoRef.current;
        if (Date.now() > deadline.current) {
          stopCamera();
          setPhase("ended");
          return;
        }
        if (!v || !v.videoWidth) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        const my = ++seq;
        const t0 = performance.now();
        const blob = await new Promise<Blob | null>((r) => frameCanvas(v, FRAME_SIDE).toBlob(r, "image/jpeg", 0.85));
        if (!blob || !running.current) continue;
        try {
          const res = await fetch(`/api/mirror?productId=${selectedRef.current}`, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          });
          if (res.ok) {
            const bmp = await createImageBitmap(await res.blob());
            const out = outRef.current;
            if (out && running.current && my > drawn) {
              drawn = my;
              if (out.width !== bmp.width || out.height !== bmp.height) {
                out.width = bmp.width;
                out.height = bmp.height;
              }
              out.getContext("2d")!.drawImage(bmp, 0, 0);
              setHasFrame(true);
              setHint(null);
              const server = Number(res.headers.get("x-mirror-ms"));
              setLatency({ total: Math.round(performance.now() - t0), server: Number.isFinite(server) && server > 0 ? server : null });
              frames++;
            }
            bmp.close();
          } else {
            const data = await res.json().catch(() => ({}));
            if (res.status === 422) {
              // Kadrda odam yo'q yoki juda yaqin: jonli kamera ko'rsatiladi va sabab yoziladi
              setHasFrame(false);
              setHint(data.error ?? "Kameraga belgacha ko'rining");
            } else if (res.status === 503 || res.status === 500) {
              stopCamera();
              setError(data.error ?? "Jonli oyna ishlamayapti");
              setPhase("unavailable");
              return;
            } else {
              setHint(data.error ?? `Xato (${res.status})`);
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        } catch {
          setHint("Server bilan aloqa yo'q");
          await new Promise((r) => setTimeout(r, 1000));
        }
        const now = performance.now();
        if (now - since > 1000) {
          setFps(Math.round((frames * 1000) / (now - since)));
          frames = 0;
          since = now;
        }
      }
    };
    await Promise.all(Array.from({ length: IN_FLIGHT }, worker));
  }, [stopCamera]);

  async function start() {
    setError(null);
    setHint(null);
    setHasFrame(false);
    // Jonli kamera faqat xavfsiz manzilda (https:// yoki localhost) ishlaydi
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Jonli oyna kamerani talab qiladi: uni shu kompyuterning o'zida (localhost) yoki HTTPS orqali oching.");
      setPhase("unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      deadline.current = Date.now() + SESSION_SECONDS * 1000;
      setLeft(SESSION_SECONDS);
      setPhase("live");
      running.current = true;
      void loop();
    } catch {
      setError("Kameraga ruxsat berilmadi yoki kamera topilmadi.");
      setPhase("unavailable");
    }
  }

  // Qolgan vaqt
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [phase]);

  function choose(id: number) {
    setSelectedId(id);
    selectedRef.current = id;
  }

  // "Sifatli surat": joriy kadr to'liq o'lchamda olinadi va asosiy SI (CatVTON) bilan qayta chiziladi
  function takeQuality() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = frameCanvas(v, FULL_SIDE);
    setQuality({ src: canvas.toDataURL("image/jpeg", 0.9), aspect: canvas.width / canvas.height });
    stopCamera(); // GPU asosiy modelga bo'shatiladi
    setPhase("ended");
  }

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-[calc(70dvh*0.75)] overflow-hidden rounded-2xl bg-neutral-900" style={{ aspectRatio: "3 / 4" }}>
          {/* Jonli kamera (oyna kabi teskari) va uning ustida kiyintirilgan kadr */}
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          <canvas
            ref={outRef}
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-200 ${hasFrame ? "opacity-100" : "opacity-0"}`}
          />

          {phase === "consent" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900/90 p-6 text-center text-white">
              <h2 className="text-xl font-semibold">Jonli oyna</h2>
              <ul className="max-w-sm space-y-1.5 text-left text-sm text-neutral-200">
                <li>• Kamera tasviri faqat shu kompyuterdagi SI serveriga yuboriladi va saqlanmaydi.</li>
                <li>• Seans {SESSION_SECONDS} soniya, keyin kamera o&apos;zi o&apos;chadi.</li>
                <li>• Belgacha ko&apos;rining, qo&apos;llaringiz yonda bo&apos;lsin. Jonli ko&apos;rinish taxminiy.</li>
              </ul>
              <button onClick={start} className="rounded-xl bg-white px-6 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-200">
                Roziman, oynani yoqish
              </button>
            </div>
          )}

          {phase === "live" && (
            <>
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {left} s · {fps} kadr/s
                {latency && (
                  <span className="text-white/70">
                    · {latency.total} ms{latency.server !== null ? ` (server ${latency.server})` : ""}
                  </span>
                )}
              </div>
              {hint && (
                <div className="absolute inset-x-4 bottom-4 rounded-xl bg-amber-50/95 px-4 py-3 text-center text-sm text-amber-900">{hint}</div>
              )}
            </>
          )}

          {(phase === "ended" || phase === "unavailable") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900/90 p-6 text-center text-white">
              {phase === "ended" ? (
                <p className="text-lg">Seans tugadi</p>
              ) : (
                <p className="max-w-sm text-sm text-amber-200">{error}</p>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={start} className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-200">
                  {phase === "ended" ? `Yana ${SESSION_SECONDS} soniya` : "Qayta urinish"}
                </button>
                <Link href="/" className="rounded-xl border border-white/40 px-5 py-3 text-sm hover:bg-white/10">
                  Xaridor ekrani
                </Link>
              </div>
              {phase === "unavailable" && (
                <p className="max-w-sm text-xs text-neutral-400">
                  Suratga tushib kiyintirish (&quot;O&apos;zimda ko&apos;rish&quot;) baribir ishlaydi.
                </p>
              )}
            </div>
          )}
        </div>

        {phase === "live" && (
          <button
            onClick={takeQuality}
            className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Sifatli surat (SI, ~30 soniya)
          </button>
        )}
      </section>

      <aside className="space-y-3">
        <div>
          <div className="font-semibold">{selected.name}</div>
          <div className="text-sm text-neutral-500">
            {selected.priceLabel} · o&apos;lchamlar: {selected.sizes.filter((s) => s.inStock).map((s) => s.size).join(", ")}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
          {cards.map((c) => (
            <button
              key={c.id}
              onClick={() => choose(c.id)}
              title={c.name}
              className={`overflow-hidden rounded-xl border bg-white p-1.5 text-left transition ${
                c.id === selectedId ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200 hover:border-neutral-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.imageUrl} alt="" className="aspect-[4/5] w-full object-contain" />
              <div className="truncate px-1 pt-1 text-xs text-neutral-700">{c.name}</div>
            </button>
          ))}
        </div>
      </aside>

      {quality && (
        <TryOnModal card={selected} provider={provider} initialPhoto={quality} onClose={() => setQuality(null)} />
      )}
    </div>
  );
}
