"""
SI Stilist uchun lokal virtual kiyintirish serveri (CatVTON, niqobsiz versiya).

Xaridor surati faqat xotirada qayta ishlanadi: diskka yozilmaydi va internetga chiqmaydi.
Model og'irliklari birinchi ishga tushishda Hugging Face'dan yuklanadi (~4 GB), keyin keshdan olinadi.

Ishga tushirish:
    python server.py                      # standart: --preset orta (768x576, 30 qadam), bf16, port 8001
    python server.py --preset sifat       # 1024x768, 40 qadam (sekinroq, ko'proq GPU xotira)
    python server.py --preset tez         # 768x576, 20 qadam (tezroq)
    python server.py --height 640 --width 480   # GPU xotirasi yetmasa
    python server.py --mock               # modelsiz sinov rejimi (GPU kerak emas)

CatVTON: https://github.com/Zheng-Chong/CatVTON (CC BY-NC-SA 4.0, faqat notijorat foydalanish).
"""

from __future__ import annotations

import argparse
import base64
import io
import os
import sys
import threading
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
CATVTON_DIR = HERE / "CatVTON"
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# tez: demo uchun eng tez; orta: 6 GB GPU uchun muvozanat; sifat: model o'qitilgan o'lcham (GPU xotirasi ko'proq kerak)
PRESETS = {
    "tez": {"height": 768, "width": 576, "steps": 20},
    "orta": {"height": 768, "width": 576, "steps": 30},
    "sifat": {"height": 1024, "width": 768, "steps": 40},
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="SI Stilist lokal kiyintirish serveri")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8001)
    # Tayyor rejimlar (6 GB GPU uchun "orta" xavfsiz). --height/--width/--steps aniq berilsa, ular ustun
    p.add_argument("--preset", choices=list(PRESETS), default="orta", help="tez | orta | sifat")
    p.add_argument("--height", type=int, default=None)
    p.add_argument("--width", type=int, default=None)
    p.add_argument("--steps", type=int, default=None, help="Ko'proq qadam: sifatliroq, lekin sekinroq (20-50)")
    p.add_argument("--precision", choices=["bf16", "fp16", "fp32"], default="bf16")
    p.add_argument("--device", default="cuda")
    p.add_argument("--safety", action="store_true", help="NSFW filtrini yoqish (+~1 GB GPU xotira)")
    p.add_argument("--base-model", default="timbrooks/instruct-pix2pix")
    p.add_argument("--weights", default="zhengchong/CatVTON-MaskFree")
    p.add_argument("--mock", action="store_true", help="Modelsiz sinov rejimi: kiyimni surat ustiga qo'yadi")
    a = p.parse_args()
    preset = PRESETS[a.preset]
    a.height = a.height or preset["height"]
    a.width = a.width or preset["width"]
    a.steps = a.steps or preset["steps"]
    return a


