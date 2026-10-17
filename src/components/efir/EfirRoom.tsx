"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EfirMessage, EfirSignal, EfirState, ParticipantView } from "@/lib/efir";
import type { MirrorCard } from "@/components/mirror/MirrorView";

/**
 * Jonli efir (telefon uchun, video qo'ng'iroqdek): tepada katta qilib sherikning kiyintirilgan videosi, burchakda
 * kichik qilib o'zingiz, pastda kiyimlar ("Kiyish" yoki sherikka "Taklif"). Ovoz va video WebRTC orqali telefondan
 * telefonga (bir Wi-Fi'da kechikishsiz); ulanish xabarlari server orqali. WebRTC ulanmasa zaxira: sherikning
 * kiyintirilgan kadrlari server orqali (/api/efir/[code]/frame).
 */

// Efir seansi: lokal model bepul, suhbat uzunroq bo'ladi (keyin "Davom etish")
const EFIR_SECONDS = 600;
// Ikki kishi bitta GPU'ni bo'lishadi: kadr kichikroq va bittadan yo'lda
const FRAME_SIDE = 480;
const FRAME_TIMEOUT_MS = 10_000;
const STATE_POLL_MS = 1000;
const RELAY_POLL_MS = 150;
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
// WebRTC yo'q yoki o'chirilgan brauzer: faqat server orqali kadrlar (ovozsiz)
const hasWebRtc = () => typeof RTCPeerConnection !== "undefined";

type Stage = "join" | "room";
type Signal = { type: "offer" | "answer"; sdp: string } | { type: "ice"; candidate: RTCIceCandidateInit } | { type: "bye" };

