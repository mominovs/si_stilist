"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReserveResponse } from "@/app/api/reserve/route";
import type { ResultCard } from "@/lib/search";
import { FIT_LABELS, estimateBody, fitSizes, median, type SizeFit } from "@/lib/sizing";
import { SellerModal } from "@/components/shopper/SellerModal";
import { TryOnModal } from "@/components/shopper/TryOnModal";
import { FIT_STYLE, SizePanel, type BodyForm } from "./SizePanel";

/** Jonli oyna tovari: o'lcham jadvali tovar jinsiga bog'liq */
export type MirrorCard = ResultCard & { gender: "erkak" | "ayol" | "unisex" };

// Seans cheklovi (CLAUDE.md: real vaqt seansi ko'pi bilan 60 soniya, keyin avtomatik to'xtaydi)
const SESSION_SECONDS = 60;
// Serverga yuboriladigan kadr: uzun tomoni shuncha piksel. Model kesimni 192x256 da ko'radi, lekin yuz, fon va
// kiyim teksturasi shu o'lchamda chiqadi: kattaroq kadr ekranda tiniqroq
const FRAME_SIDE = 640;
// Bir vaqtda yo'lda bo'lgan kadrlar: biri serverda ishlanayotganda keyingisi yuklanadi (tarmoq kutilmaydi)
const IN_FLIGHT = 2;
const FULL_SIDE = 1536;
// Kamera nisbati: oxirgi shuncha o'lchov mediani; shundan kami bo'lsa hali "o'lchamoqda"
const MAX_SAMPLES = 40;
const MIN_SAMPLES = 8;

/** Server o'lchovi (X-Mirror-Body): yelka va son nuqtalari (0..1) va yelka/gavda nisbati */
type BodyInfo = { pts: [number, number][]; r: number | null; t: number };

function parseBody(raw: string | null): BodyInfo | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw);
    if (!Array.isArray(b.pts) || b.pts.length !== 4) return null;
    return { pts: b.pts, r: typeof b.r === "number" ? b.r : null, t: Number(b.t) || 0 };
  } catch {
    return null;
  }
}

const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

/**
 * Tanlangan o'lcham bahosi gavdada: yelka va ko'krak chizig'i yonlarida strelkalar. Tor: ichkariga (siqadi),
 * keng: tashqariga (osilib turadi), mos: yashil chiziqcha. Kadr oynadek teskari ko'rsatiladi, belgilar ham shunga mos.
 */
