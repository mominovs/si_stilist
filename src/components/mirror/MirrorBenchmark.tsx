"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Jonli oyna modeli (export_onnx.py) shu telefonning o'zida qanchalik tez ishlashini o'lchaydi: WebGPU (fp16 va
// fp32) va oddiy protsessor (WASM). Namuna bo'lsa natija kompyuterdagi PyTorch natijasi bilan solishtiriladi.
// onnxruntime-web saytning o'zidan yuklanadi (/models/ort), bundler orqali emas: WASM fayllari aynan shu yerda

const W = 192;
const H = 256;
const WARMUP_MAX_RUNS = 20;
const TIMED_BUDGET_MS = 12_000;

type Backend = "webgpu" | "wasm";
type FileKind = "fp32" | "fp16";
type Meta = {
  created: string;
  view: string;
  weights: string;
  sample: boolean;
  files: Partial<Record<FileKind, { name: string; bytes: number }>>;
};
type Row = {
  backend: Backend;
  file: FileKind;
  status: "kutmoqda" | "yuklanmoqda" | "tayyorlanmoqda" | "o'lchanmoqda" | "tayyor" | "xato";
  progress?: number;
  downloadMs?: number;
  initMs?: number;
  firstMs?: number;
  avgMs?: number;
  p50Ms?: number;
  runs?: number;
  diff?: number | null;
  error?: string;
};
type Shared = {
  id: number;
  at: number;
  device: string;
  backend: Backend;
  file: FileKind;
  avgMs: number;
  fps: number;
  gpu: string | null;
  model: string;
};

// onnxruntime-web global API'sining bizga kerakli qismi
type OrtTensor = { data: Float32Array; dims: number[] };
type OrtSession = {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
};
type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create(model: Uint8Array, options: { executionProviders: string[]; graphOptimizationLevel: string }): Promise<OrtSession>;
  };
};
type GpuNavigator = { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null> } };

let ortPromise: Promise<Ort> | null = null;

function loadOrt(): Promise<Ort> {
  ortPromise ??= new Promise<Ort>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/models/ort/ort.min.js";
    script.onload = () => {
      const ort = (window as unknown as { ort?: Ort }).ort;
      if (!ort) return reject(new Error("onnxruntime yuklanmadi"));
      ort.env.wasm.wasmPaths = "/models/ort/";
      ort.env.wasm.numThreads = threadCount();
      resolve(ort);
    };
    script.onerror = () => reject(new Error("/models/ort/ort.min.js yuklanmadi"));
    document.head.appendChild(script);
  });
  return ortPromise;
}

function threadCount(): number {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1;
}

async function download(url: string, onProgress: (p: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function imagePixels(url: string): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

/** RGBA piksellar -> 1x3xHxW, [-1, 1] (serverdagi MirrorEngine._tensor bilan bir xil) */
function toChw(rgba: Uint8ClampedArray, mask?: Float32Array): Float32Array {
  const out = new Float32Array(3 * W * H);
  for (let i = 0; i < W * H; i++) {
    const m = mask ? mask[i] : 1;
    for (let c = 0; c < 3; c++) out[c * W * H + i] = ((rgba[i * 4 + c] / 255) * 2 - 1) * m;
  }
  return out;
}

type Inputs = { person: Float32Array; clothes: Float32Array; edge: Float32Array; reference: Uint8ClampedArray | null };

async function buildInputs(base: string, sample: boolean): Promise<Inputs> {
  if (sample) {
    const [person, cloth, edgeImg, reference] = await Promise.all(
      ["odam", "kiyim", "kontur", "natija"].map((n) => imagePixels(`${base}/namuna_${n}.png`)),
    );
    const edge = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) edge[i] = edgeImg[i * 4] > 127 ? 1 : 0;
    return { person: toChw(person), clothes: toChw(cloth, edge), edge, reference };
  }
  // Namuna yo'q: faqat tezlik o'lchanadi (tasodifiy kirish, natija ma'nosiz)
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
  const edge = new Float32Array(W * H);
  for (let y = 40; y < 220; y++) for (let x = 30; x < 160; x++) edge[y * W + x] = 1;
  const person = Float32Array.from({ length: 3 * W * H }, rand);
  const clothes = Float32Array.from({ length: 3 * W * H }, (_, i) => rand() * edge[i % (W * H)]);
  return { person, clothes, edge, reference: null };
}

/** Model chiqishi (1x3xHxW, [-1, 1]) -> RGBA */
function toRgba(data: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = (data[c * W * H + i] + 1) * 127.5;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function meanDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) sum += Math.abs(a[i * 4 + c] - b[i * 4 + c]);
  return sum / (W * H * 3);
}

