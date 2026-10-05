"""
Kiyim niqobi: qaysi piksellar almashtiriladigan kiyim ekanini aniqlaydi (MediaPipe, CPU'da tez ishlaydi).

- Segmentatsiya (selfie_multiclass): fon, soch, tana terisi, yuz terisi, kiyim, aksessuar
- Poza (pose_landmarker): yelka, tirsak, bilak, son, tizza nuqtalari

Niqob faqat kiyim qismini qamraydi: yuz, soch va qo'llar (kaftlar) himoyalanadi, shuning uchun model ularni
o'zgartirmaydi. Surat yaroqsiz bo'lsa (odam yo'q, juda yaqin), tushunarli sabab bilan PhotoError tashlanadi.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

MODEL_URLS = {
    "selfie_multiclass_256x256.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
    "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    "pose_landmarker_full.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task",
}

# selfie_multiclass sinflari
BACKGROUND, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHERS = range(6)

# Poza nuqtalari (MediaPipe Pose)
L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST = 11, 12, 13, 14, 15, 16
L_HIP, R_HIP, L_KNEE, R_KNEE = 23, 24, 25, 26


class PhotoError(Exception):
    """Surat kiyintirish uchun yaroqsiz: xabar xaridorga ko'rsatiladi."""


def ensure_models(models_dir: Path) -> dict[str, Path]:
    models_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, url in MODEL_URLS.items():
        path = models_dir / name
        if not path.exists():
            print(f"[masker] {name} yuklanmoqda...", flush=True)
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)
            tmp.rename(path)
        paths[name] = path
    return paths


class ClothMasker:
    def __init__(self, models_dir: Path):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        paths = ensure_models(models_dir)
        self.segmenter = vision.ImageSegmenter.create_from_options(
            vision.ImageSegmenterOptions(
                base_options=BaseOptions(model_asset_path=str(paths["selfie_multiclass_256x256.tflite"])),
                output_category_mask=True,
            )
        )
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(paths["pose_landmarker_full.task"])),
                num_poses=1,
            )
        )

    def __call__(self, image: Image.Image, part: str = "tops") -> Image.Image:
        """part: tops | bottoms | one-pieces. Qaytadi: L rejimdagi niqob (255 = almashtiriladi)."""
        rgb = np.asarray(image.convert("RGB"))
        h, w = rgb.shape[:2]
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        seg = self.segmenter.segment(mp_image).category_mask.numpy_view().astype(np.uint8)
        if seg.shape != (h, w):
            seg = cv2.resize(seg, (w, h), interpolation=cv2.INTER_NEAREST)
        poses = self.pose.detect(mp_image).pose_landmarks
        if not poses:
            raise PhotoError("Suratda odam topilmadi. Kameraga qarab, belgacha yoki to'liq ko'rining.")
        lm = poses[0]

        def visible(i: int, th: float = 0.5) -> bool:
            p = lm[i]
            return getattr(p, "visibility", 1.0) >= th and 0 <= p.x <= 1 and 0 <= p.y <= 1

        def pt(i: int) -> tuple[int, int]:
            return int(lm[i].x * w), int(lm[i].y * h)

        face_ratio = float((seg == FACE_SKIN).mean())
        if face_ratio > 0.22:
            raise PhotoError("Kameraga juda yaqin turibsiz. Biroz uzoqlashing: yelka va belingiz ko'rinsin.")
        shoulders = [i for i in (L_SHOULDER, R_SHOULDER) if visible(i)]
        if not shoulders:
            raise PhotoError("Yelkalaringiz ko'rinmayapti. Kameradan uzoqroq turing, belgacha ko'rining.")

        shoulder_y = min(pt(i)[1] for i in shoulders)
        hips_visible = visible(L_HIP, 0.3) and visible(R_HIP, 0.3)
        hip_y = (pt(L_HIP)[1] + pt(R_HIP)[1]) // 2 if hips_visible else h
        torso = max(1, hip_y - shoulder_y)

        clothes = np.isin(seg, (CLOTHES, OTHERS))
        skin = seg == BODY_SKIN
        rows = np.arange(h)[:, None]

        if part == "bottoms":
            if not hips_visible or not (visible(L_KNEE, 0.3) or visible(R_KNEE, 0.3)):
                raise PhotoError("Shim yoki yubka uchun belingiz va tizzangiz ko'rinishi kerak. To'liq gavda bilan suratga tushing.")
            region = rows >= hip_y - int(0.12 * torso)
            mask = (clothes | skin) & region
        elif part == "one-pieces":
            region = rows >= shoulder_y - int(0.05 * torso)
            mask = (clothes | skin) & region
        else:  # tops
            # Belning biroz pastigacha (ko'ylak etagi), qo'llar terisi ham: yengi uzun/qisqa bo'lishi mumkin
            region = (rows >= shoulder_y - int(0.25 * torso)) & (rows <= hip_y + int(0.18 * torso))
            mask = (clothes | skin) & region

        mask = mask.astype(np.uint8) * 255
        k = max(3, int(0.02 * max(h, w)))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k * 2 + 1, k * 2 + 1), np.uint8))
        mask = cv2.dilate(mask, np.ones((k, k), np.uint8))

        # Himoya: yuz, soch va kaftlar hech qachon o'zgartirilmaydi
        protect = np.isin(seg, (FACE_SKIN, HAIR)).astype(np.uint8) * 255
        protect = cv2.dilate(protect, np.ones((k, k), np.uint8))
        hand_r = int(0.09 * torso) + k
        for wrist, elbow in ((L_WRIST, L_ELBOW), (R_WRIST, R_ELBOW)):
            if visible(wrist, 0.3):
                wx, wy = pt(wrist)
                ex, ey = pt(elbow)
                # Kaft markazi bilakdan tirsakka teskari yo'nalishda biroz siljigan
                cx, cy = int(wx + 0.35 * (wx - ex)), int(wy + 0.35 * (wy - ey))
                cv2.circle(protect, (cx, cy), hand_r, 255, -1)
        mask[protect > 0] = 0

        if mask.mean() < 255 * 0.03:
            raise PhotoError("Kiyimingizni aniqlab bo'lmadi. Yorug'roq joyda, to'g'ri turib suratga tushing.")
        return Image.fromarray(mask)
