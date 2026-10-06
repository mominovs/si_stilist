import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, type RequestRow } from "./analytics";
import { EMPTY_QUERY, type ParsedQuery } from "./query/schema";

let id = 0;
const row = (status: RequestRow["status"], q: Partial<ParsedQuery> | null, minutesAgo = 0, text = "matn"): RequestRow => ({
  id: ++id,
  createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0) - minutesAgo * 60_000),
  rawText: text,
  parsed: q ? { ...EMPTY_QUERY, ...q } : null,
  mode: q ? "llm" : "tushunilmadi",
  status,
  resultCount: status === "qoniqtirilmadi" ? 0 : 3,
});

const known = ["kostyum", "libos", "kurtka"];

const rows: RequestRow[] = [
  row("qoniqtirilmadi", { kategoriya: "krossovka", ranglar: ["oq"], olcham: "42" }, 5, "oq krossovka 42"),
  row("qoniqtirilmadi", { kategoriya: "krossovka", ranglar: ["oq"], olcham: "42" }, 50, "белые кроссовки"),
  row("qoniqtirilmadi", { kategoriya: "krossovka", ranglar: ["oq"], olcham: "43" }, 90),
  row("qisman", { kategoriya: "libos", ranglar: ["qizil"], maqsad: "bayram" }, 10, "to'yga qizil libos"),
  row("qisman", { kategoriya: "libos", ranglar: ["qizil"], maqsad: "bayram" }, 20),
  row("qoniqtirildi", { kategoriya: "kostyum", maqsad: "ish", uslub: ["klassik", "ish"] }, 1),
  row("qoniqtirilmadi", { kategoriya: "kurtka", ranglar: ["oq"], jins: "ayol" }, 30),
  row("qoniqtirilmadi", null, 2, "salom"),
  { ...row("qoniqtirilmadi", null, 3, "ronaldo necha yoshda"), mode: "rad" },
];

const stats = computeStats(rows, known);

test("jami va holatlar: tushunilmagan gap 'mos tovar yo'q' hisobiga kirmaydi", () => {
  assert.deepEqual(stats.totals, {
    all: 8,
    understood: 7,
    qoniqtirildi: 1,
    qisman: 2,
    qoniqtirilmadi: 4,
    tushunilmadi: 1,
    rad: 1,
  });
});

test("qoniqtirilmagan talab guruhlanadi va saralanadi", () => {
  assert.deepEqual(
    stats.unmet.map((u) => [u.label, u.type, u.count]),
    [
      ["oq krossovka", "katalogda-yoq", 3],
      ["qizil libos", "oxshashi-bor", 2],
      ["ayollar uchun oq kurtka", "tugagan", 1],
    ],
  );
});

test("o'lchamlar va misollar yig'iladi, yangisi birinchi", () => {
  const k = stats.unmet[0];
  assert.deepEqual(k.sizes, [{ size: "42", count: 2 }, { size: "43", count: 1 }]);
  assert.equal(k.examples[0], "oq krossovka 42");
  assert.equal(k.lastAt, new Date(Date.UTC(2026, 9, 5, 11, 55)).toISOString());
});

test("qoniqtirilgan so'rov talab ro'yxatiga tushmaydi", () => {
  assert.ok(!stats.unmet.some((u) => u.category === "kostyum"));
});

test("kategoriyalar, uslublar (takrorsiz) va ranglar", () => {
  assert.deepEqual(stats.categories.map((c) => [c.name, c.total, c.inCatalog]), [
    ["krossovka", 3, false],
    ["libos", 2, true],
    ["kostyum", 1, true],
    ["kurtka", 1, true],
  ]);
  assert.deepEqual(stats.styles, [
    { name: "bayram", count: 2 },
    { name: "ish", count: 1 },
    { name: "klassik", count: 1 },
  ]);
  assert.deepEqual(stats.colors, [{ name: "oq", count: 4 }, { name: "qizil", count: 2 }]);
});

test("so'nggi so'rovlar vaqt bo'yicha, lastId eng kattasi", () => {
  assert.equal(stats.recent[0].rawText, "matn"); // 1 daqiqa oldin
  assert.equal(stats.lastId, Math.max(...rows.map((r) => r.id)));
});

test("talab jins bo'yicha ajratiladi", () => {
  const r = computeStats(
    [
      row("qoniqtirilmadi", { kategoriya: "futbolka", ranglar: ["oq"], jins: "erkak", olcham: "XL" }),
      row("qoniqtirilmadi", { kategoriya: "futbolka", ranglar: ["oq"], jins: "erkak", olcham: "XL" }),
      row("qoniqtirilmadi", { kategoriya: "futbolka", ranglar: ["oq"], jins: "ayol", olcham: "S" }),
    ],
    ["futbolka"],
  );
  assert.deepEqual(
    r.unmet.map((u) => [u.label, u.count, u.sizes]),
    [
      ["erkaklar uchun oq futbolka", 2, [{ size: "XL", count: 2 }]],
      ["ayollar uchun oq futbolka", 1, [{ size: "S", count: 1 }]],
    ],
  );
});

test("xaridor bahosi va sotuvchiga ko'rsatish: 'mos kelmadi' talab ro'yxatiga 'yoqmadi' bo'lib tushadi", () => {
  const r = computeStats(
    [
      { ...row("qoniqtirildi", { kategoriya: "kostyum" }), feedback: "mos", reserved: 1 },
      { ...row("qoniqtirildi", { kategoriya: "libos", ranglar: ["qizil"] }), feedback: "mos-emas" },
      row("qoniqtirildi", { kategoriya: "kurtka" }),
    ],
    known,
  );
  assert.deepEqual(r.feedback, { mos: 1, mosEmas: 1, reserved: 1, reservedRequests: 1 });
  assert.deepEqual(r.unmet.map((u) => [u.label, u.type]), [["qizil libos", "yoqmadi"]]);
});
