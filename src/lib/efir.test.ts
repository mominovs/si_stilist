import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { EFIR_IDLE_MS, createRoom, joinRoom, latestFrame, postMessage, postSignal, publishFrame, resetRooms, roomState, validCode } from "./efir";

beforeEach(() => resetRooms());

const joined = (code: string, name: string, now = 0) => {
  const r = joinRoom(code, name, null, now);
  assert.ok(r.ok);
  return r.pid;
};

test("xona: kod formati, ikki kishi kiradi, uchinchisi kirolmaydi", () => {
  const code = createRoom(0);
  assert.ok(validCode(code));
  const a = joined(code, "Ali", 0);
  joined(code, "Vali", 0);
  assert.deepEqual(joinRoom(code, "Soli", null, 0), { ok: false, error: "to'la" });
  // Sahifa yangilansa o'z o'rni bilan qaytadi
  assert.deepEqual(joinRoom(code, "Ali", a, 1), { ok: true, pid: a });
  assert.deepEqual(joinRoom("yoqxon", "X", null, 0), { ok: false, error: "topilmadi" });
});

test("chiqib ketgan ishtirokchining o'rni bo'shaydi", () => {
  const code = createRoom(0);
  joined(code, "Ali", 0);
  const b = joined(code, "Vali", 0);
  assert.ok(roomState(code, b, 0, 15_000)); // Vali holat so'rab turibdi, Ali jim
  const r = joinRoom(code, "Soli", null, 25_000);
  assert.ok(r.ok);
  assert.deepEqual(roomState(code, b, 0, 25_000)!.participants.map((p) => p.name).sort(), ["Soli", "Vali"]);
});

test("chat: since dan keyingi xabarlar, ism va matn tozalanadi, kiyim taklifi", () => {
  const code = createRoom(0);
  const a = joined(code, "  <b>Ali</b>  ", 0);
  const b = joined(code, "Vali", 0);
  const m1 = postMessage(code, a, "  salom  ", null, 1);
  assert.equal(m1?.text, "salom");
  assert.equal(m1?.name, "bAli/b");
  postMessage(code, b, "", 42, 2);
  assert.equal(postMessage(code, b, "   ", null, 3), null);
  const state = roomState(code, b, m1!.id, 4)!;
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].productId, 42);
  assert.equal(postMessage(code, "begona", "x", null, 5), null);
});

test("kadr: faqat xonadagilar oladi, yangi kadr seq bo'yicha, eski kadr jonli emas", () => {
  const code = createRoom(0);
  const a = joined(code, "Ali", 0);
  const b = joined(code, "Vali", 0);
  assert.ok(publishFrame(code, a, new Uint8Array([1]), 7, 100));
  assert.equal(publishFrame(code, "begona", new Uint8Array([1]), 7, 100), false);
  const f = latestFrame(code, b, a, 0, 200)!;
  assert.equal(f.seq, 1);
  assert.equal(latestFrame(code, b, a, 1, 200), null, "yangi kadr yo'q");
  assert.equal(latestFrame(code, "begona", a, 0, 200), null);
  const s = roomState(code, b, 0, 300)!;
  assert.deepEqual(s.participants.find((p) => p.pid === a), { pid: a, name: "Ali", live: true, productId: 7 });
  assert.equal(latestFrame(code, b, a, 0, 5000), null, "3 s dan eski kadr ko'rsatilmaydi");
});

test("WebRTC signallari: faqat xonadagilar orasida, bir marta yetkaziladi", () => {
  const code = createRoom(0);
  const a = joined(code, "Ali", 0);
  const b = joined(code, "Vali", 0);
  assert.ok(postSignal(code, a, b, '{"type":"offer"}', 1));
  assert.equal(postSignal(code, a, a, "x", 1), false, "o'ziga emas");
  assert.equal(postSignal(code, a, "begona", "x", 1), false);
  assert.equal(postSignal(code, a, b, "x".repeat(20_001), 1), false, "juda katta");
  assert.deepEqual(roomState(code, b, 0, 2)!.signals, [{ from: a, data: '{"type":"offer"}' }]);
  assert.deepEqual(roomState(code, b, 0, 3)!.signals, [], "ikkinchi marta bo'sh");
  assert.deepEqual(roomState(code, a, 0, 3)!.signals, []);
});

test("ikkala efirda ham odam ko'rinmasa 10 daqiqadan keyin efir yopiladi", () => {
  const code = createRoom(0);
  const a = joined(code, "Ali");
  const b = joined(code, "Vali");
  const img = new Uint8Array([1]);
  // Holat so'rab turishadi, lekin kadr (odam) yo'q: vaqt yaratilgandan hisoblanadi
  const t1 = EFIR_IDLE_MS - 10_000;
  for (let t = 10_000; t <= t1; t += 10_000) {
    roomState(code, a, 0, t);
    roomState(code, b, 0, t);
  }
  assert.equal(roomState(code, a, 0, t1)!.closed, false);
  // Bittasida odam paydo bo'ldi: hisob qaytadan
  assert.ok(publishFrame(code, b, img, null, t1));
  const t2 = t1 + EFIR_IDLE_MS - 5000;
  for (let t = t1 + 10_000; t <= t2; t += 10_000) {
    roomState(code, a, 0, t);
    roomState(code, b, 0, t);
  }
  const s = roomState(code, a, 0, t2)!;
  assert.equal(s.closed, false);
  assert.equal(s.closesInMs, 5000);
  const t3 = t1 + EFIR_IDLE_MS + 1000;
  roomState(code, b, 0, t3);
  assert.equal(roomState(code, a, 0, t3)!.closed, true);
  // Yopilgan efirga kirib, kadr yoki taklif yuborib bo'lmaydi
  assert.equal(publishFrame(code, a, img, null, t3), false);
  assert.equal(postMessage(code, a, "", 1, t3), null);
  assert.deepEqual(joinRoom(code, "Soli", null, t3), { ok: false, error: "topilmadi" });
});
