"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResultCard } from "@/lib/search";
import type { TryOnResult } from "@/lib/tryon";

type Step = "consent" | "camera" | "preview" | "processing" | "result";

const MAX_SIDE = 1024;

/** Rasmni brauzerning o'zida kichraytirib JPEG data URL ga aylantiradi (serverga kichik hajm boradi) */
function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Demo rejim uchun taxminiy ko'rinish: kiyim rasmi xaridor suratining ustiga "multiply" bilan qo'yiladi
 * (oq fon yo'qoladi). Bu haqiqiy SI natijasi emas va interfeysda aniq shunday belgilanadi.
 */
async function demoComposite(photo: string, garmentUrl: string, category: string): Promise<string> {
  const [p, g] = await Promise.all([loadImage(photo), loadImage(garmentUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = p.naturalWidth;
  canvas.height = p.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(p, 0, 0);
  const bottoms = category === "shim" || category === "yubka";
  const w = canvas.width * (bottoms ? 0.42 : 0.6);
  const h = w * (g.naturalHeight / g.naturalWidth || 1.25);
  const x = (canvas.width - w) / 2;
  const y = canvas.height * (bottoms ? 0.48 : 0.2);
  ctx.globalAlpha = 0.92;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(g, x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const label = "DEMO REJIM · taxminiy ko'rinish";
  ctx.font = `${Math.round(canvas.width / 28)}px system-ui, sans-serif`;
  const pad = canvas.width / 60;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(pad, pad, tw + pad * 2, canvas.width / 28 + pad * 1.6);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, pad * 2, pad + canvas.width / 28 + pad * 0.3);
  return canvas.toDataURL("image/jpeg", 0.9);
}

const PROVIDER = {
  local: {
    label: "do'kondagi lokal SI modeli",
    retention: "Surat internetga chiqmaydi va qayta ishlangandan keyin o'chiriladi.",
  },
  gemini: { label: "Google Gemini", retention: "Xizmat uni Google shartlari asosida qayta ishlaydi." },
  fal: { label: "fal.ai", retention: "Xizmatda vaqtinchalik (1 soat) turadi." },
} as const;

export function TryOnModal({
  card,
  provider,
  onClose,
}: {
  card: ResultCard;
  provider: keyof typeof PROVIDER;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("consent");
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ image: string; demo: boolean; reason?: string; seconds: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Har bir kamera so'rovining tartib raqami: eski (bekor qilingan) so'rov kech javob bersa, oqimi darhol o'chiriladi
  const cameraReq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    cameraReq.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Oyna yopilganda kamera albatta o'chiriladi
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    stopCamera(); // ikki marta bosilsa ham bitta oqim qoladi
    const req = cameraReq.current;
    setStep("camera");
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (req !== cameraReq.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError("Kameraga ruxsat berilmadi yoki kamera topilmadi. Rasm yuklashingiz mumkin.");
    }
  }

  function capture() {
    let n = 3;
    setCountdown(n);
    const timer = setInterval(() => {
      n -= 1;
      if (n > 0) return setCountdown(n);
      clearInterval(timer);
      setCountdown(null);
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      setPhoto(toJpeg(v, v.videoWidth, v.videoHeight));
      stopCamera();
      setStep("preview");
    }, 1000);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      setPhoto(toJpeg(img, img.naturalWidth, img.naturalHeight));
      stopCamera();
      setStep("preview");
    } catch {
      setCameraError("Rasmni ochib bo'lmadi");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function submit() {
    if (!photo) return;
    setStep("processing");
    const t0 = performance.now();
    const seconds = () => Math.round((performance.now() - t0) / 1000);
    try {
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: card.id, photo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const r = data as TryOnResult;
      if (r.mode === "api") setResult({ image: r.image, demo: false, seconds: seconds() });
      else {
        const image = r.prepared ?? (await demoComposite(photo, card.imageUrl, card.category));
        setResult({ image, demo: true, reason: r.reason, seconds: seconds() });
      }
      setStep("result");
    } catch (e) {
      // Server bilan umuman aloqa bo'lmasa ham demo ko'rinish ko'rsatiladi
      const reason = e instanceof Error && !e.message.startsWith("HTTP") ? e.message : "server bilan aloqa yo'q";
      setResult({ image: await demoComposite(photo, card.imageUrl, card.category), demo: true, reason, seconds: seconds() });
      setStep("result");
    }
  }

  function retake() {
    setPhoto(null);
    setResult(null);
    void startCamera();
  }

  function close() {
    stopCamera();
    setPhoto(null);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className={`flex max-h-[95dvh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${step === "result" ? "max-w-5xl" : "max-w-3xl"}`}>
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.imageUrl} alt="" className="h-10 w-8 object-contain" />
            <div>
              <div className="font-semibold">O&apos;zimda ko&apos;rish</div>
              <div className="text-xs text-neutral-500">{card.name} · {card.priceLabel}</div>
            </div>
          </div>
          <button onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100" aria-label="Yopish">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "consent" && (
            <div className="mx-auto max-w-lg space-y-4">
              <h2 className="text-xl font-semibold">Suratga tushishdan oldin</h2>
              <ul className="space-y-2 text-sm text-neutral-700">
                <li>• Suratingiz faqat virtual kiyintirish xizmatiga ({PROVIDER[provider].label}) yuboriladi.</li>
                <li>• Bizning serverda va bazada suratingiz <b>saqlanmaydi</b>. {PROVIDER[provider].retention}</li>
                <li>• Natija taxminiy: o&apos;lcham va bichimni aniq ko&apos;rsatmaydi.</li>
                <li>• Eng yaxshi natija uchun: yorug&apos; joyda, to&apos;g&apos;ri turib, belgacha yoki to&apos;liq ko&apos;rining.</li>
              </ul>
              <div className="flex flex-wrap gap-3 pt-2">
                <button onClick={startCamera} className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-700">
                  Roziman, kamerani yoqish
                </button>
                <button onClick={close} className="rounded-xl px-5 py-3 text-sm text-neutral-600 hover:bg-neutral-100">Bekor qilish</button>
              </div>
            </div>
          )}

          {step === "camera" && (
            <div className="space-y-4">
              {cameraError ? (
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{cameraError}</div>
              ) : (
                <div className="relative mx-auto aspect-[3/4] max-h-[60dvh] overflow-hidden rounded-xl bg-neutral-900">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
                  {/* Gavda joylashuvi uchun yo'l-yo'riq */}
                  <div className="pointer-events-none absolute inset-x-[22%] inset-y-[8%] rounded-[45%] border-2 border-dashed border-white/50" />
                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center text-8xl font-bold text-white drop-shadow-lg">{countdown}</div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                {!cameraError && (
                  <button onClick={capture} disabled={countdown !== null} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
                    Suratga olish
                  </button>
                )}
                <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-neutral-300 px-5 py-3 text-sm hover:bg-neutral-50">
                  Rasm yuklash
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
            </div>
          )}

          {step === "preview" && photo && (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Sizning suratingiz" className="mx-auto max-h-[60dvh] rounded-xl" />
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={submit} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-700">Kiyintirish</button>
                <button onClick={retake} className="rounded-xl border border-neutral-300 px-5 py-3 text-sm hover:bg-neutral-50">Qayta olish</button>
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
              <div className="font-medium">Kiyintiryapman...</div>
              <div className="text-sm text-neutral-500">Odatda 10–30 soniya davom etadi</div>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-4">
              {result.demo && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <b>Demo rejim.</b> Virtual kiyintirish xizmati ishlamadi ({result.reason}), shuning uchun taxminiy ko&apos;rinish
                  ko&apos;rsatilmoqda.
                </div>
              )}
              {/* Oldin / keyin: asl surat va natija yonma-yon */}
              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_170px]">
                {photo && (
                  <figure className="space-y-1.5">
                    {/* Model suratni markazdan 3:4 kesadi: solishtirish adolatli bo'lishi uchun bu yerda ham xuddi shunday */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt="Asl surat" className="mx-auto aspect-[3/4] max-h-[55dvh] w-full rounded-xl bg-neutral-100 object-cover" />
                    <figcaption className="text-center text-xs text-neutral-500">Oldin</figcaption>
                  </figure>
                )}
                <figure className="space-y-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.image} alt="Kiyintirish natijasi" className="mx-auto aspect-[3/4] max-h-[55dvh] w-full rounded-xl bg-neutral-100 object-contain" />
                  <figcaption className="text-center text-xs text-neutral-500">
                    {result.demo ? "Keyin (demo)" : `Keyin · ${result.seconds} soniyada tayyor bo'ldi`}
                  </figcaption>
                </figure>
                <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm sm:col-span-2 lg:col-span-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.imageUrl} alt="" className="mx-auto h-28 object-contain" />
                  <div className="font-medium">{card.name}</div>
                  <div>{card.priceLabel}</div>
                  <div className="text-xs text-neutral-500">
                    O&apos;lchamlar: {card.sizes.filter((s) => s.inStock).map((s) => s.size).join(", ") || "yo'q"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={retake} className="rounded-xl border border-neutral-300 px-5 py-3 text-sm hover:bg-neutral-50">Qayta suratga tushish</button>
                <button onClick={close} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-700">Boshqa kiyim tanlash</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