const fmt = (v?: number, d = 0) => (v === undefined ? "–" : v.toFixed(d));
const mb = (bytes?: number) => (bytes ? `${(bytes / 1e6).toFixed(1)} MB` : "–");

function verdict(fps: number): { text: string; tone: string } {
  if (fps >= 15) return { text: "Yaxshi: jonli oyna shu telefonning o'zida ishlay oladi", tone: "badge-ok" };
  if (fps >= 8) return { text: "Chegarada: ishlaydi, lekin kamera tahlili bilan sekinlashishi mumkin", tone: "badge-warn" };
  return { text: "Sekin: bu telefonga server rejimi (kompyuter orqali) kerak", tone: "badge-danger" };
}

export function MirrorBenchmark({ model }: { model: string }) {
  const base = `/models/mirror/${model}`;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [env, setEnv] = useState<{ webgpu: boolean; gpu: string | null; threads: number; isolated: boolean } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [shared, setShared] = useState<Shared[]>([]);
  const outRef = useRef<HTMLCanvasElement>(null);

  const refreshShared = useCallback(async () => {
    const res = await fetch("/api/oyna-sinov", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setShared(((await res.json()) as { results: Shared[] }).results);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gpuNav = navigator as unknown as GpuNavigator;
      let gpu: string | null = null;
      let webgpu = false;
      if (gpuNav.gpu) {
        const adapter = await gpuNav.gpu.requestAdapter().catch(() => null);
        webgpu = Boolean(adapter);
        gpu = [adapter?.info?.vendor, adapter?.info?.architecture].filter(Boolean).join(" ") || null;
      }
      const res = await fetch(`${base}/meta.json`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      refreshShared();
      setEnv({ webgpu, gpu, threads: threadCount(), isolated: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated });
      if (!res?.ok) {
        setMetaError("Model hali eksport qilinmagan");
        return;
      }
      const m = (await res.json()) as Meta;
      setMeta(m);
      const plan: Row[] = [];
      if (webgpu) {
        if (m.files.fp16) plan.push({ backend: "webgpu", file: "fp16", status: "kutmoqda" });
        if (m.files.fp32) plan.push({ backend: "webgpu", file: "fp32", status: "kutmoqda" });
      }
      if (m.files.fp32) plan.push({ backend: "wasm", file: "fp32", status: "kutmoqda" });
      setRows(plan);
    })();
    return () => {
      cancelled = true;
    };
  }, [base, refreshShared]);

  const start = useCallback(async () => {
    if (!meta || !env) return;
    setRunning(true);
    const update = (i: number, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const files = new Map<FileKind, { bytes: Uint8Array; ms: number }>();
    try {
      const ort = await loadOrt();
      const inputs = await buildInputs(base, meta.sample);
      const plan = rows.map((r) => ({ backend: r.backend, file: r.file }));
      for (let i = 0; i < plan.length; i++) {
        const { backend, file } = plan[i];
        try {
          update(i, { status: "yuklanmoqda", progress: 0, error: undefined });
          let got = files.get(file);
          if (!got) {
            const t0 = performance.now();
            const bytes = await download(`${base}/${meta.files[file]!.name}`, (p) => update(i, { progress: p }));
            got = { bytes, ms: performance.now() - t0 };
            files.set(file, got);
          }
          update(i, { status: "tayyorlanmoqda", downloadMs: got.ms });
          const t1 = performance.now();
          const session = await ort.InferenceSession.create(got.bytes, {
            executionProviders: [backend],
            graphOptimizationLevel: "all",
          });
          const initMs = performance.now() - t1;
          const feeds = {
            person: new ort.Tensor("float32", inputs.person, [1, 3, H, W]),
            clothes: new ort.Tensor("float32", inputs.clothes, [1, 3, H, W]),
            edge: new ort.Tensor("float32", inputs.edge, [1, 1, H, W]),
          };
          update(i, { status: "o'lchanmoqda", initMs });
          const t2 = performance.now();
          let out = await session.run(feeds);
          const firstMs = performance.now() - t2;
          const times: number[] = [];
          const budgetStart = performance.now();
          while (times.length < WARMUP_MAX_RUNS && performance.now() - budgetStart < TIMED_BUDGET_MS) {
            const t = performance.now();
            out = await session.run(feeds);
            times.push(performance.now() - t);
          }
          await session.release();
          const sorted = [...times].sort((a, b) => a - b);
          const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
          const p50Ms = sorted[Math.floor(sorted.length / 2)];
          const rgba = toRgba(out.tryon.data);
          const diff = inputs.reference ? meanDiff(rgba, inputs.reference) : null;
          const ctx = outRef.current?.getContext("2d");
          ctx?.putImageData(new ImageData(new Uint8ClampedArray(rgba), W, H), 0, 0);
          update(i, { status: "tayyor", firstMs, avgMs, p50Ms, runs: times.length, diff });
          await fetch("/api/oyna-sinov", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model, file, backend, threads: backend === "wasm" ? env.threads : 1,
              downloadMs: got.ms, initMs, firstMs, avgMs, p50Ms, runs: times.length, diff,
              gpu: backend === "webgpu" ? env.gpu : null,
            }),
          }).catch(() => null);
        } catch (e) {
          update(i, { status: "xato", error: e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e) });
        }
      }
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      refreshShared();
    }
  }, [base, env, meta, model, refreshShared, rows]);

  const best = rows.filter((r) => r.avgMs).sort((a, b) => a.avgMs! - b.avgMs!)[0];
  const bestVerdict = best ? verdict(1000 / best.avgMs!) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="eyebrow">2-bosqich sinovi</p>
        <h1 className="font-display text-3xl font-extrabold text-brand">Telefonda model sinovi</h1>
        <p className="mt-2 text-muted">
          Jonli oyna modeli shu telefonning o&apos;zida, kompyutersiz ishlay oladimi? Sinov modelni bir marta yuklaydi
          (Wi-Fi tavsiya etiladi) va bir daqiqacha davom etadi. Natija (telefon modeli va tezlik) serverga yuboriladi;
          rasm yoki kamera ishlatilmaydi.
        </p>
      </div>

      <div className="card grid gap-2 p-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted">WebGPU: </span>
          {env ? (env.webgpu ? <b className="text-success">bor{env.gpu ? ` (${env.gpu})` : ""}</b> : <b className="text-warning">yo&apos;q</b>) : "…"}
        </div>
        <div>
          <span className="text-muted">Protsessor oqimlari: </span>
          <b>{env ? `${env.threads}${env.isolated ? "" : " (izolyatsiya yo'q)"}` : "…"}</b>
        </div>
        <div>
          <span className="text-muted">Model: </span>
          <b>{model}</b>
          {meta ? ` · ${meta.view} · ${meta.weights}` : ""}
        </div>
        <div>
          <span className="text-muted">Hajm: </span>
          <b>{meta ? `fp32 ${mb(meta.files.fp32?.bytes)}${meta.files.fp16 ? `, fp16 ${mb(meta.files.fp16.bytes)}` : ""}` : "…"}</b>
        </div>
      </div>

      {metaError && (
        <div className="card p-4 text-sm">
          <b className="text-danger">{metaError}.</b> Kompyuterda: <code>tryon-local\.venv\Scripts\python export_onnx.py</code>{" "}
          (namuna bilan: <code>--namuna odam.jpg kiyim.jpg</code>), keyin sahifani yangilang.
        </div>
      )}

      {meta && (
        <button className="btn btn-primary btn-lg self-start" disabled={running || rows.length === 0} onClick={start}>
          {running ? "Sinov ketmoqda…" : rows.some((r) => r.status === "tayyor") ? "Qayta sinash" : "Sinovni boshlash"}
        </button>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2">Rejim</th>
                <th className="px-3 py-2">Holat</th>
                <th className="px-3 py-2">Yuklash, s</th>
                <th className="px-3 py-2">Tayyorlash, s</th>
                <th className="px-3 py-2">1-kadr, ms</th>
                <th className="px-3 py-2">O&apos;rtacha, ms</th>
                <th className="px-3 py-2">Kadr/s</th>
                {meta?.sample && <th className="px-3 py-2">Farq</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.backend}-${r.file}`} className="border-t border-line">
                  <td className="px-3 py-2 font-bold">
                    {r.backend === "webgpu" ? "WebGPU" : "Protsessor"} · {r.file}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "xato" ? (
                      <span className="text-danger" title={r.error}>xato: {r.error}</span>
                    ) : r.status === "yuklanmoqda" && r.progress !== undefined ? (
                      `yuklanmoqda ${Math.round(r.progress * 100)}%`
                    ) : (
                      r.status
                    )}
                  </td>
                  <td className="px-3 py-2">{fmt(r.downloadMs && r.downloadMs / 1000, 1)}</td>
                  <td className="px-3 py-2">{fmt(r.initMs && r.initMs / 1000, 1)}</td>
                  <td className="px-3 py-2">{fmt(r.firstMs)}</td>
                  <td className="px-3 py-2 font-bold">{fmt(r.avgMs)}</td>
                  <td className="px-3 py-2 font-bold">{r.avgMs ? (1000 / r.avgMs).toFixed(1) : "–"}</td>
                  {meta?.sample && <td className="px-3 py-2">{r.diff == null ? "–" : r.diff.toFixed(1)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bestVerdict && (
        <p className={`badge ${bestVerdict.tone} self-start px-3 py-2 text-sm`}>
          Eng tezi: {best!.backend === "webgpu" ? "WebGPU" : "protsessor"} {best!.file}, {(1000 / best!.avgMs!).toFixed(1)} kadr/s.{" "}
          {bestVerdict.text}
        </p>
      )}
      <p className="text-xs text-muted">
        Faqat model o&apos;lchanadi. Haqiqiy oynada kamera tahlili (poza va niqob) ham telefonda ishlaydi, shuning uchun
        kadr/s biroz past bo&apos;ladi. &quot;Farq&quot;: kompyuterdagi natijadan o&apos;rtacha og&apos;ish (0..255), 2 dan kichigi
        ko&apos;zga ko&apos;rinmaydi.
      </p>

      <div className={meta?.sample ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "hidden"}>
        {meta?.sample &&
          (["odam", "kiyim", "natija"] as const).map((n) => (
            <figure key={n} className="card p-2 text-center text-xs text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${base}/namuna_${n}.png`} alt={n} width={W} height={H} className="mx-auto w-full" />
              <figcaption className="mt-1">{n === "natija" ? "kompyuterda (PyTorch)" : n}</figcaption>
            </figure>
          ))}
        <figure className="card p-2 text-center text-xs text-muted">
          <canvas ref={outRef} width={W} height={H} className="mx-auto w-full" />
          <figcaption className="mt-1">shu telefonda</figcaption>
        </figure>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-extrabold text-brand">Boshqa telefonlar</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-muted">Hali natija yo&apos;q.</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2">Telefon</th>
                  <th className="px-3 py-2">Rejim</th>
                  <th className="px-3 py-2">Kadr/s</th>
                  <th className="px-3 py-2">ms</th>
                  <th className="px-3 py-2">GPU</th>
                  <th className="px-3 py-2">Model</th>
                </tr>
              </thead>
              <tbody>
                {shared.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-3 py-2">{s.device}</td>
                    <td className="px-3 py-2">{s.backend === "webgpu" ? "WebGPU" : "Protsessor"} · {s.file}</td>
                    <td className="px-3 py-2 font-bold">{s.fps.toFixed(1)}</td>
                    <td className="px-3 py-2">{s.avgMs.toFixed(0)}</td>
                    <td className="px-3 py-2 text-muted">{s.gpu ?? "–"}</td>
                    <td className="px-3 py-2 text-muted">{s.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
