"""
Jonli oyna yuk sinovi: bir vaqtda N ta "xaridor" lokal serverga kadr yuborsa, har biriga sekundiga necha kadr
yetib boradi va kechikish qancha. Sayt orqali emas, to'g'ridan-to'g'ri lokal serverga (127.0.0.1:8001): faqat
kompyuterning (GPU + protsessor) sig'imi o'lchanadi.

    python yuk_sinovi.py --rasm odam.jpg                    # 1, 2, 4, 6, 8 kishi, har biri 15 s
    python yuk_sinovi.py --video yurish.mp4 --odamlar 1,3,6 # videodan kadrlar (harakat bilan, haqiqiyroq)
    python yuk_sinovi.py --rasm odam.jpg --kenglik 400      # internet orqali (sistilist.uz) kadr o'lchami

Har "xaridor" saytdagi jonli oynadek ishlaydi: bir vaqtda 2 ta kadr yo'lda (IN_FLIGHT), javob kelishi bilan
keyingisi. Rasm berilsa, har kadr biroz suriladi (qimirlash), aks holda server keshlari haqiqatdan tez ko'rinadi.
Sinov paytida server (start.bat) ishlab turishi kerak; boshqa foydalanuvchilar bo'lmasin.
"""

from __future__ import annotations

import argparse
import base64
import http.client
import io
import json
import statistics
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
GARMENT_ID = "yuk-sinovi"


def load_frames(args: argparse.Namespace) -> list[bytes]:
    """JPEG kadrlar ro'yxati (saytdagidek: kenglik --kenglik, sifat 0.8)"""
    images: list[Image.Image] = []
    if args.video:
        import cv2

        cap = cv2.VideoCapture(str(args.video))
        while len(images) < 300:
            ok, bgr = cap.read()
            if not ok:
                break
            images.append(Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
        cap.release()
        if not images:
            raise SystemExit(f"Videodan kadr o'qib bo'lmadi: {args.video}")
    else:
        base = Image.open(args.rasm).convert("RGB")
        rng = np.random.default_rng(0)
        for _ in range(60):
            # Kichik siljish: odam joyida qimirlagandek (optik oqim va silliqlash haqiqiy ishlaydi)
            dx, dy = (int(v) for v in rng.integers(-6, 7, 2))
            images.append(base.transform(base.size, Image.AFFINE, (1, 0, dx, 0, 1, dy), fillcolor=(235, 235, 235)))
    frames = []
    for img in images:
        if img.width > args.kenglik:
            img = img.resize((args.kenglik, round(img.height * args.kenglik / img.width)), Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        frames.append(buf.getvalue())
    return frames


def post(conn: http.client.HTTPConnection, path: str, body: bytes, ctype: str) -> tuple[int, bytes, dict]:
    conn.request("POST", path, body=body, headers={"Content-Type": ctype})
    res = conn.getresponse()
    data = res.read()
    return res.status, data, dict(res.getheaders())


BATCH_TITLE = "to'plam"
GARMENT_LOCK = threading.Lock()
GARMENT_SENT = [0.0]


def get_health(url: str) -> dict | None:
    u = urlparse(url)
    try:
        conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=5)
        conn.request("GET", "/health")
        return json.loads(conn.getresponse().read())
    except Exception:  # noqa: BLE001
        return None


def resend_garment(url: str, garment: Path) -> None:
    """404: server qayta ishga tushgan va kiyim xotirasi tozalangan. Bir necha oqim bir vaqtda yubormasin"""
    with GARMENT_LOCK:
        if time.time() - GARMENT_SENT[0] < 3:
            return
        try:
            send_garment(url, garment)
        except SystemExit:
            pass
        GARMENT_SENT[0] = time.time()


def send_garment(url: str, garment: Path) -> None:
    u = urlparse(url)
    conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=60)
    image = "data:image/jpeg;base64," + base64.b64encode(garment.read_bytes()).decode()
    status, data, _ = post(conn, "/mirror/garment", json.dumps({"id": GARMENT_ID, "image": image}).encode(),
                           "application/json")
    if status != 200:
        raise SystemExit(f"Kiyimni yuborib bo'lmadi ({status}): {data[:200].decode(errors='replace')}")