class Engine:
    """Modelni fonda yuklaydi va so'rovlarni navbat bilan (bitta GPU) bajaradi."""

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.status = "loading"
        self.error: str | None = None
        self.device = args.device
        self.lock = threading.Lock()
        self.pipeline = None
        self._torch = None
        self._resize_and_crop = None
        self._resize_and_padding = None

    def load(self) -> None:
        if self.args.mock:
            self.status, self.device = "ready", "mock"
            return
        try:
            if not CATVTON_DIR.exists():
                raise RuntimeError("CatVTON papkasi topilmadi. Avval setup.bat ni ishga tushiring.")
            sys.path.insert(0, str(CATVTON_DIR))
            import torch
            from huggingface_hub import snapshot_download
            from model.pipeline import CatVTONPix2PixPipeline
            from utils import resize_and_crop, resize_and_padding

            if self.device == "cuda" and not torch.cuda.is_available():
                raise RuntimeError("CUDA topilmadi: NVIDIA drayveri va CUDA'li PyTorch o'rnatilganini tekshiring.")

            print("[model] og'irliklar yuklanmoqda (birinchi marta ~4 GB)...", flush=True)
            repo = snapshot_download(repo_id=self.args.weights)
            version = find_attention_version(Path(repo))
            dtype = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[self.args.precision]
            t0 = time.time()
            self.pipeline = CatVTONPix2PixPipeline(
                base_ckpt=self.args.base_model,
                attn_ckpt=repo,
                attn_ckpt_version=version,
                weight_dtype=dtype,
                device=self.device,
                skip_safety_check=not self.args.safety,
                use_tf32=True,
            )
            self._torch = torch
            self._resize_and_crop = resize_and_crop
            self._resize_and_padding = resize_and_padding
            self.status = "ready"
            print(f"[model] tayyor ({time.time() - t0:.0f} s), {self.args.height}x{self.args.width}", flush=True)
        except Exception as e:  # noqa: BLE001 - holat /health orqali ko'rsatiladi
            self.status, self.error = "error", str(e)
            print(f"[model] XATO: {e}", flush=True)

    def run(self, person: Image.Image, garment: Image.Image, steps: int, seed: int) -> Image.Image:
        size = (self.args.width, self.args.height)
        if self.args.mock:
            time.sleep(1)
            out = person.convert("RGB").resize(size)
            g = garment.convert("RGB").resize((size[0] // 2, size[1] // 2))
            out.paste(g, (size[0] // 4, size[1] // 5))
            return out

        torch = self._torch
        with self.lock:
            person = self._resize_and_crop(person, size)
            garment = self._resize_and_padding(garment, size)
            generator = torch.Generator(device=self.device).manual_seed(seed)
            try:
                result = self.pipeline(
                    image=person,
                    condition_image=garment,
                    num_inference_steps=steps,
                    guidance_scale=2.5,
                    height=self.args.height,
                    width=self.args.width,
                    generator=generator,
                )[0]
            finally:
                if self.device == "cuda":
                    torch.cuda.empty_cache()
        return result


def find_attention_version(repo: Path) -> str:
    """Og'irliklar ichidagi `attention` papkasini topadi (repo tuzilishi o'zgarsa ham ishlaydi)."""
    candidates = []
    for root, dirs, _ in os.walk(repo):
        for d in dirs:
            if d == "attention":
                path = Path(root) / d
                if any(f.suffix in {".safetensors", ".bin"} for f in path.iterdir()):
                    candidates.append(Path(root))
    if not candidates:
        raise RuntimeError(f"{repo} ichida attention og'irliklari topilmadi")
    # 1024 o'lchamda o'qitilgan versiya afzal
    candidates.sort(key=lambda p: ("1024" not in str(p), len(str(p))))
    rel = os.path.relpath(candidates[0], repo)
    print(f"[model] attention: {rel}", flush=True)
    return rel


def decode_image(data: str) -> Image.Image:
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "Rasm base64 formatida emas") from e
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Rasm 8 MB dan katta")
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "Rasmni ochib bo'lmadi") from e


class TryOnRequest(BaseModel):
    person: str
    garment: str
    category: str = "tops"
    steps: int | None = None
    seed: int = 42


args = parse_args()
engine = Engine(args)
app = FastAPI(title="SI Stilist lokal kiyintirish")


@app.get("/health")
def health():
    return {
        "status": engine.status,
        "error": engine.error,
        "device": engine.device,
        "resolution": f"{args.height}x{args.width}",
        "steps": args.steps,
        "preset": args.preset,
    }


@app.post("/tryon")
def tryon(req: TryOnRequest):
    if engine.status == "loading":
        raise HTTPException(503, "Model hali yuklanmoqda")
    if engine.status == "error":
        raise HTTPException(500, f"Model yuklanmadi: {engine.error}")

    person, garment = decode_image(req.person), decode_image(req.garment)
    steps = max(10, min(50, req.steps or args.steps))
    t0 = time.time()
    try:
        result = engine.run(person, garment, steps, req.seed)
    except Exception as e:  # noqa: BLE001
        if "out of memory" in str(e).lower():
            raise HTTPException(
                507, "GPU xotirasi yetmadi: serverni --height 640 --width 480 bilan qayta ishga tushiring"
            ) from e
        raise HTTPException(500, f"Kiyintirishda xato: {e}") from e

    buf = io.BytesIO()
    result.save(buf, format="JPEG", quality=90)
    print(f"[tryon] {req.category}, {steps} qadam, {time.time() - t0:.1f} s", flush=True)
    return {"image": base64.b64encode(buf.getvalue()).decode(), "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    threading.Thread(target=engine.load, daemon=True).start()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