function frameBlob(video: HTMLVideoElement, side: number): Promise<Blob | null> {
  const scale = Math.min(1, side / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
}

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function storage(key: string, value?: string): string | null {
  try {
    if (value !== undefined) sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function EfirRoom({
  code,
  cards,
  share,
}: {
  code: string;
  cards: MirrorCard[];
  share: { url: string; qr: string } | null;
}) {
  const [stage, setStage] = useState<Stage>("join");
  // Oldingi ism (shu brauzerda) birinchi bosishda olinadi: server render bilan farq qilmasin
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [pid, setPid] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? 0);
  const [cameraOn, setCameraOn] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [left, setLeft] = useState(EFIR_SECONDS);
  const [rtc, setRtc] = useState<"off" | "connecting" | "connected">("off");
  const [relaySrc, setRelaySrc] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<EfirMessage | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef("");
  const selectedRef = useRef(selectedId);
  const deadline = useRef(0);
  const sinceRef = useRef(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pcPartner = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<{ from: string; sdp: string } | null>(null);
  const offeredAt = useRef(0);
  const relaySeq = useRef(0);

  const partner = participants.find((p) => p.pid !== pid) ?? null;
  const partnerCard = partner?.productId ? cards.find((c) => c.id === partner.productId) : null;
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];

  const api = useCallback(
    async (body: object) => {
      const res = await fetch(`/api/efir/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error ?? `Xato (${res.status})`), { status: res.status });
      return data;
    },
    [code],
  );

  const sendSignal = useCallback(
    (to: string, signal: Signal) => {
      if (!pid) return;
      void api({ action: "signal", pid, to, data: JSON.stringify(signal) }).catch(() => {});
    },
    [api, pid],
  );

  // ---------- Kamera va jonli oyna kadrlari (o'z kiyintirilgan tasviri outRef canvas'da) ----------

  const stopCamera = useCallback(() => {
    loopRef.current?.abort();
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setHasFrame(false);
  }, []);

  const loop = useCallback(
    async (signal: AbortSignal, room: string, me: string) => {
      deadline.current = Date.now() + EFIR_SECONDS * 1000;
      while (!signal.aborted) {
        const v = videoRef.current;
        if (Date.now() > deadline.current) {
          stopCamera();
          return;
        }
        if (!v || v.readyState < 2) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        const blob = await frameBlob(v, FRAME_SIDE);
        if (!blob || signal.aborted) continue;
        const ctrl = new AbortController();
        const abort = () => ctrl.abort();
        signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, FRAME_TIMEOUT_MS);
        try {
          const res = await fetch(`/api/mirror?productId=${selectedRef.current}`, {
            method: "POST",
            headers: {
              "Content-Type": "image/jpeg",
              "X-Mirror-Session": sessionIdRef.current,
              "X-Efir-Room": room,
              "X-Efir-Pid": me,
            },
            body: blob,
            signal: ctrl.signal,
          });
          if (res.ok) {
            const bmp = await createImageBitmap(await res.blob());
            const out = outRef.current;
            if (out && !signal.aborted) {
              if (out.width !== bmp.width || out.height !== bmp.height) {
                out.width = bmp.width;
                out.height = bmp.height;
              }
              out.getContext("2d")!.drawImage(bmp, 0, 0);
              setHasFrame(true);
              setHint(null);
            }
            bmp.close();
          } else {
            const data = await res.json().catch(() => ({}));
            if (signal.aborted) return;
            if (res.status === 422) {
              setHasFrame(false);
              setHint(data.error ?? "Kameraga belgacha ko'rining");
            } else if (res.status === 409 || res.status === 503 || res.status === 500) {
              setHint(data.error ?? "Jonli oyna ishlamayapti");
              await new Promise((r) => setTimeout(r, 2000));
            } else {
              setHint(data.error ?? `Xato (${res.status})`);
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        } catch {
          if (signal.aborted) return;
          setHint("Server bilan aloqa yo'q");
          await new Promise((r) => setTimeout(r, 1000));
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        }
      }
    },
    [stopCamera],
  );

  async function startCamera(me: string) {
    stopCamera();
    // Kamera qayta yoqilsa mikrofon yo'li yangi: eski ulanish yopiladi, taklifchi yangisini boshlaydi
    if (pcPartner.current) sendSignal(pcPartner.current, { type: "bye" });
    closePeer();
    setHint(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setHint("Kamera faqat HTTPS orqali ishlaydi: QR koddagi https:// manzilni oching.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
      if (videoRef.current) videoRef.current.srcObject = stream;
      deadline.current = 0; // loop boshlanganda belgilanadi
      setLeft(EFIR_SECONDS);
      sessionIdRef.current = randomId();
      const ctrl = new AbortController();
      loopRef.current = ctrl;
      setCameraOn(true);
      void loop(ctrl.signal, code, me);
    } catch {
      setHint("Kamera yoki mikrofonga ruxsat berilmadi.");
    }
  }

  // Qolgan vaqt
  useEffect(() => {
    if (!cameraOn) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [cameraOn]);

  // ---------- WebRTC: ovoz va kiyintirilgan video sherikka ----------

  const closePeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pcPartner.current = null;
    pendingIce.current = [];
    offeredAt.current = 0;
    setRtc("off");
    if (remoteRef.current) remoteRef.current.srcObject = null;
  }, []);

  const createPeer = useCallback(
    (to: string) => {
      closePeer();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      pcPartner.current = to;
      setRtc("connecting");
      // Yuboriladi: kiyintirilgan tasvir (canvas) va mikrofon. Kamera xom tasviri yuborilmaydi
      const out = outRef.current;
      const mic = streamRef.current?.getAudioTracks()[0];
      if (out && "captureStream" in out) {
        const local = out.captureStream(15);
        if (mic) local.addTrack(mic);
        local.getTracks().forEach((t) => pc.addTrack(t, local));
      } else if (mic) {
        pc.addTrack(mic, new MediaStream([mic]));
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(to, { type: "ice", candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const remote = remoteRef.current;
        if (!remote) return;
        // Video va ovoz alohida keladi, lekin bitta oqimda: oqim bir marta ulanadi (qayta ulash play() ni uzadi)
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        if (remote.srcObject !== stream) remote.srcObject = stream;
        remote.play().catch((err: unknown) => {
          // Faqat brauzer ovozli avtoijroni taqiqlasa tugma (boshqa xatolar, masalan uzilgan play(), o'tib ketadi)
          if (err instanceof DOMException && err.name === "NotAllowedError") setNeedsTap(true);
        });
      };
      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        if (pc.connectionState === "connected") setRtc("connected");
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer();
      };
      return pc;
    },
    [closePeer, sendSignal],
  );

  const handleSignal = useCallback(
    async (s: EfirSignal) => {
      let signal: Signal;
      try {
        signal = JSON.parse(s.data);
      } catch {
        return;
      }
      if (signal.type === "bye") {
        if (pcPartner.current === s.from) closePeer();
        return;
      }
      if (signal.type === "offer") {
        if (!hasWebRtc()) return;
        // O'z kamerasi hali yoqilmagan bo'lsa taklif kutib turadi (javobda o'z tasviri ham bo'lsin)
        if (!streamRef.current) {
          pendingOffer.current = { from: s.from, sdp: signal.sdp };
          return;
        }
        const pc = createPeer(s.from);
        await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(s.from, { type: "answer", sdp: answer.sdp ?? "" });
        return;
      }
      const pc = pcRef.current;
      if (!pc || pcPartner.current !== s.from) return;
      if (signal.type === "answer" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (signal.type === "ice") {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => {});
        else pendingIce.current.push(signal.candidate);
      }
    },
    [closePeer, createPeer, sendSignal],
  );

  // Taklifchi: pid'i kichigi (ikkalasi bir vaqtda taklif qilib, to'qnashmasin). Javob 8 s kelmasa qayta
  useEffect(() => {
    if (!pid || !cameraOn) return;
    if (pendingOffer.current && streamRef.current) {
      const offer = pendingOffer.current;
      pendingOffer.current = null;
      void handleSignal({ from: offer.from, data: JSON.stringify({ type: "offer", sdp: offer.sdp }) });
    }
    if (!partner) {
      if (pcRef.current) closePeer();
      return;
    }
    if (pcPartner.current && pcPartner.current !== partner.pid) closePeer();
    if (pid > partner.pid || !hasWebRtc()) return;
    const stale = rtc !== "connected" && offeredAt.current && Date.now() - offeredAt.current > 8000;
    if (pcRef.current && !stale) return;
    void (async () => {
      const pc = createPeer(partner.pid);
      offeredAt.current = Date.now();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(partner.pid, { type: "offer", sdp: offer.sdp ?? "" });
    })();
  }, [pid, cameraOn, partner, rtc, participants, createPeer, closePeer, handleSignal, sendSignal]);

  // ---------- Xona holati (har soniya): ishtirokchilar, takliflar, WebRTC signallari ----------

  useEffect(() => {
    if (!pid) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/efir/${code}?pid=${pid}&since=${sinceRef.current}`, { cache: "no-store" });
        if (res.status === 404) {
          setToast("Efirdan chiqib ketdingiz: sahifani yangilang");
          return;
        }
        const state = (await res.json()) as EfirState;
        if (stopped) return;
        setParticipants(state.participants);
        for (const m of state.messages) {
          sinceRef.current = Math.max(sinceRef.current, m.id);
          if (m.pid !== pid && m.productId) setSuggestion(m);
        }
        for (const s of state.signals) await handleSignal(s);
      } catch {
        // tarmoq uzilishi: keyingi tikda qayta
      }
      if (!stopped) setTimeout(tick, STATE_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [pid, code, handleSignal]);

  // Zaxira: WebRTC ulanmagan bo'lsa sherikning kiyintirilgan kadrlari server orqali
  const partnerLive = !!partner?.live;
  const partnerPid = partner?.pid ?? null;
  useEffect(() => {
    if (!pid || !partnerPid || !partnerLive || rtc === "connected") return;
    let stopped = false;
    let url: string | null = null;
    relaySeq.current = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/efir/${code}/frame?pid=${pid}&of=${partnerPid}&after=${relaySeq.current}`, {
          cache: "no-store",
        });
        if (res.status === 200) {
          relaySeq.current = Number(res.headers.get("x-seq")) || relaySeq.current;
          const next = URL.createObjectURL(await res.blob());
          if (url) URL.revokeObjectURL(url);
          url = next;
          if (!stopped) setRelaySrc(next);
        }
      } catch {
        // keyingi tikda qayta
      }
      if (!stopped) setTimeout(tick, RELAY_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pid, partnerPid, partnerLive, rtc, code]);

  // Sahifa yopilsa: kamera o'chadi, sherikka "xayr". Faqat bir marta (pid o'zgarganda kamerani o'chirmasin)
  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);
  useEffect(
    () => () => {
      stopCamera();
      if (pcPartner.current) sendSignalRef.current(pcPartner.current, { type: "bye" });
      pcRef.current?.close();
    },
    [stopCamera],
  );

  // ---------- Amallar ----------

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("efir-name");
      } catch {
        // xususiy rejim
      }
      const clean = name.trim() || saved || "Mehmon";
      try {
        localStorage.setItem("efir-name", clean);
      } catch {
        // xususiy rejim
      }
      const data = await api({ action: "join", name: clean, pid: storage(`efir-pid-${code}`) });
      storage(`efir-pid-${code}`, data.pid);
      setPid(data.pid);
      setStage("room");
      await startCamera(data.pid);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Kirib bo'lmadi");
    } finally {
      setJoining(false);
    }
  }

  function wear(id: number) {
    setSelectedId(id);
    selectedRef.current = id;
    if (suggestion?.productId === id) setSuggestion(null);
  }

  async function suggest(id: number) {
    if (!pid) return;
    try {
      await api({ action: "chat", pid, text: "", productId: id });
      setToast(partner ? `${partner.name}ga taklif qilindi` : "Sherik hali kirmagan");
    } catch {
      setToast("Taklif yuborilmadi");
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  }

  // ---------- Ko'rinish ----------

  if (stage === "join") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jonli efir</h1>
          <p className="mt-1 text-sm text-neutral-500">Do&apos;stingiz bilan kiyim tanlang: bir-biringizni kiyimda ko&apos;rib gaplashasiz</p>
        </div>
        <ul className="space-y-1.5 text-sm text-neutral-600">
          <li>• Kamera va mikrofon yoqiladi. Sherigingiz faqat kiyintirilgan tasviringizni ko&apos;radi va ovozingizni eshitadi.</li>
          <li>• Hech narsa yozib olinmaydi va saqlanmaydi. Efirda ko&apos;pi bilan 2 kishi.</li>
          <li>• Ikkala telefon bir xonada bo&apos;lsa, ovoz qaytmasligi uchun quloqchin taqing yoki birining ovozini o&apos;chiring.</li>
        </ul>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="Ismingiz"
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
        />
        <button
          onClick={join}
          disabled={joining}
          className="rounded-xl bg-rose-600 px-6 py-3 font-medium text-white hover:bg-rose-500 disabled:opacity-60"
        >
          {joining ? "Ulanmoqda..." : "Roziman, efirga kirish"}
        </button>
        {joinError && <p className="text-sm text-red-600">{joinError}</p>}
        <Link href="/oyna" className="text-center text-sm text-neutral-500">← Jonli oyna</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-neutral-950 text-white">
      {/* Tepa: sherikning efiri (katta) va burchakda o'zingiz (kichik) */}
      <section className="relative min-h-0 flex-[1.15] overflow-hidden bg-neutral-900">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className={`absolute inset-0 h-full w-full object-contain ${rtc === "connected" ? "opacity-100" : "opacity-0"}`}
        />
        {rtc !== "connected" && partnerLive && relaySrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={relaySrc} alt="" className="absolute inset-0 h-full w-full object-contain" />
        )}
        {!partner && (
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-5 pr-[34%] text-left">
            <p className="text-lg font-medium">Do&apos;stingizni taklif qiling</p>
            {share ? (
              <>
                <div className="w-40 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: share.qr }} />
                <p className="break-all text-xs text-neutral-400">{share.url}</p>
                <button
                  onClick={() => void navigator.clipboard?.writeText(share.url).then(() => setToast("Havola nusxalandi"))}
                  className="rounded-lg border border-white/30 px-3 py-1.5 text-sm"
                >
                  Havolani nusxalash
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-400">Shu sahifa manzilini do&apos;stingizga yuboring</p>
            )}
            <p className="text-xs text-neutral-500">U ham shu Wi-Fi yoki hotspotga ulangan bo&apos;lsin</p>
          </div>
        )}
        {partner && !partner.live && rtc !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-neutral-400">
            {partner.name} kamerasini yoqmoqda...
          </div>
        )}
        {partner && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${partner.live || rtc === "connected" ? "animate-pulse bg-red-500" : "bg-neutral-500"}`} />
            {partner.name}
            {partnerCard && <span className="text-white/70">· {partnerCard.name}</span>}
          </div>
        )}
        {needsTap && (
          <button
            onClick={() => {
              void remoteRef.current?.play();
              setNeedsTap(false);
            }}
            className="absolute inset-x-6 top-14 rounded-xl bg-white/90 px-4 py-2 text-sm font-medium text-neutral-900"
          >
            Ovozni yoqish uchun bosing
          </button>
        )}

        {/* O'zingiz: oyna kabi teskari */}
        <div className="absolute bottom-3 right-3 h-[38%] overflow-hidden rounded-xl border-2 border-white/80 bg-neutral-800 shadow-lg" style={{ aspectRatio: "3 / 4" }}>
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          <canvas
            ref={outRef}
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${hasFrame ? "opacity-100" : "opacity-0"}`}
          />
          {!cameraOn && (
            <button
              onClick={() => pid && void startCamera(pid)}
              className="absolute inset-0 flex items-center justify-center bg-black/70 p-2 text-center text-xs"
            >
              Kamerani yoqish
            </button>
          )}
        </div>
        {hint && <div className="absolute inset-x-3 bottom-[calc(38%+1.5rem)] rounded-lg bg-amber-50/95 px-3 py-2 text-center text-xs text-amber-900">{hint}</div>}
      </section>

      {/* Boshqaruv qatori */}
      <div className="flex items-center gap-2 border-y border-white/10 px-3 py-2 text-sm">
        <button onClick={toggleMute} className={`rounded-full px-3 py-1.5 ${muted ? "bg-red-600" : "bg-white/10"}`}>
          {muted ? "Mikrofon o'chiq" : "Mikrofon"}
        </button>
        <span className="text-xs text-white/60">
          {rtc === "connected"
            ? "To'g'ridan-to'g'ri ulangan"
            : partner
              ? partnerLive && relaySrc
                ? "Server orqali"
                : "Ulanmoqda..."
              : "Sherik kutilmoqda"}
        </span>
        <span className="ml-auto text-xs text-white/60">{cameraOn ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}</span>
        {!cameraOn && pid && (
          <button onClick={() => void startCamera(pid)} className="rounded-full bg-rose-600 px-3 py-1.5">
            Davom etish
          </button>
        )}
      </div>

      {/* Sherikdan taklif */}
      {suggestion && (() => {
        const card = cards.find((c) => c.id === suggestion.productId);
        if (!card) return null;
        return (
          <div className="flex items-center gap-3 bg-rose-600/90 px-3 py-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.imageUrl} alt="" className="h-10 w-10 rounded bg-white object-contain p-0.5" />
            <span className="min-w-0 flex-1 truncate">
              <b>{suggestion.name}</b>: shuni kiyib ko&apos;r — {card.name}
            </span>
            <button onClick={() => wear(card.id)} className="rounded-lg bg-white px-3 py-1.5 font-medium text-rose-700">
              Kiyish
            </button>
            <button onClick={() => setSuggestion(null)} aria-label="Yopish" className="px-1 text-white/80">
              ✕
            </button>
          </div>
        );
      })()}

      {/* Past: kiyimlar */}
      <section className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-3 text-neutral-900">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold">Siz kiygan: {selected?.name}</span>
          <span className="text-xs text-neutral-500">{selected?.priceLabel}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cards.map((c) => (
            <div
              key={c.id}
              className={`overflow-hidden rounded-xl border bg-white ${c.id === selectedId ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200"}`}
            >
              <button onClick={() => wear(c.id)} className="block w-full p-1.5" title={c.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.imageUrl} alt="" className="aspect-[4/5] w-full object-contain" />
                <div className="truncate pt-1 text-left text-[11px] text-neutral-700">{c.name}</div>
              </button>
              <div className="grid grid-cols-2 border-t border-neutral-100 text-[11px] font-medium">
                <button onClick={() => wear(c.id)} className="py-1.5 hover:bg-neutral-100">
                  Kiyish
                </button>
                <button
                  onClick={() => void suggest(c.id)}
                  disabled={!partner}
                  className="border-l border-neutral-100 py-1.5 text-rose-600 hover:bg-rose-50 disabled:text-neutral-300"
                >
                  Taklif
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
          <span className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white">{toast}</span>
        </div>
      )}
    </div>
  );
}
