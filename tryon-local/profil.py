"""
Jonli oyna kadrining har bir bosqichi qancha vaqt olishini o'lchaydi (server to'xtatilgan holda, bitta oqimda):
MediaPipe tahlili, GPU (to'plam 1/2/4/8), kompozitsiya qismlari, JPEG. Oxirida protsessor oqimlari sonini cheklab
qayta o'lchaydi: Windows'da OpenCV, MediaPipe va PyTorch har biri ko'p oqim ochib, bir-biriga xalaqit berishi mumkin.

    python profil.py --rasm odam.jpg
"""

from __future__ import annotations

import argparse
import cProfile
import io
import os
import pstats
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402


def timeit(fn, n: int, sync=None) -> float:
    fn()
    if sync:
        sync()
    t0 = time.perf_counter()
    for _ in range(n):
        fn()
    if sync:
        sync()
    return (time.perf_counter() - t0) / n * 1000


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rasm", type=Path, required=True)
    p.add_argument("--kiyim", type=Path, default=ROOT.parent / "public" / "products" / "ft-01.jpg")
    p.add_argument("--kenglik", type=int, default=640)
    p.add_argument("--device", default="cuda")
    args = p.parse_args()

    import torch

    from masker import ClothMasker
    from mirror import MirrorEngine, compose_frame, prepare_analysis

    print(f"Protsessor: {os.cpu_count()} mantiqiy yadro; OpenCV oqimlari {cv2.getNumThreads()}, "
          f"PyTorch oqimlari {torch.get_num_threads()}")
    if args.device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    sync = torch.cuda.synchronize if args.device == "cuda" else None

    frame = Image.open(args.rasm).convert("RGB")
    if frame.width > args.kenglik:
        frame = frame.resize((args.kenglik, round(frame.height * args.kenglik / frame.width)), Image.BILINEAR)
    buf = io.BytesIO()
    frame.save(buf, "JPEG", quality=80)
    jpeg = buf.getvalue()

    masker = ClothMasker(ROOT / "models")
    engine = MirrorEngine(ROOT / "KiseKloset", ROOT / "models", args.device)
    engine.set_garment("g", Image.open(args.kiyim))

    rows: list[tuple[str, float]] = []
    rows.append(("JPEG ochish (640 px)", timeit(lambda: Image.open(io.BytesIO(jpeg)).convert("RGB"), 20)))
    rows.append(("MediaPipe tahlili (niqob + poza)", timeit(lambda: masker.analyze(frame, "tops"), 5)))
    mask, _, background, _ = masker.analyze(frame, "tops")
    analysis = prepare_analysis(frame.size, mask, background, masker.last_landmarks.copy(), frame=np.asarray(frame))
    x0, y0, x1, y1 = analysis["box"]
    out_size = (min(576, x1 - x0), min(768, y1 - y0))
    person = np.full((256, 192, 3), 200, np.uint8)
    for n in (1, 2, 4, 8):
        items = [(person, "g", None, "old", True)] * n
        rows.append((f"GPU: model, to'plam {n} (faqat 192x256)", timeit(lambda: engine.run_batch(items), 10, sync)))
    rows.append((f"GPU: model + tiniq natija {out_size[0]}x{out_size[1]}",
                 timeit(lambda: engine.run_batch([(person, "g", out_size, "old", True)]), 10, sync)))

    infer = lambda pr, size: engine.run(pr, "g", size, "old", with_cover=True)  # noqa: E731
    state: dict = {}
    compose = lambda: compose_frame(frame, {**analysis, "garment": "g"}, infer, state)  # noqa: E731
    total = timeit(compose, 20, sync)
    rows.append(("Kompozitsiya (GPU bilan, butun kadr)", total))
    result = compose()
    rows.append(("JPEG kodlash", timeit(lambda: cv2.imencode(".jpg", cv2.cvtColor(result, cv2.COLOR_RGB2BGR),
                                                            [cv2.IMWRITE_JPEG_QUALITY, 85]), 20)))

    print("\nBosqich                                         ms")
    for name, ms in rows:
        print(f"  {name:<44} {ms:>6.1f}")

    # Kompozitsiya ichida eng ko'p vaqt olgan funksiyalar
    pr = cProfile.Profile()
    pr.enable()
    for _ in range(10):
        compose()
    if sync:
        sync()
    pr.disable()
    out = io.StringIO()
    pstats.Stats(pr, stream=out).sort_stats("tottime").print_stats(10)
    print("\nKompozitsiya ichida (10 kadr, eng og'irlari):")
    print("\n".join(line for line in out.getvalue().splitlines() if line.strip() and not line.startswith(("   Ordered", "         "))
                    )[-1600:])

    # Korrelyatsiya usuli va cuDNN avto-tanlovi: qaysi birikma shu GPU'da tezroq (mirror.correlation standarti:
    # 1 kadrda conv, 2+ da slices, avto-tanlov o'chiq)
    import mirror

    print("\nKorrelyatsiya usullari, GPU ms (to'plam 1 / 2 / 4 / 8):")
    for bench in (False, True):
        torch.backends.cudnn.benchmark = bench
        for mode in ("conv", "slices"):
            mirror.CORRELATION_MODE = mode
            ms = [timeit(lambda: engine.run_batch([(person, "g", None, "old", True)] * n), 10, sync) for n in (1, 2, 4, 8)]
            label = f"{mode}{', avto-tanlov' if bench else ''}"
            print(f"  {label:<24} " + " / ".join(f"{v:6.1f}" for v in ms))
    torch.backends.cudnn.benchmark = False
    mirror.CORRELATION_MODE = None

    # Oqimlarni cheklash: OpenCV va PyTorch bittadan (bir necha xaridor bo'lganda parallellik so'rovlar orqali)
    cv2.setNumThreads(1)
    torch.set_num_threads(1)
    print("\nOqimlar cheklanganda (OpenCV 1, PyTorch 1):")
    print(f"  {'MediaPipe tahlili':<44} {timeit(lambda: masker.analyze(frame, 'tops'), 5):>6.1f}")
    print(f"  {'Kompozitsiya (GPU bilan)':<44} {timeit(compose, 20, sync):>6.1f}")


if __name__ == "__main__":
    main()
