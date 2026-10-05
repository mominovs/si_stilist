"""
SI Stilist uchun lokal virtual kiyintirish serveri (CatVTON, niqobsiz versiya).

Xaridor surati faqat xotirada qayta ishlanadi: diskka yozilmaydi va internetga chiqmaydi.
Model og'irliklari birinchi ishga tushishda Hugging Face'dan yuklanadi (~4 GB), keyin keshdan olinadi.

Ishga tushirish:
    python server.py                      # standart: --preset orta (768x576, 40 qadam), bf16, port 8001
    python server.py --preset sifat       # 1024x768, 50 qadam (sekinroq, ko'proq GPU xotira)
    python server.py --preset tez         # 768x576, 20 qadam (tezroq)
    python server.py --height 640 --width 480   # GPU xotirasi yetmasa
    python server.py --mock               # modelsiz sinov rejimi (GPU kerak emas)

CatVTON: https://github.com/Zheng-Chong/CatVTON (CC BY-NC-SA 4.0, faqat notijorat foydalanish).
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Callable

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
CATVTON_DIR = HERE / "CatVTON"
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# tez: demo uchun eng tez; orta: 6 GB GPU uchun muvozanat; sifat: model o'qitilgan o'lcham (GPU xotirasi ko'proq kerak)
PRESETS = {
    "tez": {"height": 768, "width": 576, "steps": 20},
    "orta": {"height": 768, "width": 576, "steps": 40},
    "sifat": {"height": 1024, "width": 768, "steps": 50},
}

# Oraliq ko'rinishlar shu ulushlarda yuboriladi (40 qadamda: 10, 20, 30), oxirida yakuniy natija
PREVIEW_FRACTIONS = (0.25, 0.5, 0.75)

PreviewFn = Callable[[int, Image.Image], None]


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
        self._prepare_image = None
        self._compute_vae_encodings = None
        self._randn_tensor = None

    def load(self) -> None:
        if self.args.mock:
            self.status, self.device = "ready", "mock"
            print(f"[model] mock rejim: preset {self.args.preset}, {self.args.steps} qadam", flush=True)
            return
        try:
            if not CATVTON_DIR.exists():
                raise RuntimeError("CatVTON papkasi topilmadi. Avval setup.bat ni ishga tushiring.")
            sys.path.insert(0, str(CATVTON_DIR))
            import torch
            from huggingface_hub import snapshot_download
            from diffusers.utils.torch_utils import randn_tensor
            from model.pipeline import CatVTONPix2PixPipeline
            from utils import compute_vae_encodings, prepare_image, resize_and_crop, resize_and_padding

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
            self._prepare_image = prepare_image
            self._compute_vae_encodings = compute_vae_encodings
            self._randn_tensor = randn_tensor
            self.status = "ready"
            print(
                f"[model] tayyor ({time.time() - t0:.0f} s): preset {self.args.preset}, "
                f"{self.args.height}x{self.args.width}, {self.args.steps} qadam, progressiv oqim yoqilgan",
                flush=True,
            )
        except Exception as e:  # noqa: BLE001 - holat /health orqali ko'rsatiladi
            self.status, self.error = "error", str(e)
            print(f"[model] XATO: {e}", flush=True)

    def run(
        self,
        person: Image.Image,
        garment: Image.Image,
        steps: int,
        seed: int,
        on_preview: PreviewFn | None = None,
    ) -> Image.Image:
        size = (self.args.width, self.args.height)
        preview_at = {max(1, round(steps * f)) for f in PREVIEW_FRACTIONS} if on_preview else set()

        if self.args.mock:
            out = person.convert("RGB").resize(size)
            g = garment.convert("RGB").resize((size[0] // 2, size[1] // 2))
            out.paste(g, (size[0] // 4, size[1] // 5))
            for step in sorted(preview_at):
                time.sleep(0.4)
                on_preview(step, out.filter(ImageFilter.GaussianBlur(radius=12 * (1 - step / steps))))
            time.sleep(0.4)
            return out

        with self.lock:
            try:
                person = self._resize_and_crop(person, size)
                garment = self._resize_and_padding(garment, size)
                # NSFW filtri faqat asl quvurda bor: yoqilgan bo'lsa oraliq ko'rinishlarsiz ishlaymiz
                if self.args.safety or not on_preview:
                    generator = self._torch.Generator(device=self.device).manual_seed(seed)
                    return self.pipeline(
                        image=person, condition_image=garment, num_inference_steps=steps,
                        guidance_scale=2.5, height=self.args.height, width=self.args.width, generator=generator,
                    )[0]
                return self._run_progressive(person, garment, steps, seed, preview_at, on_preview)
            finally:
                if self.device == "cuda":
                    self._torch.cuda.empty_cache()

    def _decode(self, latents) -> Image.Image:
        """Birlashtirilgan latentdan (odam | kiyim) odam qismini rasmga aylantiradi."""
        torch, p = self._torch, self.pipeline
        latents = latents.split(latents.shape[-1] // 2, dim=-1)[0]
        latents = latents / p.vae.config.scaling_factor
        image = p.vae.decode(latents.to(self.device, dtype=p.weight_dtype)).sample
        image = (image / 2 + 0.5).clamp(0, 1)[0].permute(1, 2, 0).float().cpu().numpy()
        return Image.fromarray((image * 255).round().astype("uint8"))

    def _run_progressive(self, person, garment, steps, seed, preview_at, on_preview) -> Image.Image:
        """
        CatVTONPix2PixPipeline.__call__ bilan bir xil tsikl (CatVTON 7818397), faqat ba'zi qadamlarda
        DDIM'ning taxminiy yakuniy rasmi (pred_original_sample) dekodlanib, oraliq ko'rinish sifatida yuboriladi.
        Natija oddiy chaqiruv bilan bir xil, qo'shimcha xarajat faqat bir necha VAE dekodlash.
        """
        torch, p = self._torch, self.pipeline
        guidance_scale = 2.5
        with torch.no_grad():
            generator = torch.Generator(device=self.device).manual_seed(seed)
            image = self._prepare_image(person).to(self.device, dtype=p.weight_dtype)
            condition = self._prepare_image(garment).to(self.device, dtype=p.weight_dtype)
            image_latent = self._compute_vae_encodings(image, p.vae)
            condition_latent = self._compute_vae_encodings(condition, p.vae)
            del image, condition
            concat = torch.cat([image_latent, condition_latent], dim=-1)
            latents = self._randn_tensor(concat.shape, generator=generator, device=concat.device, dtype=p.weight_dtype)
            p.noise_scheduler.set_timesteps(steps, device=self.device)
            latents = latents * p.noise_scheduler.init_noise_sigma
            concat = torch.cat([torch.cat([image_latent, torch.zeros_like(condition_latent)], dim=-1), concat])
            extra = p.prepare_extra_step_kwargs(generator, 1.0)

            for i, t in enumerate(p.noise_scheduler.timesteps):
                model_input = p.noise_scheduler.scale_model_input(torch.cat([latents] * 2), t)
                noise_pred = p.unet(torch.cat([model_input, concat], dim=1), t.to(self.device),
                                    encoder_hidden_states=None, return_dict=False)[0]
                uncond, cond = noise_pred.chunk(2)
                noise_pred = uncond + guidance_scale * (cond - uncond)
                out = p.noise_scheduler.step(noise_pred, t, latents, **extra)
                latents = out.prev_sample
                step = i + 1
                if step in preview_at and step < steps and getattr(out, "pred_original_sample", None) is not None:
                    on_preview(step, self._decode(out.pred_original_sample))

            return self._decode(latents)


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
        # Server imkoniyatlari: ilova eski serverni aniqlashi uchun
        "version": 2,
        "stream": True,
    }


def ensure_ready() -> None:
    if engine.status == "loading":
        raise HTTPException(503, "Model hali yuklanmoqda")
    if engine.status == "error":
        raise HTTPException(500, f"Model yuklanmadi: {engine.error}")


def to_b64(image: Image.Image, quality: int = 90) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def describe_failure(e: Exception) -> tuple[int, str]:
    if "out of memory" in str(e).lower():
        return 507, "GPU xotirasi yetmadi: serverni --preset tez yoki --height 640 --width 480 bilan ishga tushiring"
    return 500, f"Kiyintirishda xato: {e}"


@app.post("/tryon")
def tryon(req: TryOnRequest):
    ensure_ready()
    person, garment = decode_image(req.person), decode_image(req.garment)
    steps = max(10, min(50, req.steps or args.steps))
    t0 = time.time()
    try:
        result = engine.run(person, garment, steps, req.seed)
    except Exception as e:  # noqa: BLE001
        status, detail = describe_failure(e)
        raise HTTPException(status, detail) from e
    print(f"[tryon] {req.category}, {steps} qadam, {time.time() - t0:.1f} s", flush=True)
    return {"image": to_b64(result), "seconds": round(time.time() - t0, 1)}


@app.post("/tryon/stream")
def tryon_stream(req: TryOnRequest):
    """
    NDJSON oqimi: avval oraliq ko'rinishlar {"type":"preview","step","total","image"},
    oxirida {"type":"result","image","seconds"} yoki {"type":"error","status","detail"}.
    """
    ensure_ready()
    person, garment = decode_image(req.person), decode_image(req.garment)
    steps = max(10, min(50, req.steps or args.steps))
    events: queue.Queue = queue.Queue()

    def work() -> None:
        t0 = time.time()
        try:
            def on_preview(step: int, img: Image.Image) -> None:
                events.put({"type": "preview", "step": step, "total": steps, "image": to_b64(img, quality=75)})

            result = engine.run(person, garment, steps, req.seed, on_preview=on_preview)
            seconds = round(time.time() - t0, 1)
            print(f"[tryon] {req.category}, {steps} qadam (oqim), {seconds} s", flush=True)
            events.put({"type": "result", "image": to_b64(result), "seconds": seconds})
        except Exception as e:  # noqa: BLE001
            status, detail = describe_failure(e)
            events.put({"type": "error", "status": status, "detail": detail})
        finally:
            events.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while (item := events.get()) is not None:
            yield json.dumps(item) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


def port_is_free(host: str, port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
            return True
        except OSError:
            return False


if __name__ == "__main__":
    # Eski server oynasi ochiq qolgan bo'lsa, yangisi ishga tushmaydi va so'rovlarga eskisi javob beradi
    if not port_is_free(args.host, args.port):
        print(
            f"XATO: {args.port}-port band: eski server hali ishlayapti (oynasi yopilgan bo'lsa ham fonda qolishi mumkin). "
            f"stop.bat ni ishga tushiring, keyin start.bat ni qayta ishga tushiring.",
            flush=True,
        )
        sys.exit(1)
    threading.Thread(target=engine.load, daemon=True).start()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
