"""
SI Stilist uchun lokal virtual kiyintirish serveri (CatVTON).

Ikki rejim:
- mask (standart): MediaPipe kiyim niqobini yasaydi, model faqat niqob ichini chizadi. Yuz, soch, qo'llar va fon
  asl suratdan pikselma-piksel qaytariladi. Yaroqsiz surat (odam yo'q, juda yaqin) 422 bilan rad etiladi.
- maskfree: niqobsiz model (butun suratni qayta chizadi, yaqin portret va murakkab pozalarda buziladi).

Xaridor surati faqat xotirada qayta ishlanadi: diskka yozilmaydi va internetga chiqmaydi.
Model og'irliklari birinchi ishga tushishda Hugging Face'dan yuklanadi (~4-5 GB), keyin keshdan olinadi.

Ishga tushirish:
    python server.py                      # standart: --preset orta (768x576, 50 qadam), bf16, port 8001
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
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse
from PIL import Image, ImageFilter
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
CATVTON_DIR = HERE / "CatVTON"
# Jonli oyna (DM-VTON) model kodi: mualliflar demosi (setup.bat klonlaydi)
KISEKLOSET_DIR = HERE / "KiseKloset"
MODELS_DIR = HERE / "models"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
# Natija asl surat o'lchamida qaytariladi (yuz va fon tiniq qoladi), lekin bundan katta bo'lmaydi
MAX_OUTPUT_SIDE = 1600

# tez: demo uchun eng tez; orta: 6 GB GPU uchun muvozanat; sifat: model o'qitilgan o'lcham (GPU xotirasi ko'proq kerak)
PRESETS = {
    "tez": {"height": 768, "width": 576, "steps": 20},
    "orta": {"height": 768, "width": 576, "steps": 50},
    "sifat": {"height": 1024, "width": 768, "steps": 50},
}

# Oraliq ko'rinishlar shu ulushlarda yuboriladi (50 qadamda: 12, 25, 38), oxirida yakuniy natija
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
    p.add_argument("--no-mirror", action="store_true", help="Jonli oyna (DM-VTON) yuklanmasin")
    a = p.parse_args()
    preset = PRESETS[a.preset]
    a.height = a.height or preset["height"]
    a.width = a.width or preset["width"]
    a.steps = a.steps or preset["steps"]
    a.base_model = a.base_model or MODES[a.mode]["base"]
    a.weights = a.weights or MODES[a.mode]["weights"]
    return a


@dataclass
class Job:
    """Bitta kiyintirish uchun tayyorlangan ma'lumot (prepare -> run)."""

    person: Image.Image  # model o'lchamidagi kesim
    mask: Image.Image | None = None  # kesimdagi kiyim niqobi (mask rejimi)
    full: Image.Image | None = None  # asl surat (natija shunga yopishtiriladi)
    soft: Image.Image | None = None  # asl o'lchamdagi yumshoq niqob
    full_mask: Image.Image | None = None  # asl o'lchamdagi niqob
    background: object | None = None  # asl suratdagi fon xaritasi (numpy bool)
    shoulder: float = 0.0  # yelka kengligi, piksel (gavda o'lchami)
    box: tuple[int, int, int, int] | None = None  # kesim chegarasi asl suratda (tashqariga chiqishi mumkin)


def fit_box(box: tuple[int, int, int, int], image_size: tuple[int, int], margin: float, aspect: float) -> tuple[int, int, int, int]:
    """
    Odam chegarasini biroz kengaytiradi, eni/bo'yi nisbatini aspect (w/h) ga keltiradi va iloji boricha surat
    ichiga suradi. Odam kadr chetiga tegib turgan tomonda kesim kadrdan biroz tashqariga chiqadi.
    """
    x0, y0, x1, y1 = box
    w, h = image_size
    pad = margin * max(x1 - x0, y1 - y0)
    x0, y0 = (x0 - pad if x0 > 2 else 0), (y0 - pad if y0 > 2 else 0)
    x1, y1 = (x1 + pad if x1 < w - 2 else w), (y1 + pad if y1 < h - 2 else h)
    bw, bh = x1 - x0, y1 - y0
    if bw / bh < aspect:
        bw = bh * aspect
    else:
        bh = bw / aspect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    def place(center: float, length: float, limit: int) -> int:
        start = center - length / 2
        if length <= limit:
            start = min(max(start, 0), limit - length)
        return round(start)

    left, top = place(cx, bw, w), place(cy, bh, h)
    right, bottom = left + round(bw), top + round(bh)

    # Odam tegib turgan kadr cheti kesim chetiga to'g'ri kelmasin: model rasm chekkasida rangli chiziq chizadi.
    # Kesim o'sha tomonda kadrdan biroz tashqariga chiqariladi (chekka piksellar bilan to'ldiriladi)
    e = round(0.04 * max(bw, bh))
    if box[0] <= 2:
        left = min(left, -e)
    if box[1] <= 2:
        top = min(top, -e)
    if box[2] >= w - 2:
        right = max(right, w + e)
    if box[3] >= h - 2:
        bottom = max(bottom, h + e)
    bw, bh = right - left, bottom - top
    if bw / bh < aspect:
        grow = round(bh * aspect) - bw
        left, right = left - grow // 2, right + grow - grow // 2
    else:
        grow = round(bw / aspect) - bh
        top, bottom = top - grow // 2, bottom + grow - grow // 2
    return left, top, right, bottom


