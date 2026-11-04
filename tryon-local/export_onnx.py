"""
Jonli oyna modelini (DM-VTON: AFWM + generator) telefonda ishlatish uchun bitta ONNX fayliga o'tkazish.

    python export_onnx.py                      # models/dmvton dagi og'irliklar (o'qitilgan old_* bo'lsa o'shalar)
    python export_onnx.py --view orqa          # orqa ko'rinish modeli (bo'lsa)
    python export_onnx.py --namuna odam.jpg kiyim.jpg   # + brauzerda solishtirish uchun namuna kirish/natija
    python export_onnx.py --random             # og'irliksiz (faqat zanjirni sinash uchun)

Natija: models/web/mirror/<nom>/ (standart nom: sinov)
    model.onnx       fp32
    model.fp16.onnx  og'irliklar fp16 (hajmi ~2 barobar kichik, telefonda WebGPU uchun)
    meta.json        kirish/chiqish tavsifi, hajm, PyTorch bilan farq
    namuna_*.png     (--namuna) odam kesimi, kiyim, kontur va PyTorch natijasi

Sayt bu papkani /models/mirror/<nom>/... manzilida beradi (src/app/models/[...path]/route.ts), sinov sahifasi:
/oyna/sinov. Model kirishlari serverdagi MirrorEngine.run bilan aynan bir xil (192x256, [-1, 1]).
"""

from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from mirror import SIZE, _find_weights, garment_inputs, load_model_modules, load_state  # noqa: E402

W, H = SIZE
OPSET = 17  # GridSample (16+) kerak; onnxruntime-web WebGPU 17 ni yaxshi biladi


def conv_correlation(first, second, intStride: int = 1):
    """
    mirror.correlation bilan aynan bir xil natija (sinovda farq < 1e-7), lekin ONNX grafida 49 x 3 mayda amal o'rniga
    bitta Conv: 49 ta bir-nuqtali 7x7 yadro ikkinchi xaritaning 49 siljishini birdan chiqaradi. Protsessorda tezlik
    deyarli bir xil, telefon GPU'sida esa har bir amal alohida chaqiruv: 5 qatlamda ~750 ta o'rniga ~15 ta.
    """
    import torch
    import torch.nn.functional as F

    assert intStride == 1, "DM-VTON faqat intStride=1 ishlatadi"
    n, c, h, w = first.shape
    eye = torch.eye(49, dtype=first.dtype, device=first.device).reshape(49, 1, 7, 7)
    padded = F.pad(second, (3, 3, 3, 3)).reshape(n * c, 1, h + 6, w + 6)
    shifted = F.conv2d(padded, eye).reshape(n, c, 49, h, w)
    return (shifted * first[:, :, None]).mean(1)