class User:
    """Bitta xaridor: IN_FLIGHT ta oqim bitta seans bilan navbatma-navbat kadr yuboradi"""

    def __init__(self, url: str, frames: list[bytes], in_flight: int, deadline: float, offset: int, garment: Path):
        self.raw_url = url
        self.garment = garment
        self.url = urlparse(url)
        self.frames = frames
        self.sid = uuid.uuid4().hex[:12]
        self.deadline = deadline
        self.next = offset
        self.lock = threading.Lock()
        self.ok = 0
        self.latency: list[float] = []
        self.server_ms: list[float] = []
        self.gpu_ms: list[float] = []
        self.batch: list[int] = []
        self.errors: dict[str, int] = {}
        self.threads = [threading.Thread(target=self.loop, daemon=True) for _ in range(in_flight)]

    def frame(self) -> bytes:
        with self.lock:
            self.next += 1
            return self.frames[self.next % len(self.frames)]

    def loop(self) -> None:
        conn = http.client.HTTPConnection(self.url.hostname, self.url.port or 80, timeout=30)
        path = f"/mirror?id={GARMENT_ID}&s={self.sid}"
        while time.perf_counter() < self.deadline:
            t0 = time.perf_counter()
            try:
                status, _, headers = post(conn, path, self.frame(), "image/jpeg")
            except Exception as e:  # noqa: BLE001 - ulanish uzilsa qayta ochiladi
                with self.lock:
                    self.errors[type(e).__name__] = self.errors.get(type(e).__name__, 0) + 1
                conn.close()
                conn = http.client.HTTPConnection(self.url.hostname, self.url.port or 80, timeout=30)
                time.sleep(0.2)
                continue
            dt = (time.perf_counter() - t0) * 1000
            with self.lock:
                if status == 200:
                    self.ok += 1
                    self.latency.append(dt)
                    h = {k.lower(): v for k, v in headers.items()}
                    if h.get("x-mirror-ms"):
                        self.server_ms.append(float(h["x-mirror-ms"]))
                    if h.get("x-mirror-gpu-ms"):
                        self.gpu_ms.append(float(h["x-mirror-gpu-ms"]))
                        self.batch.append(int(h.get("x-mirror-batch") or 1))
                else:
                    self.errors[str(status)] = self.errors.get(str(status), 0) + 1
            if status == 404:
                resend_garment(self.raw_url, self.garment)
            if status != 200:
                time.sleep(0.2)
        conn.close()


