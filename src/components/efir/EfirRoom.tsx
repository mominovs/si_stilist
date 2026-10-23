"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EfirMessage, EfirSignal, EfirState, ParticipantView } from "@/lib/efir";
import type { MirrorCard } from "@/components/mirror/MirrorView";
import { Logo } from "@/components/brand/Logo";

/**
 * Jonli efir (telefon uchun, video qo'ng'iroqdek): tepada katta qilib sherikning kiyintirilgan videosi, burchakda
 * kichik qilib o'zingiz, pastda kiyimlar ("Kiyish" yoki sherikka "Taklif"). Ovoz va video WebRTC orqali telefondan
 * telefonga (bir Wi-Fi'da kechikishsiz); ulanish xabarlari server orqali. WebRTC ulanmasa zaxira: sherikning
 * kiyintirilgan kadrlari server orqali (/api/efir/[code]/frame).
 */

// Efir vaqt bilan cheklanmagan: ikkala efirda ham odam ko'rinmasa server uni 10 daqiqadan keyin yopadi.
// Shuncha qolganda ogohlantiriladi
const CLOSE_WARN_MS = 2 * 60_000;
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
  const [closesInMs, setClosesInMs] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
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
      while (!signal.aborted) {
        const v = videoRef.current;
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
    [],
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
      sessionIdRef.current = randomId();
      const ctrl = new AbortController();
      loopRef.current = ctrl;
      setCameraOn(true);
      void loop(ctrl.signal, code, me);
    } catch {
      setHint("Kamera yoki mikrofonga ruxsat berilmadi.");
    }
  }

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
        if (state.closed) {
          // Ikkala efirda ham uzoq vaqt odam ko'rinmadi: kamera va ulanish yopiladi, holat so'rash to'xtaydi
          setClosed(true);
          stopCamera();
          closePeer();
          return;
        }
        setClosesInMs(state.closesInMs);
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
  }, [pid, code, handleSignal, stopCamera, closePeer]);

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
        <div className="flex justify-center">
          <Logo size={44} />
        </div>
        <div className="card space-y-5 p-6">
          <div>
            <span className="badge badge-danger">
              <span className="live-dot" /> Jonli efir
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold text-brand">Do&apos;stingiz bilan kiyim tanlang</h1>
            <p className="mt-1 text-sm font-medium text-muted">Bir-biringizni yangi kiyimda ko&apos;rib, gaplashib tanlaysiz.</p>
          </div>
          <ul className="space-y-2 text-sm font-medium text-ink">
            <li className="flex gap-2">
              <span className="text-accent">✓</span>Sherigingiz faqat kiyintirilgan tasviringizni ko&apos;radi va ovozingizni eshitadi.
            </li>
            <li className="flex gap-2">
              <span className="text-accent">✓</span>Hech narsa yozib olinmaydi va saqlanmaydi. Efirda ko&apos;pi bilan 2 kishi.
            </li>
            <li className="flex gap-2">
              <span className="text-accent">✓</span>Ikkalangiz bir xonada bo&apos;lsangiz, quloqchin taqing yoki birining ovozini o&apos;chiring.
            </li>
            <li className="flex gap-2">
              <span className="text-accent">✓</span>Vaqt cheklanmagan. 10 daqiqa ikkalangiz ham kadrda ko&apos;rinmasangiz, efir o&apos;zi yopiladi.
            </li>
          </ul>
          <label className="field-label">
            Ismingiz
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Masalan: Vali" className="field mt-2" />
          </label>
          <button onClick={join} disabled={joining} className="btn btn-primary btn-lg w-full">
            {joining ? "Ulanmoqda..." : "Roziman, efirga kirish"}
          </button>
          {joinError && <p className="text-sm font-semibold text-danger">{joinError}</p>}
        </div>
        <Link href="/oyna" className="text-center text-sm font-bold text-muted">
          ← Jonli oyna
        </Link>
      </div>
    );
  }

  const live = !!partner && (partner.live || rtc === "connected");

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-sand">
      {/* Tepa: sherikning efiri (katta) va burchakda o'zingiz (kichik) */}
      <section className="camera-dark relative min-h-0 flex-[1.15] overflow-hidden text-white">
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
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-5 pr-[36%] text-left">
            <span className="badge bg-white/10 text-white">Sherik kutilmoqda</span>
            <p className="font-display text-2xl font-extrabold leading-tight text-white">Do&apos;stingizni taklif qiling</p>
            {share ? (
              <>
                <div className="w-40 rounded-2xl bg-white p-2.5 shadow-[var(--shadow-lift)]" dangerouslySetInnerHTML={{ __html: share.qr }} />
                <p className="break-all text-xs font-medium text-white/60">{share.url}</p>
                <button
                  onClick={() => void navigator.clipboard?.writeText(share.url).then(() => setToast("Havola nusxalandi"))}
                  className="btn btn-sm bg-white text-brand"
                >
                  Havolani nusxalash
                </button>
              </>
            ) : (
              <p className="text-sm text-white/70">Shu sahifa manzilini do&apos;stingizga yuboring</p>
            )}
            <p className="text-xs text-white/50">U ham shu Wi-Fi yoki hotspotga ulangan bo&apos;lsin</p>
          </div>
        )}
        {partner && !partner.live && rtc !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center font-semibold text-white/70">
            {partner.name} kamerasini yoqmoqda...
          </div>
        )}
        {partner && (
          <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-brand/70 py-1 pl-1 pr-3 text-sm font-bold backdrop-blur">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs">
                {partner.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">
                {partner.name}
                {partnerCard && <span className="font-semibold text-white/75"> · {partnerCard.name}</span>}
              </span>
            </div>
            {live && <span className="badge shrink-0 bg-live text-white">JONLI</span>}
          </div>
        )}
        {needsTap && (
          <button
            onClick={() => {
              void remoteRef.current?.play();
              setNeedsTap(false);
            }}
            className="btn absolute inset-x-6 top-16 bg-white text-brand"
          >
            Ovozni yoqish uchun bosing
          </button>
        )}

        {/* Sherikdan taklif (efir ustida) */}
        {suggestion &&
          (() => {
            const card = cards.find((c) => c.id === suggestion.productId);
            if (!card) return null;
            return (
              <div className="absolute bottom-3 left-3 right-[calc(28.5%+1.25rem)] space-y-2 rounded-2xl bg-surface p-3 text-ink shadow-[var(--shadow-float)]">
                <div className="flex items-start gap-2">
                  <span className="flex h-11 w-11 shrink-0 rounded-xl bg-surface-2 p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.imageUrl} alt="" className="h-full w-full object-contain mix-blend-multiply" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                    <b>{suggestion.name}:</b> shuni kiyib ko&apos;r — {card.name}
                  </span>
                  <button onClick={() => setSuggestion(null)} aria-label="Yopish" className="icon-btn h-8 w-8 shrink-0 text-xs">
                    ✕
                  </button>
                </div>
                <button onClick={() => wear(card.id)} className="btn btn-primary w-full">
                  Kiyish
                </button>
              </div>
            );
          })()}

        {closed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-brand/95 p-6 text-center">
            <p className="font-display text-2xl font-extrabold text-white">Efir yopildi</p>
            <p className="max-w-xs text-sm font-medium text-white/75">
              10 daqiqa davomida ikkala efirda ham hech kim kadrda ko&apos;rinmadi. Kamera o&apos;chirildi.
            </p>
            <Link href="/oyna" className="btn btn-primary">
              Yangi efir boshlash
            </Link>
          </div>
        )}

        {/* O'zingiz: oyna kabi teskari */}
        <div
          className="absolute bottom-3 right-3 h-[38%] overflow-hidden rounded-2xl bg-brand-2 shadow-[var(--shadow-lift)] ring-2 ring-white/90"
          style={{ aspectRatio: "3 / 4" }}
        >
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          <canvas
            ref={outRef}
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${hasFrame ? "opacity-100" : "opacity-0"}`}
          />
          <span className="absolute z-10 left-1.5 top-1.5 rounded-full bg-brand/70 px-2 py-0.5 text-[11px] font-bold">Siz</span>
          {!cameraOn && (
            <button
              onClick={() => pid && void startCamera(pid)}
              className="absolute inset-0 flex items-center justify-center bg-brand/80 p-2 text-center text-xs font-bold"
            >
              Kamerani yoqish
            </button>
          )}
        </div>
      </section>
      {hint && <div className="bg-warning-soft px-3 py-2 text-center text-xs font-bold text-warning">{hint}</div>}
      {!closed && closesInMs !== null && closesInMs < CLOSE_WARN_MS && (
        <div className="bg-danger-soft px-3 py-2 text-center text-xs font-bold text-danger">
          Ikkalangiz ham kadrda ko&apos;rinmayapsiz: efir {Math.max(1, Math.ceil(closesInMs / 60_000))} daqiqadan keyin yopiladi
        </div>
      )}

      {/* Boshqaruv qatori */}
      <div className="flex items-center gap-3 bg-brand px-3 py-2.5 text-white">
        <button
          onClick={toggleMute}
          className={`btn btn-sm ${muted ? "bg-accent text-white" : "bg-white/10 text-white hover:bg-white/15"}`}
          aria-pressed={muted}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            {muted && <path d="M4 4l16 16" strokeLinecap="round" />}
          </svg>
          {muted ? "O'chiq" : "Mikrofon"}
        </button>
        {/* Ulanish holati faqat hali ulanmaganda: ulangach bu qator bo'sh (video va ovoz o'zi gapiradi) */}
        <div className="min-w-0 flex-1 text-center">
          {rtc !== "connected" && !closed && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white/75">
              <span className={`h-2 w-2 rounded-full ${partner ? "bg-warning-dot" : "bg-white/40"}`} />
              {partner ? (partnerLive && relaySrc ? "Server orqali" : "Ulanmoqda...") : "Sherik kutilmoqda"}
            </div>
          )}
        </div>
        <Link href="/oyna" aria-label="Efirdan chiqish" className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M3 13.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.4-1.6v-2.6c-2.1-.7-4.3-.7-6.4 0v2.6l-3.4 1.6z" />
          </svg>
        </Link>
      </div>

      {/* Past: kiyimlar */}
      <section className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
          <span className="font-display text-lg font-extrabold text-brand">
            Siz kiygan: <span className="text-accent">{selected?.name}</span>
          </span>
          <span className="whitespace-nowrap text-xs font-bold text-muted">{selected?.priceLabel}</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {cards.map((c) => (
            <div
              key={c.id}
              className={`flex flex-col gap-1.5 rounded-2xl p-2 ${
                c.id === selectedId
                  ? "bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]"
                  : "bg-surface shadow-[inset_0_0_0_1.5px_var(--color-line)]"
              }`}
            >
              <button onClick={() => wear(c.id)} className="block w-full" title={c.name}>
                <span className="block aspect-square w-full rounded-xl bg-surface-2 p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt="" className="h-full w-full object-contain mix-blend-multiply" />
                </span>
                <div className="line-clamp-2 min-h-8 pt-1 text-left text-[11px] font-bold leading-tight text-ink">{c.name}</div>
                {c.store && <div className="truncate text-left text-[10px] font-semibold text-muted">{c.store.name}</div>}
              </button>
              <button onClick={() => wear(c.id)} className="btn btn-brand btn-sm w-full min-h-8 text-xs">
                Kiyish
              </button>
              <button onClick={() => void suggest(c.id)} disabled={!partner} className="btn btn-soft btn-sm w-full min-h-8 text-xs">
                Taklif
              </button>
            </div>
          ))}
        </div>
      </section>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <span className="toast">{toast}</span>
        </div>
      )}
    </div>
  );
}
