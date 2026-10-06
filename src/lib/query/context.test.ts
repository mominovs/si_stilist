import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWithContext } from "./context";
import { parseByKeywords } from "./keywords";
import { EMPTY_QUERY, type ParsedQuery } from "./schema";

const prev: ParsedQuery = {
  ...EMPTY_QUERY,
  kategoriya: "kostyum",
  maqsad: "ish",
  narx_darajasi: "orta",
  rang_istisno: ["qora"],
};
const follow = (text: string) => mergeWithContext(prev, parseByKeywords(text), text);

test("review misoli: 'Endi shuning arzonrog'ini ko'rsat' oldingi shartlarni saqlaydi", () => {
  const q = follow("Endi shuning arzonrog'ini ko'rsat");
  assert.equal(q.kategoriya, "kostyum");
  assert.equal(q.maqsad, "ish");
  assert.deepEqual(q.rang_istisno, ["qora"]);
  assert.equal(q.narx_darajasi, "arzon");
});

test("faqat rang aytilsa, kategoriya va boshqa shartlar qoladi", () => {
  const q = follow("ko'k rangdagisi bormi");
  assert.equal(q.kategoriya, "kostyum");
  assert.deepEqual(q.ranglar, ["ko'k"]);
  assert.equal(q.narx_darajasi, "orta");
});

test("oldin istisno qilingan rang so'ralsa, istisnodan chiqadi", () => {
  const q = follow("qorasi ham bo'laveradi, qora ko'rsat");
  assert.deepEqual(q.ranglar, ["qora"]);
  assert.deepEqual(q.rang_istisno, []);
});

test("boshqa kategoriya: yangi mavzu, oldingi shartlar olinmaydi", () => {
  const q = follow("qizil libos kerak");
  assert.equal(q.kategoriya, "libos");
  assert.equal(q.maqsad, null);
  assert.deepEqual(q.rang_istisno, []);
});

test("qimmatrog'i bir pog'ona yuqori, kontekst bo'lmasa o'zgarishsiz", () => {
  assert.equal(follow("qimmatrog'i bormi").narx_darajasi, "qimmat");
  const fresh = parseByKeywords("futbolka");
  assert.deepEqual(mergeWithContext(null, fresh, "futbolka"), fresh);
});