def build_net(view: str, random_weights: bool, fast_corr: bool = True):
    """MirrorEngine.run dagi hisob bitta modulda: (odam, kiyim, kontur) -> (natija, yangi kontur, egish xaritasi)"""
    import torch
    import torch.nn.functional as F

    AFWM, Generator = load_model_modules(ROOT / "KiseKloset")
    if fast_corr:
        # Model korrelyatsiyani har chaqiruvda modul orqali oladi (afwm_test.py): eksport uchun almashtiriladi
        sys.modules["dmvton_models.correlation.correlation"].FunctionCorrelation = (
            lambda tenFirst, tenSecond, intStride=1: conv_correlation(tenFirst, tenSecond, intStride)
        )
    warp, gen = AFWM(3, True).eval(), Generator(7, 4).eval()
    source = "tasodifiy (og'irliksiz)"
    if not random_weights:
        models = ROOT / "models" / "dmvton"
        wp, gp = models / f"{view}_warp.pt", models / f"{view}_gen.pt"
        if wp.exists() and gp.exists():
            source = f"o'qitilgan {view}_*.pt"
        elif view != "old":
            raise SystemExit(f"{wp.name} topilmadi: {view} ko'rinishi hali o'qitilmagan")
        else:
            found = _find_weights(models)
            if len(found) < 2:
                raise SystemExit("models/dmvton da og'irliklar yo'q: avval start.bat (yoki setup.bat) ni ishga tushiring")
            wp, gp = found["warp"], found["gen"]
            source = f"asl {wp.name}"
        load_state(warp, wp)
        load_state(gen, gp)

    class MirrorNet(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.warp, self.gen = warp, gen

        def forward(self, person, clothes, edge):
            warped_cloth, last_flow = self.warp(person, clothes)
            warped_edge = F.grid_sample(edge, last_flow.permute(0, 2, 3, 1), mode="bilinear",
                                        padding_mode="zeros", align_corners=True)
            out = self.gen(torch.cat([person, warped_cloth, warped_edge], 1))
            rendered, comp = torch.split(out, [3, 1], 1)
            rendered = torch.tanh(rendered)
            comp = torch.sigmoid(comp) * warped_edge
            tryon = warped_cloth * comp + rendered * (1 - comp)
            return tryon, warped_edge, last_flow

    return MirrorNet().eval(), source


def to_tensor(arr: np.ndarray, normalize: bool = True):
    import torch

    t = torch.from_numpy(np.ascontiguousarray(arr)).float()
    t = t.permute(2, 0, 1) / 255.0 if t.ndim == 3 else t[None]
    return (t * 2 - 1 if normalize else t)[None]


def sample_inputs(person_path: Path | None, cloth_path: Path | None):
    """(odam 256x192x3, kiyim 256x192x3, kontur 256x192): namuna fayllardan yoki tasodifiy"""
    if person_path is None:
        rng = np.random.default_rng(0)
        person = rng.integers(0, 256, (H, W, 3), dtype=np.uint8)
        cloth = rng.integers(0, 256, (H, W, 3), dtype=np.uint8)
        edge = np.zeros((H, W), np.float32)
        edge[40:220, 30:160] = 1
        return person, cloth, edge
    # Odam: serverdagidek fon oqlanadi va ko'zdan songacha kesiladi (MediaPipe, masker.py)
    import cv2
    from masker import ClothMasker
    from mirror import crop_white, upper_body_box

    frame = Image.open(person_path).convert("RGB")
    masker = ClothMasker(ROOT / "models")
    _, _, background, _ = masker.analyze(frame, "tops")
    rgb = np.asarray(frame).copy()
    rgb[background] = 255
    box = upper_body_box(masker.last_landmarks.copy(), frame.size)
    person = cv2.resize(crop_white(rgb, box), SIZE, interpolation=cv2.INTER_AREA)
    cloth, edge = garment_inputs(Image.open(cloth_path))
    return person, cloth, edge


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--view", default="old", choices=("old", "yon", "orqa"))
    p.add_argument("--nom", default="sinov", help="papka nomi: models/web/mirror/<nom> (masalan v1)")
    p.add_argument("--namuna", nargs=2, metavar=("ODAM", "KIYIM"), type=Path)
    p.add_argument("--random", action="store_true", help="og'irliksiz (zanjirni sinash uchun)")
    p.add_argument("--fp16-yoq", action="store_true", help="fp16 variantini yaratmaslik")
    p.add_argument("--asl-korrelyatsiya", action="store_true",
                   help="korrelyatsiyani serverdagidek 49 ta alohida amal bilan (sekinroq, solishtirish uchun)")
    args = p.parse_args()

    import torch

    net, source = build_net(args.view, args.random, fast_corr=not args.asl_korrelyatsiya)
    if args.namuna:
        # export.bat tryon-local papkasiga o'tib oladi: nisbiy yo'l buyruq yozilgan papkadan (EXPORT_CWD) hisoblanadi
        base = Path(os.environ.get("EXPORT_CWD") or Path.cwd())
        args.namuna = [p if p.is_absolute() else base / p for p in args.namuna]
        missing = [str(p) for p in args.namuna if not p.is_file()]
        if missing:
            raise SystemExit("Namuna fayli topilmadi: " + ", ".join(missing) + "\n  Masalan: export.bat --namuna "
                             "C:\\Users\\...\\men.jpg public\\products\\ft-01.jpg")
    person, cloth, edge = sample_inputs(*(args.namuna or (None, None)))
    edge_t = to_tensor(edge, normalize=False)
    inputs = (to_tensor(person), to_tensor(cloth) * edge_t, edge_t)

    out_dir = ROOT / "models" / "web" / "mirror" / args.nom
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "model.onnx"
    with torch.no_grad():
        t0 = time.perf_counter()
        ref = net(*inputs)
        torch_ms = (time.perf_counter() - t0) * 1000
        # torch 2.5+ da standart eksportchi o'zgargan: eski (TorchScript) yo'l aniq tanlanadi. 2.4 da bu parametr yo'q
        extra = {"dynamo": False} if "dynamo" in inspect.signature(torch.onnx.export).parameters else {}
        torch.onnx.export(
            net, inputs, str(onnx_path), opset_version=OPSET,
            input_names=["person", "clothes", "edge"], output_names=["tryon", "cover", "flow"], **extra,
        )

    # Tekshiruv: onnxruntime (CPU) natijasi PyTorch bilan bir xilmi
    import onnxruntime as ort

    feeds = {"person": inputs[0].numpy(), "clothes": inputs[1].numpy(), "edge": inputs[2].numpy()}
    # "Could not find a CPU kernel ... constant fold" ogohlantirishlari zararsiz, lekin natija satrlarini yopib qo'yadi
    quiet = ort.SessionOptions()
    quiet.log_severity_level = 3
    sess = ort.InferenceSession(str(onnx_path), quiet, providers=["CPUExecutionProvider"])
    sess.run(None, feeds)
    t0 = time.perf_counter()
    got = sess.run(None, feeds)
    ort_ms = (time.perf_counter() - t0) * 1000
    diffs = {name: float(np.abs(g - r.numpy()).max()) for name, g, r in zip(("tryon", "cover", "flow"), got, ref)}
    print(f"[eksport] {onnx_path} ({onnx_path.stat().st_size / 1e6:.1f} MB), og'irliklar: {source}")
    print(f"[eksport] PyTorch bilan farq (maks): " + ", ".join(f"{k} {v:.2e}" for k, v in diffs.items()))
    print(f"[eksport] protsessorda: PyTorch {torch_ms:.0f} ms, onnxruntime {ort_ms:.0f} ms")

    files = {"fp32": onnx_path.name}
    if not args.fp16_yoq:
        try:
            import onnx

            try:  # onnxruntime ichida bor (alohida paket protobuf'ni qotirib, mediapipe bilan to'qnashishi mumkin)
                from onnxruntime.transformers.float16 import convert_float_to_float16
            except ImportError:
                from onnxconverter_common.float16 import convert_float_to_float16

            half = convert_float_to_float16(onnx.load(str(onnx_path)), keep_io_types=True)
            fp16_path = out_dir / "model.fp16.onnx"
            onnx.save(half, str(fp16_path))
            files["fp16"] = fp16_path.name
            got16 = ort.InferenceSession(str(fp16_path), quiet, providers=["CPUExecutionProvider"]).run(None, feeds)
            diffs["tryon_fp16"] = float(np.abs(got16[0] - ref[0].numpy()).max())
            print(f"[eksport] {fp16_path.name} ({fp16_path.stat().st_size / 1e6:.1f} MB), "
                  f"fp32 bilan farq: {diffs['tryon_fp16']:.2e}")
        except ImportError:
            print("[eksport] fp16 o'tkazilmadi: onnxruntime'da float16 vositasi topilmadi")

    sample = bool(args.namuna)
    if sample:
        def save(name: str, arr: np.ndarray) -> None:
            Image.fromarray(arr).save(out_dir / f"namuna_{name}.png")

        tryon = ((ref[0][0].permute(1, 2, 0).numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)
        save("odam", person)
        save("kiyim", cloth)
        save("kontur", (edge * 255).astype(np.uint8))
        save("natija", tryon)
    for old in out_dir.glob("namuna_*.png") if not sample else []:
        old.unlink()

    meta = {
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "view": args.view,
        "weights": source,
        "size": {"w": W, "h": H},
        "inputs": {
            "person": "1x3x256x192, RGB [-1,1], fon oq, ko'zdan songacha kesim",
            "clothes": "1x3x256x192, RGB [-1,1] * kontur",
            "edge": "1x1x256x192, kiyim konturi 0/1",
        },
        "outputs": {
            "tryon": "1x3x256x192 [-1,1]",
            "cover": "1x1x256x192 egilgan kiyim konturi",
            "flow": "1x2x256x192 egish xaritasi [-1,1]",
        },
        "files": {k: {"name": v, "bytes": (out_dir / v).stat().st_size,
                      "sha256": hashlib.sha256((out_dir / v).read_bytes()).hexdigest()[:16]} for k, v in files.items()},
        "max_diff": diffs,
        "correlation": "asl" if args.asl_korrelyatsiya else "conv",
        "sample": sample,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[eksport] tayyor. Telefonda sinash: https://sistilist.uz/oyna/sinov?nom={args.nom}")


if __name__ == "__main__":
    main()