function drawFit(canvas: HTMLCanvasElement, pts: [number, number][] | null, fit: SizeFit | null) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!pts || !fit) return;
  const [ls, rs, lh, rh] = pts.map(([x, y]) => [w - x * w, y * h]);
  const sy = (ls[1] + rs[1]) / 2;
  const hy = (lh[1] + rh[1]) / 2;
  const scx = (ls[0] + rs[0]) / 2;
  const hcx = (lh[0] + rh[0]) / 2;
  const sw = Math.abs(ls[0] - rs[0]);
  if (sw < 10) return;
  const lw = Math.max(2, w / 220);
  const arrow = sw * 0.16;
  // Yelka yozuvi chiziq ustida, ko'krakniki ostida: uzoqda turgan odamda ham bir-birini yopmaydi
  const zones = [
    { name: "Yelka", level: fit.shoulder, y: sy, cx: scx, half: sw * 0.62, above: true },
    { name: "Ko'krak", level: fit.chest, y: sy + 0.3 * (hy - sy), cx: scx + 0.3 * (hcx - scx), half: sw * 0.58, above: false },
  ];
  const fs = Math.round(Math.min(w / 40, Math.max(11, sw * 0.17)));
  ctx.lineCap = "round";
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  for (const z of zones) {
    const color = FIT_STYLE[z.level].color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    // Zona chizig'i (shaffof, punktir)
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([lw * 3, lw * 3]);
    ctx.beginPath();
    ctx.moveTo(z.cx - z.half, z.y);
    ctx.lineTo(z.cx + z.half, z.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const side of [-1, 1]) {
      const edge = z.cx + side * z.half;
      if (z.level === "mos") {
        ctx.beginPath();
        ctx.moveTo(edge, z.y - arrow * 0.6);
        ctx.lineTo(edge, z.y + arrow * 0.6);
        ctx.stroke();
        continue;
      }
      // Tor: strelka tashqaridan gavdaga qaraydi; keng: gavdadan tashqariga. "Juda": ikki qavat
      const inward = z.level === "tor" || z.level === "juda-tor";
      const count = z.level.startsWith("juda") ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const base = edge + side * (k * arrow * 0.55);
        const tip = inward ? base : base + side * arrow;
        const tail = inward ? base + side * arrow : base;
        ctx.beginPath();
        ctx.moveTo(tail, z.y);
        ctx.lineTo(tip, z.y);
        const dir = Math.sign(tip - tail);
        ctx.moveTo(tip, z.y);
        ctx.lineTo(tip - dir * arrow * 0.4, z.y - arrow * 0.35);
        ctx.moveTo(tip, z.y);
        ctx.lineTo(tip - dir * arrow * 0.4, z.y + arrow * 0.35);
        ctx.stroke();
      }
    }
    // Yozuv chiziq ostida, gavda o'rtasida: kadr chetlari ekranda kesilishi mumkin, o'rtasi doim ko'rinadi
    const label = `${z.name}: ${FIT_LABELS[z.level].short.toLowerCase()}`;
    const tw = ctx.measureText(label).width;
    const x = Math.max(4, Math.min(w - tw - 4, z.cx - tw / 2));
    const y = z.above ? z.y - fs * 2.1 : z.y + fs * 0.6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(x - 6, y, tw + 12, fs * 1.5, fs * 0.4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - 6, y, 3, fs * 1.5);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, y + fs * 1.1);
  }
}

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
  cards: MirrorCard[];
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
  // O'lcham: bo'y/vazn ixtiyoriy, faqat shu brauzer xotirasida (serverga yuborilmaydi)
  const [form, setForm] = useState<BodyForm>(() => ({
    height: "",
    weight: "",
    gender: cards.find((c) => c.id === initialId)?.gender === "ayol" ? "ayol" : "erkak",
  }));
  const [ratio, setRatio] = useState<number | null>(null);
  const [samples, setSamples] = useState(0);
  // Kadrlar kelyapti, lekin nisbat yo'q (beli ko'rinmaydi yoki yonboshlab turibdi): xaridorga aytiladi
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [sizeChoice, setSizeChoice] = useState<Record<number, string>>({});
  const [order, setOrder] = useState<ReserveResponse | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const selectedRef = useRef(initialId);
  const deadline = useRef(0);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const ratios = useRef<number[]>([]);
  const lastBodyT = useRef(0);
  const unmeasured = useRef(0);
  const bodyPts = useRef<[number, number][] | null>(null);
  const fitRef = useRef<SizeFit | null>(null);

  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];

  const estimate = useMemo(
    () =>
      estimateBody({
        gender: form.gender,
        heightCm: num(form.height),
        weightKg: num(form.weight),
        shoulderRatio: samples >= MIN_SAMPLES ? ratio : null,
      }),
    [form, ratio, samples],
  );
  const { fits, recommended } = useMemo(
    () => fitSizes(selected.sizes.map((s) => s.size), estimate, selected),
    [selected, estimate],
  );
  // Xaridor o'zi tanlamaguncha tavsiya qilingan o'lcham ko'rsatiladi
  const chosen = sizeChoice[selected.id] ?? recommended ?? null;
  const chosenFit = chosen ? (fits.get(chosen) ?? null) : null;

  useEffect(() => {
    fitRef.current = chosenFit;
    if (overlayRef.current) drawFit(overlayRef.current, bodyPts.current, chosenFit);
  }, [chosenFit]);

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
              const body = parseBody(res.headers.get("x-mirror-body"));
              bodyPts.current = body?.pts ?? null;
              if (body?.r && body.t !== lastBodyT.current) {
                // Har niqob yangilanishida bitta o'lchov (bir xil o'lchov qayta-qayta qo'shilmaydi)
                lastBodyT.current = body.t;
                ratios.current = [...ratios.current.slice(1 - MAX_SAMPLES), body.r];
                setRatio(Math.round(median(ratios.current)! * 100) / 100);
                setSamples(ratios.current.length);
                unmeasured.current = 0;
                setCameraBlocked(false);
              } else if (body && !body.r && ++unmeasured.current === 40) {
                setCameraBlocked(true);
              }
              const overlay = overlayRef.current;
              if (overlay) {
                if (overlay.width !== out.width || overlay.height !== out.height) {
                  overlay.width = out.width;
                  overlay.height = out.height;
                }
                drawFit(overlay, bodyPts.current, fitRef.current);
              }
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
      // Yangi seans: kamera o'lchovi qaytadan (boshqa xaridor bo'lishi mumkin)
      ratios.current = [];
      lastBodyT.current = 0;
      unmeasured.current = 0;
      setRatio(null);
      setSamples(0);
      setCameraBlocked(false);
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

  async function placeOrder() {
    if (!chosen) return;
    setOrdering(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/mirror/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected.id, size: chosen, recommended }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Xato (${res.status})`);
      setOrder(data as ReserveResponse);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Yuborib bo'lmadi");
    } finally {
      setOrdering(false);
    }
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
          {/* O'lcham belgilari: teskari emas (yozuvlar o'qilsin), koordinatalar chizishda teskari qilinadi */}
          <canvas
            ref={overlayRef}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${hasFrame && phase === "live" ? "opacity-100" : "opacity-0"}`}
          />

          {phase === "consent" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900/90 p-6 text-center text-white">
              <h2 className="text-xl font-semibold">Jonli oyna</h2>
              <ul className="max-w-sm space-y-1.5 text-left text-sm text-neutral-200">
                <li>• Kamera tasviri faqat shu kompyuterdagi SI serveriga yuboriladi va saqlanmaydi.</li>
                <li>• Seans {SESSION_SECONDS} soniya, keyin kamera o&apos;zi o&apos;chadi.</li>
                <li>• Belgacha ko&apos;rining, qo&apos;llaringiz yonda bo&apos;lsin. Jonli ko&apos;rinish taxminiy.</li>
                <li>
                  • O&apos;lchamni bilish uchun yelka va gavda nisbati o&apos;lchanadi (yuz va teri tahlil qilinmaydi). Bo&apos;y va
                  vazningizni o&apos;ngda kiritsangiz, aniqroq bo&apos;ladi.
                </li>
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
          <div className="text-sm text-neutral-500">{selected.priceLabel}</div>
        </div>
        <SizePanel
          form={form}
          onForm={setForm}
          estimate={estimate}
          camera={phase !== "live" ? "off" : samples >= MIN_SAMPLES ? "done" : cameraBlocked ? "blocked" : "measuring"}
          sizes={selected.sizes}
          fits={fits}
          recommended={recommended}
          chosen={chosen}
          onChoose={(size) => setSizeChoice((m) => ({ ...m, [selected.id]: size }))}
          onOrder={placeOrder}
          ordering={ordering}
          orderError={orderError}
        />
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

      {order && <SellerModal data={order} onClose={() => setOrder(null)} />}
      {quality && (
        <TryOnModal card={selected} provider={provider} initialPhoto={quality} onClose={() => setQuality(null)} />
      )}
    </div>
  );
}
