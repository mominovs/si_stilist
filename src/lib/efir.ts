/**
 * Jonli efir: ikki kishi bitta "xonada", video qo'ng'iroqdek. Har biri jonli oynada kiyim kiyib ko'radi, ikkinchisi
 * uning kiyintirilgan videosini ko'radi va ovozini eshitadi (WebRTC, telefondan telefonga; bu yerda faqat ulanish
 * xabarlari - "signal" - uzatiladi), kiyim taklif qiladi ("buni kiyib ko'r"). WebRTC ulanmasa zaxira: kiyintirilgan
 * kadrlar shu server orqali (publishFrame / latestFrame).
 *
 * Hammasi faqat jarayon xotirasida (globalThis): bazaga ham, diskka ham yozilmaydi. Har ishtirokchining faqat
 * OXIRGI kadri turadi; xona 30 daqiqa harakatsizlikdan keyin o'chadi. Xona kodi = maxfiy havola.
 */

export const MAX_PARTICIPANTS = 2;
export const MAX_NAME = 24;
export const MAX_TEXT = 300;
// WebRTC ulanish xabari (SDP taklif/javob yoki ICE nomzod) hajmi chegarasi
export const MAX_SIGNAL = 20_000;
const MAX_PENDING_SIGNALS = 100;
const MAX_MESSAGES = 200;
const ROOM_IDLE_MS = 30 * 60_000;
// Shuncha vaqt holat so'ramagan ishtirokchi "chiqib ketgan" hisoblanadi va o'rni bo'shaydi
const PARTICIPANT_IDLE_MS = 20_000;
// Kadr shundan eski bo'lsa "jonli emas" (kamerani o'chirgan)
const FRAME_LIVE_MS = 3000;
// Kod alifbosi: adashtiriladigan belgilar (0/O, 1/I/l) yo'q
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type EfirMessage = { id: number; pid: string; name: string; text: string; productId: number | null; at: number };
type Participant = { pid: string; name: string; seen: number };
type Frame = { seq: number; image: Uint8Array; at: number; productId: number | null };
export type EfirSignal = { from: string; data: string };
type Room = {
  code: string;
  created: number;
  touched: number;
  participants: Map<string, Participant>;
  frames: Map<string, Frame>;
  messages: EfirMessage[];
  nextMessage: number;
  // Har ishtirokchiga hali yetkazilmagan WebRTC signallari (holat so'raganda olinadi va o'chiriladi)
  signals: Map<string, EfirSignal[]>;
};

export type ParticipantView = { pid: string; name: string; live: boolean; productId: number | null };
export type EfirState = { code: string; participants: ParticipantView[]; messages: EfirMessage[]; signals: EfirSignal[] };

const store = globalThis as unknown as { __efirRooms?: Map<string, Room> };
const rooms = (store.__efirRooms ??= new Map());

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function sweep(now: number) {
  for (const [code, room] of rooms) if (now - room.touched > ROOM_IDLE_MS) rooms.delete(code);
}

function liveRoom(code: string, now: number): Room | null {
  sweep(now);
  const room = rooms.get(code);
  if (!room) return null;
  for (const [pid, p] of room.participants) {
    if (now - p.seen > PARTICIPANT_IDLE_MS) {
      room.participants.delete(pid);
      room.frames.delete(pid);
      room.signals.delete(pid);
    }
  }
  return room;
}

export const validCode = (code: string) => /^[a-z2-9]{6}$/.test(code);

export function createRoom(now = Date.now()): string {
  sweep(now);
  let code = randomString(6);
  while (rooms.has(code)) code = randomString(6);
  rooms.set(code, {
    code,
    created: now,
    touched: now,
    participants: new Map(),
    frames: new Map(),
    messages: [],
    nextMessage: 1,
    signals: new Map(),
  });
  return code;
}

const cleanName = (name: string) =>
  name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, MAX_NAME) || "Mehmon";

export type JoinResult = { ok: true; pid: string } | { ok: false; error: "topilmadi" | "to'la" };