def run_level(url: str, frames: list[bytes], users: int, seconds: float, in_flight: int, warmup: float,
              garment: Path) -> dict:
    # Isinish: niqob va keshlar tayyor bo'lsin (birinchi kadrlar sekinroq), keyin o'lchov
    start = time.perf_counter() + warmup
    deadline = start + seconds
    group = [User(url, frames, in_flight, deadline, i * 7, garment) for i in range(users)]
    for u in group:
        for t in u.threads:
            t.start()
    time.sleep(warmup)
    for u in group:  # isinishdagi natijalar hisobga olinmaydi
        with u.lock:
            u.ok, u.latency, u.server_ms, u.errors, u.gpu_ms, u.batch = 0, [], [], {}, [], []
    for u in group:
        for t in u.threads:
            t.join()
    fps = [u.ok / seconds for u in group]
    lat = sorted(x for u in group for x in u.latency)
    srv = [x for u in group for x in u.server_ms]
    gpu = [x for u in group for x in u.gpu_ms]
    bat = [x for u in group for x in u.batch]
    errors: dict[str, int] = {}
    for u in group:
        for k, v in u.errors.items():
            errors[k] = errors.get(k, 0) + v
    pct = lambda p: lat[min(len(lat) - 1, int(p * len(lat)))] if lat else float("nan")  # noqa: E731
    return {
        "users": users,
        "fps_avg": statistics.mean(fps),
        "fps_min": min(fps),
        "total_fps": sum(fps),
        "lat_p50": pct(0.5),
        "lat_p95": pct(0.95),
        "server_ms": statistics.mean(srv) if srv else float("nan"),
        "gpu_ms": statistics.mean(gpu) if gpu else float("nan"),
        "batch": statistics.mean(bat) if bat else float("nan"),
        "errors": errors,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--rasm", type=Path, help="odam surati (beligacha yoki to'liq, old tomondan)")
    src.add_argument("--video", type=Path, help="odam videosi (mp4)")
    p.add_argument("--kiyim", type=Path, default=ROOT.parent / "public" / "products" / "ft-01.jpg")
    p.add_argument("--url", default="http://127.0.0.1:8001")
    p.add_argument("--odamlar", default="1,2,4,6,8", help="vergul bilan: bir vaqtdagi xaridorlar soni")
    p.add_argument("--soniya", type=float, default=15)
    p.add_argument("--isinish", type=float, default=4)
    p.add_argument("--in-flight", type=int, default=2, help="har xaridorda bir vaqtda yo'ldagi kadrlar (sayt: 2)")
    p.add_argument("--kenglik", type=int, default=640, help="kadr kengligi: 640 lokal tarmoq, 400 internet")
    p.add_argument("--json", type=Path, help="natijalarni faylga ham yozish")
    args = p.parse_args()

    frames = load_frames(args)
    health = get_health(args.url)
    if health is None:
        raise SystemExit(f"Server javob bermayapti ({args.url}): avval start.bat yoki run-local.bat")
    if health.get("mirror") != "ready":
        raise SystemExit(f"Jonli oyna tayyor emas: {health.get('mirror')} {health.get('mirror_error') or ''}")
    mem = health.get("gpu_memory") or {}
    print(f"Server: versiya {health.get('version')}, qurilma {health.get('device')}, "
          f"{'faqat oyna' if health.get('mirror_only') else 'oyna + rasmli kiyintirish'}"
          + (f", GPU xotirasi {mem['used_mb']}/{mem['total_mb']} MB band" if mem else ""))
    if (health.get("version") or 0) < 10:
        print("DIQQAT: server eski (git pull dan keyin server oynasini yopib, qayta ishga tushiring)")
    send_garment(args.url, args.kiyim)
    GARMENT_SENT[0] = time.time()
    levels = [int(x) for x in args.odamlar.split(",") if x.strip()]
    print(f"Kadrlar: {len(frames)} ta, {args.kenglik} px, ~{sum(map(len, frames)) // len(frames) // 1024} KB. "
          f"Har daraja {args.soniya:.0f} s (+{args.isinish:.0f} s isinish)\n")
    print(f"{'kishi':>5} | {'har biriga kadr/s':>17} | {'eng kami':>8} | {'jami kadr/s':>11} | "
          f"{'kechikish p50/p95, ms':>21} | {'server, ms':>10} | {'GPU, ms':>7} | {BATCH_TITLE:>7} | xatolar")
    results = []
    for n in levels:
        r = run_level(args.url, frames, n, args.soniya, args.in_flight, args.isinish, args.kiyim)
        results.append(r)
        errors = ", ".join(f"{k}: {v}" for k, v in r["errors"].items()) or "-"
        print(f"{n:>5} | {r['fps_avg']:>17.1f} | {r['fps_min']:>8.1f} | {r['total_fps']:>11.1f} | "
              f"{r['lat_p50']:>9.0f} / {r['lat_p95']:<9.0f} | {r['server_ms']:>10.0f} | {r['gpu_ms']:>7.0f} | "
              f"{r['batch']:>7.1f} | {errors}", flush=True)
        if get_health(args.url) is None or "ConnectionRefusedError" in r["errors"]:
            print("\nSERVER TO'XTADI (qulab tushdi). Keyingi darajalar o'tkazib yuborildi. Server oynasidagi oxirgi "
                  "xato yozuvini (Traceback yoki 'Fatal Python error') rasmga olib yuboring.")
            break

    # Silliq oyna uchun har kishiga kamida ~6 kadr/s kerak (saytdagi internet rejimi 8 kadr/s bilan cheklangan)
    good = [r["users"] for r in results if r["fps_min"] >= 6]
    print()
    if good:
        print(f"Xulosa: bir vaqtda {max(good)} kishigacha har biriga kamida 6 kadr/s (sinalgan darajalar ichida).")
    else:
        print("Xulosa: sinalgan darajalarning hech birida har kishiga 6 kadr/s chiqmadi.")
    if args.json:
        args.json.write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
