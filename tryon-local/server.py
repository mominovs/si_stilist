"""
SI Stilist uchun lokal virtual kiyintirish serveri (CatVTON).

Ikki rejim:
- mask (standart): MediaPipe kiyim niqobini yasaydi, model faqat niqob ichini chizadi. Yuz, soch, qo'llar va fon
  asl suratdan pikselma-piksel qaytariladi. Yaroqsiz surat (odam yo'q, juda yaqin) 422 bilan rad etiladi.
- maskfree: niqobsiz model (butun suratni qayta chizadi, yaqin portret va murakkab pozalarda buziladi).

Xaridor surati faqat xotirada qayta ishlanadi: diskka yozilmaydi va internetga chiqmaydi.
Model og'irliklari birinchi ishga tushishda Hugging Face'dan yuklanadi (~4-5 GB), keyin keshdan olinadi.

Ishga tushirish:
    python server.py                      # standart: --preset orta (768x576, 40 qadam), bf16, port 8001
    python server.py --preset sifat       # 1024x768, 50 qadam (sekinroq, ko'proq GPU xotira)
    python server.py --preset tez         # 768x576, 20 qadam (tezroq)
    python server.py --height 640 --width 480   # GPU xotirasi yetmasa
    python server.py --mode maskfree      # eski niqobsiz rejim
    python server.py --mock               # modelsiz sinov rejimi (GPU kerak emas, niqob va tekshiruv ishlaydi)

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
MODELS_DIR = HERE / "models"
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

# Rejim bo'yicha standart modellar (CatVTON 7818397 ilovasidagi bilan bir xil)
MODES = {
    "mask": {"base": "booksforcharlie/stable-diffusion-inpainting", "weights": "zhengchong/CatVTON"},
    "maskfree": {"base": "timbrooks/instruct-pix2pix", "weights": "zhengchong/CatVTON-MaskFree"},
}


class PhotoError(Exception):
    """Surat yaroqsiz (masker.PhotoError bilan bir xil vazifa, mediapipe o'rnatilmagan bo'lsa ham import qilinadi)."""


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
    p.add_argument("--mode", choices=list(MODES), default="mask",
                   help="mask: faqat kiyim qismi o'zgaradi (tavsiya); maskfree: butun surat qayta chiziladi")
    p.add_argument("--base-model", default=None)
    p.add_argument("--weights", default=None)
    p.add_argument("--mock", action="store_true", help="Modelsiz sinov rejimi: kiyimni surat ustiga qo'yadi")
    a = p.parse_args()
    preset = PRESETS[a.preset]
    a.height = a.height or preset["height"]
    a.width = a.width or preset["width"]
    a.steps = a.steps or preset["steps"]
    a.base_model = a.base_model or MODES[a.mode]["base"]
    a.weights = a.weights or MODES[a.mode]["weights"]
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
        self.masker = None
        self.mask_lock = threading.Lock()
        self._torch = None
        self._prepare_image = None
        self._prepare_mask_image = None
        self._compute_vae_encodings = None
        self._randn_tensor = None

    def _load_masker(self) -> None:
        try:
            from masker import ClothMasker
        except ImportError as e:
            raise RuntimeError("mediapipe o'rnatilmagan: setup.bat ni qayta ishga tushiring (yoki --mode maskfree)") from e
        self.masker = ClothMasker(MODELS_DIR)
        print("[model] kiyim niqobi (MediaPipe) tayyor", flush=True)

    def load(self) -> None:
        if self.args.mock:
            try:
                if self.args.mode == "mask":
                    self._load_masker()
            except Exception as e:  # noqa: BLE001
                self.status, self.error = "error", str(e)
                print(f"[model] XATO: {e}", flush=True)
                return
            self.status, self.device = "ready", "mock"
            print(f"[model] mock rejim ({self.args.mode}): preset {self.args.preset}, {self.args.steps} qadam", flush=True)
            return
        try:
            if not CATVTON_DIR.exists():
                raise RuntimeError("CatVTON papkasi topilmadi. Avval setup.bat ni ishga tushiring.")
            sys.path.insert(0, str(CATVTON_DIR))
            import torch
            from huggingface_hub import snapshot_download
            from diffusers.utils.torch_utils import randn_tensor
            from model.pipeline import CatVTONPipeline, CatVTONPix2PixPipeline
            from utils import compute_vae_encodings, prepare_image, prepare_mask_image

            if self.device == "cuda" and not torch.cuda.is_available():
                raise RuntimeError("CUDA topilmadi: NVIDIA drayveri va CUDA'li PyTorch o'rnatilganini tekshiring.")

            if self.args.mode == "mask":
                self._load_masker()

            print(f"[model] og'irliklar yuklanmoqda ({self.args.mode} rejim, birinchi marta ~4-5 GB)...", flush=True)
            dtype = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[self.args.precision]
            t0 = time.time()
            # 6 GB GPU'ga faqat bitta quvur sig'adi: rejimga qarab bittasi yuklanadi
            if self.args.mode == "mask":
                self.pipeline = CatVTONPipeline(
                    base_ckpt=self.args.base_model,
                    attn_ckpt=self.args.weights,
                    attn_ckpt_version="mix",
                    weight_dtype=dtype,
                    device=self.device,
                    skip_safety_check=not self.args.safety,
                    use_tf32=True,
                )
            else:
                repo = snapshot_download(repo_id=self.args.weights)
                self.pipeline = CatVTONPix2PixPipeline(
                    base_ckpt=self.args.base_model,
                    attn_ckpt=repo,
                    attn_ckpt_version=find_attention_version(Path(repo)),
                    weight_dtype=dtype,
                    device=self.device,
                    skip_safety_check=not self.args.safety,
                    use_tf32=True,
                )
            self._torch = torch
            self._prepare_image = prepare_image
            self._prepare_mask_image = prepare_mask_image
            self._compute_vae_encodings = compute_vae_encodings
            self._randn_tensor = randn_tensor
            self.status = "ready"
            print(
                f"[model] tayyor ({time.time() - t0:.0f} s): {self.args.mode} rejim, preset {self.args.preset}, "
                f"{self.args.height}x{self.args.width}, {self.args.steps} qadam, progressiv oqim yoqilgan",
                flush=True,
            )
        except Exception as e:  # noqa: BLE001 - holat /health orqali ko'rsatiladi
            self.status, self.error = "error", str(e)
            print(f"[model] XATO: {e}", flush=True)

    @property
    def size(self) -> tuple[int, int]:
        return self.args.width, self.args.height

    def prepare(self, person: Image.Image, category: str) -> tuple[Image.Image, Image.Image | None]:
        """
        Suratni model o'lchamiga keltiradi va (mask rejimida) kiyim niqobini yasaydi.
        Yaroqsiz surat bo'lsa PhotoError: so'rov GPU navbatiga tushmasdan darhol rad etiladi.
        """
        person = resize_and_crop(person.convert("RGB"), self.size)
        if self.masker is None:
            return person, None
        from masker import PhotoError as MaskerPhotoError

        try:
            with self.mask_lock:  # MediaPipe obyektlari bir vaqtda bitta oqimdan chaqiriladi
                return person, self.masker(person, category)
        except MaskerPhotoError as e:
            raise PhotoError(str(e)) from e

    def run(
        self,
        person: Image.Image,
        mask: Image.Image | None,
        garment: Image.Image,
        steps: int,
        seed: int,
        on_preview: PreviewFn | None = None,
    ) -> Image.Image:
        """person va mask prepare() dan keladi. Natija niqob bo'yicha asl suratga qayta yopishtiriladi."""
        size = self.size
        preview_at = {max(1, round(steps * f)) for f in PREVIEW_FRACTIONS} if on_preview else set()
        # Niqob chegarasi yumshatiladi: kiyim va asl surat orasida chok ko'rinmasin
        soft = mask.filter(ImageFilter.GaussianBlur(radius=max(2, size[0] // 96))) if mask is not None else None

        def repaint(img: Image.Image) -> Image.Image:
            return Image.composite(img.convert("RGB").resize(size), person, soft) if soft is not None else img

        def preview(step: int, img: Image.Image) -> None:
            on_preview(step, repaint(img))

        if self.args.mock:
            out = person.copy()
            g = resize_and_padding(garment.convert("RGB"), (size[0] // 2, size[1] // 2))
            out.paste(g, (size[0] // 4, size[1] // 5))
            for step in sorted(preview_at):
                time.sleep(0.4)
                preview(step, out.filter(ImageFilter.GaussianBlur(radius=12 * (1 - step / steps))))
            time.sleep(0.4)
            return repaint(out)

        with self.lock:
            try:
                garment = resize_and_padding(garment.convert("RGB"), size)
                # NSFW filtri faqat asl quvurda bor: yoqilgan bo'lsa oraliq ko'rinishlarsiz ishlaymiz
                if self.args.safety or not on_preview:
                    generator = self._torch.Generator(device=self.device).manual_seed(seed)
                    extra = {"mask": mask} if mask is not None else {}
                    return repaint(self.pipeline(
                        image=person, condition_image=garment, num_inference_steps=steps,
                        guidance_scale=2.5, height=size[1], width=size[0], generator=generator, **extra,
                    )[0])
                return repaint(self._run_progressive(person, mask, garment, steps, seed, preview_at, preview))
            finally:
                if self.device == "cuda":
                    self._torch.cuda.empty_cache()

    def _decode(self, latents, concat_dim: int) -> Image.Image:
        """Birlashtirilgan latentdan (odam | kiyim) odam qismini rasmga aylantiradi."""
        p = self.pipeline
        latents = latents.split(latents.shape[concat_dim] // 2, dim=concat_dim)[0]
        latents = latents / p.vae.config.scaling_factor
        image = p.vae.decode(latents.to(self.device, dtype=p.weight_dtype)).sample
        image = (image / 2 + 0.5).clamp(0, 1)[0].permute(1, 2, 0).float().cpu().numpy()
        return Image.fromarray((image * 255).round().astype("uint8"))

    def _run_progressive(self, person, mask, garment, steps, seed, preview_at, on_preview) -> Image.Image:
        """
        CatVTONPipeline / CatVTONPix2PixPipeline.__call__ bilan bir xil tsikl (CatVTON 7818397), faqat ba'zi
        qadamlarda DDIM'ning taxminiy yakuniy rasmi (pred_original_sample) dekodlanib, oraliq ko'rinish sifatida
        yuboriladi. Natija oddiy chaqiruv bilan bir xil, qo'shimcha xarajat faqat bir necha VAE dekodlash.
        """
        torch, p = self._torch, self.pipeline
        guidance_scale = 2.5
        with torch.no_grad():
            generator = torch.Generator(device=self.device).manual_seed(seed)
            image = self._prepare_image(person).to(self.device, dtype=p.weight_dtype)
            condition = self._prepare_image(garment).to(self.device, dtype=p.weight_dtype)
            condition_latent = self._compute_vae_encodings(condition, p.vae)

            if mask is not None:
                # Niqobli model: kiyimli qism o'chirilgan surat + niqob, kiyim pastiga (y o'qi) qo'shiladi
                dim = -2
                mask_t = self._prepare_mask_image(mask).to(self.device, dtype=p.weight_dtype)
                masked_latent = self._compute_vae_encodings(image * (mask_t < 0.5), p.vae)
                mask_latent = torch.nn.functional.interpolate(mask_t, size=masked_latent.shape[-2:], mode="nearest")
                cond = torch.cat([masked_latent, condition_latent], dim=dim)
                mask_concat = torch.cat([mask_latent, torch.zeros_like(mask_latent)], dim=dim)
                uncond = torch.cat([masked_latent, torch.zeros_like(condition_latent)], dim=dim)
                extra_inputs = torch.cat([torch.cat([mask_concat] * 2), torch.cat([uncond, cond])], dim=1)
                del mask_t
            else:
                # Niqobsiz model: butun surat, kiyim o'ng tomonga (x o'qi) qo'shiladi
                dim = -1
                image_latent = self._compute_vae_encodings(image, p.vae)
                cond = torch.cat([image_latent, condition_latent], dim=dim)
                uncond = torch.cat([image_latent, torch.zeros_like(condition_latent)], dim=dim)
                extra_inputs = torch.cat([uncond, cond])
            del image, condition

            latents = self._randn_tensor(cond.shape, generator=generator, device=cond.device, dtype=p.weight_dtype)
            p.noise_scheduler.set_timesteps(steps, device=self.device)
            latents = latents * p.noise_scheduler.init_noise_sigma
            extra = p.prepare_extra_step_kwargs(generator, 1.0)

            for i, t in enumerate(p.noise_scheduler.timesteps):
                model_input = p.noise_scheduler.scale_model_input(torch.cat([latents] * 2), t)
                noise_pred = p.unet(torch.cat([model_input, extra_inputs], dim=1), t.to(self.device),
                                    encoder_hidden_states=None, return_dict=False)[0]
                noise_uncond, noise_cond = noise_pred.chunk(2)
                noise_pred = noise_uncond + guidance_scale * (noise_cond - noise_uncond)
                out = p.noise_scheduler.step(noise_pred, t, latents, **extra)
                latents = out.prev_sample
                step = i + 1
                if step in preview_at and step < steps and getattr(out, "pred_original_sample", None) is not None:
                    on_preview(step, self._decode(out.pred_original_sample, dim))

            return self._decode(latents, dim)


def resize_and_crop(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Markazdan kesib o'lchamga keltiradi (CatVTON utils bilan bir xil, mock rejimda ham kerak)."""
    w, h = image.size
    tw, th = size
    if w / h < tw / th:
        nw, nh = w, w * th // tw
    else:
        nw, nh = h * tw // th, h
    image = image.crop(((w - nw) // 2, (h - nh) // 2, (w + nw) // 2, (h + nh) // 2))
    return image.resize(size, Image.LANCZOS)


def resize_and_padding(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Kiyim rasmini kesmasdan, oq fon bilan to'ldirib o'lchamga keltiradi (CatVTON utils bilan bir xil)."""
    w, h = image.size
    tw, th = size
    if w / h < tw / th:
        nw, nh = w * th // h, th
    else:
        nw, nh = tw, h * tw // w
    image = image.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", size, (255, 255, 255))
    canvas.paste(image, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


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
        "mode": args.mode,
        # Server imkoniyatlari: ilova eski serverni aniqlashi uchun
        "version": 3,
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


def prepare_or_reject(req: "TryOnRequest") -> tuple[Image.Image, Image.Image | None, Image.Image, int]:
    """Rasmlarni ochadi va suratni tekshiradi. Yaroqsiz surat: 422 va xaridorga tushunarli sabab."""
    person, garment = decode_image(req.person), decode_image(req.garment)
    try:
        person, mask = engine.prepare(person, req.category)
    except PhotoError as e:
        print(f"[tryon] surat rad etildi: {e}", flush=True)
        raise HTTPException(422, str(e)) from e
    return person, mask, garment, max(10, min(50, req.steps or args.steps))


def describe_failure(e: Exception) -> tuple[int, str]:
    if "out of memory" in str(e).lower():
        return 507, "GPU xotirasi yetmadi: serverni --preset tez yoki --height 640 --width 480 bilan ishga tushiring"
    return 500, f"Kiyintirishda xato: {e}"


@app.post("/tryon")
def tryon(req: TryOnRequest):
    ensure_ready()
    person, mask, garment, steps = prepare_or_reject(req)
    t0 = time.time()
    try:
        result = engine.run(person, mask, garment, steps, req.seed)
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
    person, mask, garment, steps = prepare_or_reject(req)
    events: queue.Queue = queue.Queue()

    def work() -> None:
        t0 = time.time()
        try:
            def on_preview(step: int, img: Image.Image) -> None:
                events.put({"type": "preview", "step": step, "total": steps, "image": to_b64(img, quality=75)})

            result = engine.run(person, mask, garment, steps, req.seed, on_preview=on_preview)
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