/** Xonaga kirish. pid berilsa va hali xonada bo'lsa o'sha qaytadi (sahifa yangilansa o'rni saqlanadi) */
export function joinRoom(code: string, name: string, pid: string | null, now = Date.now()): JoinResult {
  const room = liveRoom(code, now);
  if (!room) return { ok: false, error: "topilmadi" };
  if (pid && room.participants.has(pid)) {
    const p = room.participants.get(pid)!;
    p.name = cleanName(name);
    p.seen = now;
    room.touched = now;
    return { ok: true, pid };
  }
  if (room.participants.size >= MAX_PARTICIPANTS) return { ok: false, error: "to'la" };
  const id = randomString(12);
  room.participants.set(id, { pid: id, name: cleanName(name), seen: now });
  room.touched = now;
  return { ok: true, pid: id };
}

/** Holat: ishtirokchilar (jonlimi, qaysi kiyimda) va since dan keyingi xabarlar. Ishtirokchi bo'lmasa null */
export function roomState(code: string, pid: string, since: number, now = Date.now()): EfirState | null {
  const room = liveRoom(code, now);
  const me = room?.participants.get(pid);
  if (!room || !me) return null;
  me.seen = now;
  room.touched = now;
  return {
    code,
    participants: [...room.participants.values()].map((p) => {
      const f = room.frames.get(p.pid);
      const live = !!f && now - f.at < FRAME_LIVE_MS;
      return { pid: p.pid, name: p.name, live, productId: live ? f!.productId : null };
    }),
    messages: room.messages.filter((m) => m.id > since),
    signals: takeSignals(room, pid),
  };
}

function takeSignals(room: Room, pid: string): EfirSignal[] {
  const list = room.signals.get(pid) ?? [];
  room.signals.delete(pid);
  return list;
}

/** WebRTC signali sherikka (to). Ikkalasi ham xonada bo'lishi shart */
export function postSignal(code: string, pid: string, to: string, data: string, now = Date.now()): boolean {
  const room = liveRoom(code, now);
  if (!room || !room.participants.has(pid) || !room.participants.has(to) || pid === to) return false;
  if (!data || data.length > MAX_SIGNAL) return false;
  const queue = room.signals.get(to) ?? [];
  queue.push({ from: pid, data });
  if (queue.length > MAX_PENDING_SIGNALS) queue.splice(0, queue.length - MAX_PENDING_SIGNALS);
  room.signals.set(to, queue);
  room.participants.get(pid)!.seen = now;
  room.touched = now;
  return true;
}

export function postMessage(
  code: string,
  pid: string,
  text: string,
  productId: number | null,
  now = Date.now(),
): EfirMessage | null {
  const room = liveRoom(code, now);
  const me = room?.participants.get(pid);
  const clean = text.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, MAX_TEXT);
  if (!room || !me || (!clean && productId === null)) return null;
  const message = { id: room.nextMessage++, pid, name: me.name, text: clean, productId, at: now };
  room.messages.push(message);
  if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
  me.seen = now;
  room.touched = now;
  return message;
}

/** Ishtirokchining kiyintirilgan kadri (faqat oxirgisi saqlanadi). Ishtirokchi bo'lmasa false */
export function publishFrame(code: string, pid: string, image: Uint8Array, productId: number | null, now = Date.now()): boolean {
  const room = liveRoom(code, now);
  const me = room?.participants.get(pid);
  if (!room || !me) return false;
  const prev = room.frames.get(pid);
  room.frames.set(pid, { seq: (prev?.seq ?? 0) + 1, image, at: now, productId });
  me.seen = now;
  room.touched = now;
  return true;
}

/**
 * `of` ishtirokchining after dan yangi kadri. So'rovchi (pid) shu xonada bo'lishi shart: begona kodni bilmasdan
 * kadrni ko'ra olmaydi. Yangi kadr yo'q bo'lsa null
 */
export function latestFrame(code: string, pid: string, of: string, after: number, now = Date.now()): Frame | null {
  const room = liveRoom(code, now);
  if (!room || !room.participants.has(pid)) return null;
  room.participants.get(pid)!.seen = now;
  const f = room.frames.get(of);
  if (!f || f.seq <= after || now - f.at > FRAME_LIVE_MS) return null;
  return f;
}

/** Faqat testlar uchun */
export function resetRooms() {
  rooms.clear();
}