def crop_padded(image: Image.Image, box: tuple[int, int, int, int], fill_edge: bool = True) -> Image.Image:
    """Surat chegarasidan chiqadigan kesim: tashqi qism chekka piksellar bilan (yoki 0 bilan) to'ldiriladi."""
    import numpy as np

    x0, y0, x1, y1 = box
    w, h = image.size
    arr = np.asarray(image)
    pads = ((max(0, -y0), max(0, y1 - h)), (max(0, -x0), max(0, x1 - w))) + (((0, 0),) if arr.ndim == 3 else ())
    if any(a or b for a, b in pads):
        arr = np.pad(arr, pads, mode="edge" if fill_edge else "constant")
    ox, oy = max(0, -x0), max(0, -y0)
    return Image.fromarray(arr[y0 + oy:y1 + oy, x0 + ox:x1 + ox])


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
        # Jonli oyna: off | ready | error (CatVTON'dan mustaqil, tez yuklanadi)
        self.mirror = None
        self.mirror_status = "off"
        self.mirror_error: str | None = None
        self.mirror_lock = threading.Lock()
        self.mirror_cache: dict | None = None
        self.mirror_busy = False
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

    def _load_mirror(self) -> None:
        """Jonli oyna modeli. Xato bo'lsa faqat oyna o'chadi, rasm orqali kiyintirish ishlayveradi"""
        if self.args.no_mirror:
            return
        try:
            if self.masker is None:
                self._load_masker()
            if self.args.mock:
                from mirror import MockMirror

                self.mirror = MockMirror()
            else:
                from mirror import MirrorEngine

                t0 = time.time()
                self.mirror = MirrorEngine(KISEKLOSET_DIR, MODELS_DIR, self.device)
                print(f"[oyna] jonli oyna (DM-VTON) tayyor ({time.time() - t0:.0f} s)", flush=True)
            self.mirror_status = "ready"
        except Exception as e:  # noqa: BLE001 - /health orqali ko'rsatiladi
            self.mirror_status, self.mirror_error = "error", str(e)
            print(f"[oyna] jonli oyna ishlamaydi: {e}", flush=True)

    def _mirror_analyze(self, frame: Image.Image, background_job: bool = False) -> dict:
        """Kiyim niqobi va poza (MediaPipe, CPU). Fonda ishlasa xatoni yutadi, keyingi kadr qayta urinadi"""
        from masker import PhotoError as MaskerPhotoError

        try:
            with self.mask_lock:
                mask, _, background, _ = self.masker.analyze(frame, "tops")
                points = self.masker.last_landmarks.copy()
            cache = {"t": time.time(), "size": frame.size, "mask": mask, "bg": background, "points": points}
            self.mirror_cache = cache
            return cache
        except MaskerPhotoError as e:
            self.mirror_cache = None
            if background_job:
                return {}
            raise HTTPException(422, str(e)) from e
        finally:
            if background_job:
                self.mirror_busy = False

    def mirror_frame(self, data: bytes, garment_id: str) -> bytes:
        """Bitta kamera kadri -> kiyintirilgan kadr (JPEG). Niqob fonda yangilanadi, kadr kutmaydi"""
        from mirror import compose_frame

        if self.mirror_status != "ready":
            raise HTTPException(503, f"Jonli oyna ishlamayapti: {self.mirror_error or 'yuklanmagan'}")
        if garment_id not in self.mirror.garments:
            raise HTTPException(404, "garment")
        try:
            frame = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, "Kadrni ochib bo'lmadi") from e
        if max(frame.size) > 720:
            frame.thumbnail((720, 720))

        cache = self.mirror_cache
        now = time.time()
        if not cache or cache["size"] != frame.size or now - cache["t"] > 1.0:
            # Niqob yo'q yoki eskirgan: shu kadrning o'zi bilan kutib hisoblanadi
            cache = self._mirror_analyze(frame)
        elif now - cache["t"] > 0.12 and not self.mirror_busy:
            # Niqob fonda yangilanadi, bu kadr esa oxirgi tayyor niqob bilan darhol chiqariladi
            self.mirror_busy = True
            threading.Thread(target=self._mirror_analyze, args=(frame.copy(), True), daemon=True).start()

        with self.mirror_lock:
            result = compose_frame(frame, cache["mask"], cache["bg"], cache["points"],
                                   lambda person: self.mirror.run(person, garment_id))
        buf = io.BytesIO()
        result.save(buf, format="JPEG", quality=80)
        return buf.getvalue()

    def load(self) -> None:
        if self.args.mock:
            try:
                if self.args.mode == "mask":
                    self._load_masker()
                self._load_mirror()
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
            # Oyna kichik (~40 MB): CatVTON yuklanayotganda ham ishlay boshlaydi
            self._load_mirror()

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

    def prepare(self, person: Image.Image, category: str) -> Job:
        """
        mask rejimi: niqob asl suratda yasaladi, keyin odam atrofidan kesib olinib model o'lchamiga keltiriladi
        (uzoqdan olingan suratda ham kiyimga ko'proq piksel tushadi). Natija keyin asl suratga qaytariladi.
        Yaroqsiz surat bo'lsa PhotoError: so'rov GPU navbatiga tushmasdan darhol rad etiladi.
        """
        person = person.convert("RGB")
        if self.masker is None:
            return Job(person=resize_and_crop(person, self.size))
        from masker import PhotoError as MaskerPhotoError

        scale = min(1.0, MAX_OUTPUT_SIDE / max(person.size))
        if scale < 1:
            person = person.resize((round(person.width * scale), round(person.height * scale)), Image.LANCZOS)
        try:
            with self.mask_lock:  # MediaPipe obyektlari bir vaqtda bitta oqimdan chaqiriladi
                mask, body, background, shoulder = self.masker.analyze(person, category)
        except MaskerPhotoError as e:
            raise PhotoError(str(e)) from e

        box = fit_box(body, person.size, margin=0.04, aspect=self.size[0] / self.size[1])
        crop = crop_padded(person, box, fill_edge=True).resize(self.size, Image.LANCZOS)
        # Kadr chetidan tashqariga chiqqan joyda niqob chetdagidek davom etadi: aks holda model kadr chegarasida
        # "bu yer o'zgarmaydi" deb chiziq chizadi (kesim baribir keyin olib tashlanadi)
        crop_mask = crop_padded(mask, box, fill_edge=True).resize(self.size, Image.NEAREST)
        # Niqob chegarasi yumshatiladi: kiyim va asl surat orasida chok ko'rinmasin
        soft = mask.filter(ImageFilter.GaussianBlur(radius=max(2, max(person.size) // 160)))
        return Job(person=crop, mask=crop_mask, full=person, soft=soft, box=box, full_mask=mask, background=background,
                   shoulder=shoulder)

    def compose(self, job: Job, img: Image.Image) -> Image.Image:
        """Model natijasini (kesim) asl suratga qaytaradi: niqobdan tashqarisi pikselma-piksel asl surat."""
        if job.full is None:
            return img
        x0, y0, x1, y1 = job.box
        layer = job.full.copy()
        layer.paste(img.convert("RGB").resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
        return Image.composite(layer, job.full, job.soft)

    def refine(self, job: Job, img: Image.Image) -> Image.Image:
        """
        Yangi kiyim eskisidan tor bo'lsa, model ortib qolgan joyga fonni o'zi chizadi va u xira "hoshiya" bo'lib
        ko'rinadi. Natijada fon deb aniqlangan, asl suratda esa kiyim bo'lgan chekka chiziq atrofdagi asl fondan
        silliq to'ldiriladi. Xato bo'lsa natija o'zgarishsiz qaytadi.
        """
        if job.background is None or self.masker is None:
            return img
        try:
            import cv2
            import numpy as np

            with self.mask_lock:
                seg = self.masker.segment(img)
            arr = np.asarray(img.convert("RGB"))
            h, w = arr.shape[:2]
            mask = np.asarray(job.full_mask) > 127
            # Manba: model tegmagan asl fon (niqobdan tashqarida)
            bg = job.background & ~mask
            # Faqat asl fonga yaqin chekka: kiyim o'rtasidagi qorong'i joy fon deb adashilsa ham tegilmaydi
            dist = cv2.distanceTransform((~bg).astype(np.uint8), cv2.DIST_L2, 3)
            # Chiziq kengligi gavdaga nisbatan: uzoqdan olingan suratda kadrga nisbatan olinsa, qo'l butunlay
            # "fon" bo'lib surtilib ketardi
            near = mask & (dist < max(3.0, 0.1 * job.shoulder))
            if not near.any() or not bg.any():
                return img
            # Har bir piksel eng yaqin asl fon pikseli rangini oladi (uzoqdagi ranglar aralashmaydi), keyin silliqlanadi
            scale = min(1.0, 480 / max(h, w))
            sw_, sh_ = max(1, round(w * scale)), max(1, round(h * scale))
            small = cv2.resize(arr, (sw_, sh_), interpolation=cv2.INTER_AREA)
            small_bg = cv2.resize(bg.astype(np.uint8), (sw_, sh_), interpolation=cv2.INTER_NEAREST) > 0
            if not small_bg.any():
                return img
            _, labels = cv2.distanceTransformWithLabels(
                (~small_bg).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL
            )
            coords = np.argwhere(small_bg)  # yorliqlar fon piksellariga qator tartibida 1 dan beriladi
            nearest = coords[np.clip(labels - 1, 0, len(coords) - 1)]
            filled = small[nearest[..., 0], nearest[..., 1]]
            filled = cv2.GaussianBlur(filled, (0, 0), 2.5)
            filled = cv2.resize(filled, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)

            # Hoshiyani segmentator ko'pincha "kiyim" deb biladi, shuning uchun rang ham tekshiriladi: piksel yangi
            # kiyim rangidan ko'ra atrofdagi fonga ancha yaqin bo'lsa, u ham hoshiya hisoblanadi
            smooth = cv2.GaussianBlur(arr, (0, 0), max(1.0, max(h, w) / 300)).astype(np.float32)
            d_bg = np.linalg.norm(smooth - filled, axis=-1)
            core = mask & (seg == 4) & (dist > 0.3 * job.shoulder)
            bglike = np.zeros_like(mask)
            if core.sum() > 100:
                garment = np.median(smooth[core], axis=0)
                d_garment = np.linalg.norm(smooth - garment, axis=-1)
                # Teri, yuz va soch hech qachon fon bilan almashtirilmaydi (teri rangi ko'pincha fonga yaqin)
                bglike = (d_bg < 0.6 * d_garment) & (d_bg < 35) & np.isin(seg, (4, 5))
            # Fon deb aniqlangan piksel ham fonga rang jihatdan yaqin bo'lishi shart: segmentator adashsa ham
            # model chizgan kamar, qo'l va boshqa narsalar asl fon bilan almashtirilmaydi
            band = near & (((seg == 0) & (d_bg < 60)) | bglike)
            kernel = np.ones((3, 3), np.uint8)
            band = cv2.morphologyEx(band.astype(np.uint8), cv2.MORPH_OPEN, kernel)
            band = cv2.morphologyEx(band, cv2.MORPH_CLOSE, kernel).astype(bool) & mask
            if band.mean() < 0.001:
                return img
            alpha = cv2.GaussianBlur(band.astype(np.float32), (0, 0), max(1.0, max(h, w) / 400))[..., None]
            out = arr.astype(np.float32) * (1 - alpha) + filled * alpha
            print(f"[tryon] chekka tozalandi: {band.mean() * 100:.1f}% piksel", flush=True)
            return Image.fromarray(out.round().clip(0, 255).astype(np.uint8))
        except Exception as e:  # noqa: BLE001
            print(f"[tryon] chekkani tozalab bo'lmadi: {e}", flush=True)
            return img

    def run(self, job: Job, garment: Image.Image, steps: int, seed: int, on_preview: PreviewFn | None = None) -> Image.Image:
        size = self.size
        person, mask = job.person, job.mask
        preview_at = {max(1, round(steps * f)) for f in PREVIEW_FRACTIONS} if on_preview else set()

        def preview(step: int, img: Image.Image) -> None:
            on_preview(step, self.compose(job, img))

        if self.args.mock:
            out = person.copy()
            g = resize_and_padding(garment.convert("RGB"), (size[0] // 2, size[1] // 2))
            out.paste(g, (size[0] // 4, size[1] // 5))
            for step in sorted(preview_at):
                time.sleep(0.4)
                preview(step, out.filter(ImageFilter.GaussianBlur(radius=12 * (1 - step / steps))))
            time.sleep(0.4)
            return self.refine(job, self.compose(job, out))

        with self.lock:
            try:
                garment = resize_and_padding(garment.convert("RGB"), size)
                # NSFW filtri faqat asl quvurda bor: yoqilgan bo'lsa oraliq ko'rinishlarsiz ishlaymiz
                if self.args.safety or not on_preview:
                    generator = self._torch.Generator(device=self.device).manual_seed(seed)
                    extra = {"mask": mask} if mask is not None else {}
                    return self.refine(job, self.compose(job, self.pipeline(
                        image=person, condition_image=garment, num_inference_steps=steps,
                        guidance_scale=2.5, height=size[1], width=size[0], generator=generator, **extra,
                    )[0]))
                result = self._run_progressive(person, mask, garment, steps, seed, preview_at, preview)
                return self.refine(job, self.compose(job, result))
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
        "version": 5,
        # Jonli oyna (DM-VTON): off | ready | error
        "mirror": engine.mirror_status,
        "mirror_error": engine.mirror_error,
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


def prepare_or_reject(req: "TryOnRequest") -> tuple[Job, Image.Image, int]:
    """Rasmlarni ochadi va suratni tekshiradi. Yaroqsiz surat: 422 va xaridorga tushunarli sabab."""
    person, garment = decode_image(req.person), decode_image(req.garment)
    try:
        job = engine.prepare(person, req.category)
    except PhotoError as e:
        print(f"[tryon] surat rad etildi: {e}", flush=True)
        raise HTTPException(422, str(e)) from e
    return job, garment, max(10, min(50, req.steps or args.steps))


def describe_failure(e: Exception) -> tuple[int, str]:
    if "out of memory" in str(e).lower():
        return 507, "GPU xotirasi yetmadi: serverni --preset tez yoki --height 640 --width 480 bilan ishga tushiring"
    return 500, f"Kiyintirishda xato: {e}"


@app.post("/tryon")
def tryon(req: TryOnRequest):
    ensure_ready()
    job, garment, steps = prepare_or_reject(req)
    t0 = time.time()
    try:
        result = engine.run(job, garment, steps, req.seed)
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
    job, garment, steps = prepare_or_reject(req)
    events: queue.Queue = queue.Queue()

    def work() -> None:
        t0 = time.time()
        try:
            def on_preview(step: int, img: Image.Image) -> None:
                events.put({"type": "preview", "step": step, "total": steps, "image": to_b64(img, quality=75)})

            result = engine.run(job, garment, steps, req.seed, on_preview=on_preview)
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


class GarmentRequest(BaseModel):
    id: str
    image: str


@app.post("/mirror/garment")
def mirror_garment(req: GarmentRequest):
    """Jonli oyna uchun kiyim (bir marta, keyin id bo'yicha ishlatiladi)"""
    if engine.mirror_status != "ready":
        raise HTTPException(503, f"Jonli oyna ishlamayapti: {engine.mirror_error or 'yuklanmagan'}")
    try:
        engine.mirror.set_garment(req.id[:64], decode_image(req.image))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"ok": True}


@app.post("/mirror")
async def mirror(request: Request, id: str):
    """
    Jonli oyna kadri: so'rov tanasi JPEG, javob JPEG. Kadr diskka yozilmaydi.
    422: kadrda odam yo'q / juda yaqin (sabab detail'da), 404: kiyim yuborilmagan (avval /mirror/garment).
    """
    data = await request.body()
    if not data or len(data) > 2 * 1024 * 1024:
        raise HTTPException(413, "Kadr 2 MB dan katta")
    image = await run_in_threadpool(engine.mirror_frame, data, id[:64])
    return Response(content=image, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def port_is_free(host: str, port: int) -> bool:
    """Portda ishlab turgan server bormi (ulanish qabul qilinsa band). Yaqinda yopilgan ulanishlar (TIME_WAIT)
    "band" deb hisoblanmaydi: bind orqali tekshirish ularni ham band deb ko'rsatardi"""
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) != 0


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
